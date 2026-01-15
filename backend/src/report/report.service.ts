import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IndexerService } from '../indexer/indexer.service';
import { ClassifierService } from '../classifier/classifier.service';
import { PricerService } from '../pricer/pricer.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { AdvisorService } from '../advisor/advisor.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private prisma: PrismaService,
    private indexer: IndexerService,
    private classifier: ClassifierService,
    private pricer: PricerService,
    private taxEngine: TaxEngineService,
    private advisor: AdvisorService,
  ) {}

  /**
   * Create a new report job
   */
  async createReport(dto: CreateReportDto): Promise<{ jobId: string }> {
    const monthStr = dto.month ? ` month ${dto.month}` : ' (full year)';
    this.logger.log(`Creating report for ${dto.address} in year ${dto.year}${monthStr} on ${dto.network}`);

    // Check if report already exists
    const existing = await this.prisma.job.findFirst({
      where: {
        address: dto.address.toLowerCase(),
        year: dto.year,
        month: dto.month || null,
        network: dto.network,
      },
    });

    if (existing) {
      this.logger.log(`Report already exists: ${existing.id}`);
      return { jobId: existing.id };
    }

    // Create new job
    const job = await this.prisma.job.create({
      data: {
        address: dto.address.toLowerCase(),
        year: dto.year,
        month: dto.month || null,
        network: dto.network,
        stage: 'PENDING',
        progressPct: 0,
      },
    });

    // Process in background
    this.processReport(job.id).catch(error => {
      this.logger.error(`Error processing report ${job.id}: ${error.message}`);
      this.prisma.job.update({
        where: { id: job.id },
        data: {
          stage: 'ERROR',
          errors: JSON.stringify({ message: error.message }),
        },
      });
    });

    return { jobId: job.id };
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return {
      jobId: job.id,
      stage: job.stage,
      progressPct: job.progressPct,
      etaHint: job.etaHint,
      errors: job.errors ? JSON.parse(job.errors) : null,
    };
  }

  /**
   * Get report result
   */
  async getReportResult(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        report: true,
        taxEvents: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.stage !== 'DONE') {
      return {
        status: 'processing',
        stage: job.stage,
        progressPct: job.progressPct,
      };
    }

    if (!job.report) {
      throw new NotFoundException(`Report not found for job ${jobId}`);
    }

    // Get unrealized holdings (cost lots that are still held at end of reporting period)
    const holdings = await this.getUnrealizedHoldings(job.address, job.network, job.year, job.month);

    // Calculate total unrealized gain from holdings (this is the source of truth)
    const totalUnrealizedGain = holdings.reduce((sum, h) => sum + parseFloat(h.unrealizedGain), 0);

    return {
      status: 'completed',
      summary: {
        address: job.address,
        year: job.year,
        network: job.network,
        ordinaryIncome: job.report.ordinaryIncomeUsd,
        capitalGainRealized: job.report.capitalGainRealizedUsd,
        capitalGainUnrealized: totalUnrealizedGain.toFixed(2), // ✅ Use calculated value from holdings
        shortTermGain: job.report.shortTermGainUsd,
        longTermGain: job.report.longTermGainUsd,
        totalGasFee: job.report.totalGasFeeUsd,
        estimatedTaxDue: job.report.estimatedTaxDue,
        taxRates: {
          ordinaryIncome: job.report.ordinaryIncomeTaxRate,
          shortTermCg: job.report.shortTermCgRate,
          longTermCg: job.report.longTermCgRate,
        },
      },
      strategyCards: job.report.strategyCards
        ? JSON.parse(job.report.strategyCards)
        : [],
      events: job.taxEvents.map(event => ({
        id: event.id,
        txHash: event.txHash,
        timestamp: event.timestamp,
        category: event.category,
        tokenIn: event.tokenInSymbol,
        tokenInAmount: event.tokenInAmount,
        tokenInUsd: event.tokenInUsd,
        tokenOut: event.tokenOutSymbol,
        tokenOutAmount: event.tokenOutAmount,
        tokenOutUsd: event.tokenOutUsd,
        gasFeeUsd: event.gasFeeUsd,
        realizedGain: event.realizedGain,
        protocol: event.protocol,
        notes: event.notes,
      })),
      holdings,
    };
  }

  /**
   * Get unrealized holdings for an address as of the end of the reporting period
   */
  private async getUnrealizedHoldings(
    address: string,
    network: string,
    year: number,
    month: number | null
  ): Promise<any[]> {
    // Calculate end of reporting period
    let endTimestamp: Date;
    if (month) {
      // End of specific month (e.g., month=12 -> 2025-12-31 23:59:59.999)
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      endTimestamp = new Date(`${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`);
    } else {
      // End of full year (e.g., year=2025 -> 2025-12-31 23:59:59.999)
      endTimestamp = new Date(`${year + 1}-01-01`);
    }

    this.logger.log(`Calculating unrealized holdings as of ${endTimestamp.toISOString()} for address ${address}`);

    // Get cost lots that were held at the end of the reporting period
    const lots = await this.prisma.costLot.findMany({
      where: {
        address: address.toLowerCase(),
        acquiredDate: { lte: endTimestamp }, // Acquired on or before period end
        OR: [
          { disposed: false }, // Still held now
          { disposedDate: { gt: endTimestamp } } // Disposed after period end
        ],
        remainingAmount: { gt: '0' },
      },
      orderBy: { acquiredDate: 'asc' },
    });

    if (lots.length === 0) {
      return [];
    }

    const holdings: any[] = [];
    const { ethers } = await import('ethers');

    // Group lots by token for batch processing
    const lotsByToken = new Map<string, typeof lots>();
    for (const lot of lots) {
      const token = lot.tokenAddress.toLowerCase();
      if (!lotsByToken.has(token)) {
        lotsByToken.set(token, []);
      }
      lotsByToken.get(token)!.push(lot);
    }

    // Calculate unrealized gain for each token holding
    for (const [tokenAddress, tokenLots] of lotsByToken) {
      try {
        // Get current price using a simple approximation for now
        // In production, you'd fetch from an API
        const currentPrice = await this.estimateCurrentPrice(tokenAddress, tokenLots[0].tokenSymbol);

        // Skip unknown tokens (currentPrice is null)
        if (currentPrice === null) {
          this.logger.log(`Skipping unknown token ${tokenLots[0].tokenSymbol} (${tokenAddress}) from unrealized holdings`);
          continue;
        }

        // Process each lot
        for (const lot of tokenLots) {
          const remainingAmount = ethers.BigNumber.from(lot.remainingAmount);
          const originalAmount = ethers.BigNumber.from(lot.amount);
          const costBasis = parseFloat(lot.costBasisUsd);

          // Calculate proportional cost basis for remaining amount
          const remainingRatio = remainingAmount.mul(10000).div(originalAmount).toNumber() / 10000;
          const proportionalCostBasis = costBasis * remainingRatio;

          // Calculate current value using actual token decimals from database
          const decimals = lot.tokenDecimals || 18;
          const remainingTokens = parseFloat(ethers.utils.formatUnits(remainingAmount, decimals));
          const currentValue = remainingTokens * currentPrice;

          // Unrealized gain = current value - cost basis
          const unrealizedGain = currentValue - proportionalCostBasis;

          holdings.push({
            id: lot.id,
            tokenSymbol: lot.tokenSymbol,
            tokenAddress: lot.tokenAddress,
            amount: remainingTokens.toFixed(4),
            costBasis: proportionalCostBasis.toFixed(2),
            currentValue: currentValue.toFixed(2),
            unrealizedGain: unrealizedGain.toFixed(2),
            currentPrice: currentPrice.toFixed(6),
            acquiredDate: lot.acquiredDate,
            acquiredTxHash: lot.acquiredTxHash,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to calculate holdings for token ${tokenAddress}: ${error.message}. Skipping.`
        );
      }
    }

    return holdings;
  }

  /**
   * Get token decimals
   */
  private getTokenDecimals(tokenAddress: string): number {
    const TOKEN_DECIMALS: { [address: string]: number } = {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,  // USDT
      '0x4fabb145d64652a948d72533023f6e7a623c7c53': 6,  // BUSD
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,  // WBTC
    };
    return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;
  }

  /**
   * Estimate current price for a token (simplified version)
   * Returns null for unknown tokens (which will be excluded from holdings)
   */
  private async estimateCurrentPrice(tokenAddress: string, tokenSymbol: string): Promise<number | null> {
    // For native tokens, use approximate prices
    const nativeTokenPrices: { [symbol: string]: number } = {
      'ETH': 3500,
      'MNT': 1.0,
      'WETH': 3500,
    };

    if (nativeTokenPrices[tokenSymbol]) {
      return nativeTokenPrices[tokenSymbol];
    }

    // For stablecoins
    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'USDE', 'USDB'];
    if (stablecoins.includes(tokenSymbol.toUpperCase())) {
      return 1.0;
    }

    // For unknown tokens, return null to exclude them from unrealized holdings
    this.logger.warn(`Unknown token ${tokenSymbol} (${tokenAddress}), excluding from unrealized holdings`);
    return null;
  }

  /**
   * Process report through all stages
   */
  private async processReport(jobId: string): Promise<void> {
    this.logger.log(`Starting report processing for job ${jobId}`);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      // Stage 1: Fetch transactions
      await this.prisma.job.update({
        where: { id: jobId },
        data: { stage: 'FETCHING_TX', progressPct: 0 },
      });
      await this.indexer.fetchTransactions(job.address, job.year, job.month, job.network, jobId);
      await this.indexer.fetchTokenTransfers(job.address, job.year, job.month, job.network, jobId);

      // Stage 2: Classify transactions
      await this.prisma.job.update({
        where: { id: jobId },
        data: { stage: 'CLASSIFYING', progressPct: 0 },
      });
      await this.classifier.classifyTransactions(jobId);

      // Stage 3: Price events
      await this.prisma.job.update({
        where: { id: jobId },
        data: { stage: 'PRICING', progressPct: 0 },
      });
      await this.pricer.priceTaxEvents(jobId);

      // Stage 4: Calculate taxes
      await this.prisma.job.update({
        where: { id: jobId },
        data: { stage: 'CALCULATING', progressPct: 0 },
      });
      await this.taxEngine.calculateTaxes(jobId);

      // Stage 5: Generate strategies
      await this.advisor.generateStrategies(jobId);

      // Done
      await this.prisma.job.update({
        where: { id: jobId },
        data: { stage: 'DONE', progressPct: 100 },
      });

      this.logger.log(`Report processing completed for job ${jobId}`);
    } catch (error) {
      this.logger.error(`Error processing report: ${error.message}`);
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          stage: 'ERROR',
          errors: JSON.stringify({ message: error.message, stack: error.stack }),
        },
      });
      throw error;
    }
  }

  /**
   * Delete a report and all related data
   */
  async deleteReport(jobId: string): Promise<{ message: string }> {
    this.logger.log(`Deleting report ${jobId}`);

    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    // Delete job (cascade will handle Transaction, TaxEvent, and Report)
    await this.prisma.job.delete({ where: { id: jobId } });

    this.logger.log(`Deleted report ${jobId}`);
    return { message: `Report ${jobId} deleted successfully` };
  }

  /**
   * Delete all reports for a specific address
   */
  async deleteReportsByAddress(address: string): Promise<{ message: string; count: number }> {
    const normalizedAddress = address.toLowerCase();
    this.logger.log(`Deleting all reports for address ${normalizedAddress}`);

    const jobs = await this.prisma.job.findMany({
      where: { address: normalizedAddress },
    });

    // Delete all jobs (cascade will handle Transaction, TaxEvent, and Report)
    for (const job of jobs) {
      await this.prisma.job.delete({ where: { id: job.id } });
    }

    // Also delete cost lots for this address
    await this.prisma.costLot.deleteMany({ where: { address: normalizedAddress } });

    this.logger.log(`Deleted ${jobs.length} reports and cost lots for address ${normalizedAddress}`);
    return { message: `Deleted ${jobs.length} reports for address ${normalizedAddress}`, count: jobs.length };
  }
}
