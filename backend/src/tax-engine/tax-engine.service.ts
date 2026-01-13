import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { TaxCategory } from '../classifier/classifier.service';
import { ethers } from 'ethers';

interface TaxSummary {
  ordinaryIncomeUsd: string;
  capitalGainRealizedUsd: string;
  shortTermGainUsd: string;
  longTermGainUsd: string;
  totalGasFeeUsd: string;
  estimatedTaxDue: string;
}

@Injectable()
export class TaxEngineService {
  private readonly logger = new Logger(TaxEngineService.name);

  // Default tax rates (can be customized)
  private readonly ORDINARY_INCOME_TAX_RATE = 0.30;
  private readonly SHORT_TERM_CG_RATE = 0.30;
  private readonly LONG_TERM_CG_RATE = 0.15;

  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
  ) {}

  /**
   * Calculate taxes for all events in a job
   */
  async calculateTaxes(jobId: string): Promise<void> {
    this.logger.log(`Calculating taxes for job ${jobId}`);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { taxEvents: { orderBy: { timestamp: 'asc' } } },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    let ordinaryIncome = 0;
    let shortTermGain = 0;
    let longTermGain = 0;
    let totalGasFee = 0;

    // Process each event
    for (const event of job.taxEvents) {
      try {
        // Calculate gas fees
        if (event.gasFeeUsd) {
          totalGasFee += parseFloat(event.gasFeeUsd);
        }

        // Process based on category
        switch (event.category) {
          case TaxCategory.AIRDROP:
          case TaxCategory.STAKING:
            // Airdrops and staking rewards are ordinary income
            if (event.tokenInUsd) {
              ordinaryIncome += parseFloat(event.tokenInUsd);

              // Create cost lot for future disposals
              await this.createCostLot(
                job.address,
                event.tokenIn!,
                event.tokenInSymbol || 'UNKNOWN',
                event.timestamp,
                event.txHash,
                event.tokenInAmount!,
                event.tokenInUsd,
              );
            }
            break;

          case TaxCategory.DISPOSAL:
            // Calculate capital gain/loss
            const gain = await this.calculateDisposalGain(
              job.address,
              event,
            );

            if (gain) {
              // Determine if short-term or long-term
              if (gain.holdingPeriod >= 365) {
                longTermGain += gain.realizedGain;
              } else {
                shortTermGain += gain.realizedGain;
              }

              // Update event with calculation results
              await this.prisma.taxEvent.update({
                where: { id: event.id },
                data: {
                  costBasis: gain.costBasis.toFixed(2),
                  proceeds: gain.proceeds.toFixed(2),
                  realizedGain: gain.realizedGain.toFixed(2),
                  holdingPeriod: gain.holdingPeriod,
                },
              });

              // Create cost lot for token received
              if (event.tokenInUsd && event.tokenIn) {
                await this.createCostLot(
                  job.address,
                  event.tokenIn,
                  event.tokenInSymbol || 'UNKNOWN',
                  event.timestamp,
                  event.txHash,
                  event.tokenInAmount!,
                  event.tokenInUsd,
                );
              }
            }
            break;

          case TaxCategory.TRANSFER:
            // For transfers, maintain cost basis
            // If receiving, we don't know the cost basis (unless self-transfer)
            // For MVP, we'll skip this complexity
            break;

          case TaxCategory.DEDUCTION:
            // Just gas fees, already counted
            break;
        }

        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            stage: 'CALCULATING',
            progressPct: Math.floor(
              (job.taxEvents.indexOf(event) / job.taxEvents.length) * 100,
            ),
          },
        });
      } catch (error) {
        this.logger.error(`Error calculating tax for event ${event.id}: ${error.message}`);
      }
    }

    // Calculate estimated tax due
    const estimatedTaxDue =
      ordinaryIncome * this.ORDINARY_INCOME_TAX_RATE +
      shortTermGain * this.SHORT_TERM_CG_RATE +
      longTermGain * this.LONG_TERM_CG_RATE;

    // Calculate unrealized gains (tokens still held)
    const unrealizedGain = await this.calculateUnrealizedGains(job.address);

    // Save report
    await this.prisma.report.create({
      data: {
        jobId,
        ordinaryIncomeUsd: ordinaryIncome.toFixed(2),
        capitalGainRealizedUsd: (shortTermGain + longTermGain).toFixed(2),
        capitalGainUnrealizedUsd: unrealizedGain.toFixed(2),
        shortTermGainUsd: shortTermGain.toFixed(2),
        longTermGainUsd: longTermGain.toFixed(2),
        totalGasFeeUsd: totalGasFee.toFixed(2),
        estimatedTaxDue: estimatedTaxDue.toFixed(2),
        ordinaryIncomeTaxRate: this.ORDINARY_INCOME_TAX_RATE,
        shortTermCgRate: this.SHORT_TERM_CG_RATE,
        longTermCgRate: this.LONG_TERM_CG_RATE,
      },
    });

    this.logger.log(`Completed tax calculation for job ${jobId}`);
  }

  /**
   * Calculate disposal gain using FIFO
   */
  private async calculateDisposalGain(
    address: string,
    event: any,
  ): Promise<{
    costBasis: number;
    proceeds: number;
    realizedGain: number;
    holdingPeriod: number;
  } | null> {
    if (!event.tokenOut || !event.tokenOutAmount) {
      return null;
    }

    const proceeds = parseFloat(event.tokenInUsd || '0');
    const amountToDispose = ethers.BigNumber.from(event.tokenOutAmount);

    // Get cost lots for this token (FIFO order)
    const lots = await this.prisma.costLot.findMany({
      where: {
        address,
        tokenAddress: event.tokenOut,
        disposed: false,
        remainingAmount: { gt: '0' },
      },
      orderBy: { acquiredDate: 'asc' },
    });

    let remainingToDispose = amountToDispose;
    let totalCostBasis = 0;
    let weightedHoldingPeriod = 0;
    let totalDisposed = ethers.BigNumber.from(0);

    // Get token decimals for proper conversion
    const tokenDecimals = this.pricing.getTokenDecimals(event.tokenOut);

    for (const lot of lots) {
      if (remainingToDispose.lte(0)) break;

      const lotRemaining = ethers.BigNumber.from(lot.remainingAmount);
      const toTakeFromLot = remainingToDispose.gt(lotRemaining)
        ? lotRemaining
        : remainingToDispose;

      // Calculate proportional cost basis
      const lotCostBasis = parseFloat(lot.costBasisUsd);
      const lotAmount = ethers.BigNumber.from(lot.amount);
      // Use BigNumber multiplication to avoid overflow
      const ratio = toTakeFromLot.mul(10000).div(lotAmount).toNumber() / 10000;
      const proportionalCost = lotCostBasis * ratio;

      totalCostBasis += proportionalCost;

      // Calculate holding period
      const holdingDays = Math.floor(
        (event.timestamp.getTime() - lot.acquiredDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      // Use formatUnits with correct decimals to safely convert to number
      const tokensDisposed = parseFloat(ethers.utils.formatUnits(toTakeFromLot, tokenDecimals));
      weightedHoldingPeriod += holdingDays * tokensDisposed;
      totalDisposed = totalDisposed.add(toTakeFromLot);

      // Update lot
      const newRemaining = lotRemaining.sub(toTakeFromLot);
      await this.prisma.costLot.update({
        where: { id: lot.id },
        data: {
          remainingAmount: newRemaining.toString(),
          disposed: newRemaining.eq(0),
          disposedDate: newRemaining.eq(0) ? event.timestamp : lot.disposedDate,
          disposedTxHash: newRemaining.eq(0) ? event.txHash : lot.disposedTxHash,
        },
      });

      remainingToDispose = remainingToDispose.sub(toTakeFromLot);
    }

    const totalDisposedTokens = parseFloat(ethers.utils.formatUnits(totalDisposed, tokenDecimals));
    const avgHoldingPeriod = totalDisposedTokens > 0
      ? Math.floor(weightedHoldingPeriod / totalDisposedTokens)
      : 0;

    // Subtract gas fees from proceeds
    const gasFee = parseFloat(event.gasFeeUsd || '0');
    const netProceeds = proceeds - gasFee;

    return {
      costBasis: totalCostBasis,
      proceeds: netProceeds,
      realizedGain: netProceeds - totalCostBasis,
      holdingPeriod: avgHoldingPeriod,
    };
  }

  /**
   * Create a cost lot for tracking basis
   */
  private async createCostLot(
    address: string,
    tokenAddress: string,
    tokenSymbol: string,
    acquiredDate: Date,
    txHash: string,
    amount: string,
    costBasisUsd: string,
  ): Promise<void> {
    await this.prisma.costLot.create({
      data: {
        address,
        tokenAddress,
        tokenSymbol,
        acquiredDate,
        acquiredTxHash: txHash,
        amount,
        costBasisUsd,
        remainingAmount: amount,
        disposed: false,
      },
    });
  }

  /**
   * Calculate unrealized gains from held positions
   */
  private async calculateUnrealizedGains(address: string): Promise<number> {
    const lots = await this.prisma.costLot.findMany({
      where: {
        address,
        disposed: false,
        remainingAmount: { gt: '0' },
      },
    });

    if (lots.length === 0) {
      return 0;
    }

    this.logger.log(`Calculating unrealized gains for ${lots.length} held positions`);

    let totalUnrealizedGain = 0;

    // Group lots by token for batch processing
    const lotsByToken = new Map<string, typeof lots>();
    for (const lot of lots) {
      const token = lot.tokenAddress.toLowerCase();
      if (!lotsByToken.has(token)) {
        lotsByToken.set(token, []);
      }
      lotsByToken.get(token)!.push(lot);
    }

    // Calculate unrealized gain for each token
    for (const [tokenAddress, tokenLots] of lotsByToken) {
      try {
        // Get current price
        const priceResult = await this.pricing.getPriceAtTime(
          tokenAddress,
          new Date(), // Current time
          'ethereum',
        );

        const currentPrice = parseFloat(priceResult.priceUsd);

        // Calculate unrealized gain for this token
        for (const lot of tokenLots) {
          const remainingAmount = ethers.BigNumber.from(lot.remainingAmount);
          const originalAmount = ethers.BigNumber.from(lot.amount);
          const costBasis = parseFloat(lot.costBasisUsd);

          // Calculate proportional cost basis for remaining amount
          // Use BigNumber multiplication to avoid overflow, then convert ratio to float
          const remainingRatio = remainingAmount.mul(10000).div(originalAmount).toNumber() / 10000;
          const proportionalCostBasis = costBasis * remainingRatio;

          // Calculate current value
          const decimals = this.pricing.getTokenDecimals(tokenAddress);
          const remainingTokens = parseFloat(ethers.utils.formatUnits(remainingAmount, decimals));
          const currentValue = remainingTokens * currentPrice;

          // Unrealized gain = current value - cost basis
          const unrealizedGain = currentValue - proportionalCostBasis;

          this.logger.debug(
            `Token ${lot.tokenSymbol}: ${remainingTokens.toFixed(4)} tokens, ` +
            `Cost basis: $${proportionalCostBasis.toFixed(2)}, ` +
            `Current value: $${currentValue.toFixed(2)}, ` +
            `Unrealized gain: $${unrealizedGain.toFixed(2)}`
          );

          totalUnrealizedGain += unrealizedGain;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get current price for token ${tokenAddress}: ${error.message}. ` +
          `Skipping unrealized gain calculation for this token.`
        );
      }
    }

    this.logger.log(`Total unrealized gains: $${totalUnrealizedGain.toFixed(2)}`);

    return totalUnrealizedGain;
  }
}
