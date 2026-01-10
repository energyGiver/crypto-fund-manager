import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';

interface StrategyCard {
  title: string;
  body: string;
  estimatedSavings?: string;
  priority: 'high' | 'medium' | 'low';
  actions?: string[];
}

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generate tax-saving strategy cards
   */
  async generateStrategies(jobId: string): Promise<void> {
    this.logger.log(`Generating tax strategies for job ${jobId}`);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        report: true,
        taxEvents: true,
      },
    });

    if (!job || !job.report) {
      throw new Error(`Job or report not found for ${jobId}`);
    }

    const strategies: StrategyCard[] = [];

    // Get cost lots for loss harvesting
    const costLots = await this.prisma.costLot.findMany({
      where: {
        address: job.address,
        disposed: false,
        remainingAmount: { gt: '0' },
      },
    });

    // Strategy 1: Loss Harvesting
    const lossHarvestStrategy = await this.analyzeLossHarvesting(job.report, costLots);
    if (lossHarvestStrategy) {
      strategies.push(lossHarvestStrategy);
    }

    // Strategy 2: Short-term to Long-term
    const holdingStrategy = await this.analyzeHoldingPeriod(costLots, job.report);
    if (holdingStrategy) {
      strategies.push(holdingStrategy);
    }

    // Strategy 3: High Ordinary Income
    const incomeStrategy = this.analyzeOrdinaryIncome(job.report);
    if (incomeStrategy) {
      strategies.push(incomeStrategy);
    }

    // Strategy 4: Tax-free gain harvesting
    const gainHarvestStrategy = this.analyzeGainHarvesting(job.report);
    if (gainHarvestStrategy) {
      strategies.push(gainHarvestStrategy);
    }

    // Strategy 5: Gas fee optimization
    const gasStrategy = this.analyzeGasFees(job.report);
    if (gasStrategy) {
      strategies.push(gasStrategy);
    }

    // Save strategies to report
    await this.prisma.report.update({
      where: { id: job.report.id },
      data: {
        strategyCards: JSON.stringify(strategies),
      },
    });

    this.logger.log(`Generated ${strategies.length} strategies for job ${jobId}`);
  }

  /**
   * Analyze loss harvesting opportunities
   */
  private async analyzeLossHarvesting(
    report: any,
    costLots: any[],
  ): Promise<StrategyCard | null> {
    const realizedGain = parseFloat(report.capitalGainRealizedUsd);

    if (realizedGain <= 0) {
      return null; // No gains to offset
    }

    // Check for unrealized losses (need current prices for this)
    // For MVP, we'll suggest if there are multiple positions
    if (costLots.length > 5) {
      const potentialSavings = realizedGain * 0.3; // Assume 30% tax rate

      return {
        title: 'Tax-Loss Harvesting Opportunity',
        body: `You have realized capital gains of $${realizedGain.toFixed(2)} this year. Review your current holdings for positions with unrealized losses. Selling these positions before year-end can offset your gains and reduce your tax liability.`,
        estimatedSavings: `$${potentialSavings.toFixed(2)}`,
        priority: 'high',
        actions: [
          'Review current portfolio for unrealized losses',
          'Sell losing positions before December 31st',
          'Be aware of wash sale rules (30-day rule)',
        ],
      };
    }

    return null;
  }

  /**
   * Analyze holding period optimization
   */
  private async analyzeHoldingPeriod(
    costLots: any[],
    report: any,
  ): Promise<StrategyCard | null> {
    const shortTermGain = parseFloat(report.shortTermGainUsd);
    const longTermGain = parseFloat(report.longTermGainUsd);

    // Find positions close to long-term status
    const now = new Date();
    const almostLongTerm = costLots.filter(lot => {
      const daysHeld = Math.floor(
        (now.getTime() - new Date(lot.acquiredDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysHeld > 335 && daysHeld < 365; // Within 30 days of long-term
    });

    if (almostLongTerm.length > 0 && shortTermGain > 0) {
      const taxDifference = shortTermGain * 0.15; // 15% difference between short and long term

      return {
        title: 'Long-Term Capital Gains Approaching',
        body: `You have ${almostLongTerm.length} position(s) that will qualify for long-term capital gains treatment (15% tax rate instead of 30%) within the next 30 days. Consider waiting before selling these positions.`,
        estimatedSavings: `Up to $${taxDifference.toFixed(2)}`,
        priority: 'medium',
        actions: [
          'Review positions approaching 1-year holding period',
          'Delay sales until positions qualify for long-term rates',
          'Plan sales strategically around the 365-day mark',
        ],
      };
    }

    return null;
  }

  /**
   * Analyze ordinary income
   */
  private analyzeOrdinaryIncome(report: any): StrategyCard | null {
    const ordinaryIncome = parseFloat(report.ordinaryIncomeUsd);

    if (ordinaryIncome > 10000) {
      return {
        title: 'High Ordinary Income from Crypto',
        body: `You received $${ordinaryIncome.toFixed(2)} in ordinary income from airdrops and staking rewards. This is taxed at your regular income tax rate. Consider the timing of claiming rewards in future years to manage your tax bracket.`,
        estimatedSavings: undefined,
        priority: 'medium',
        actions: [
          'Consider tax-deferred retirement accounts for crypto investments',
          'Time reward claims strategically (early vs. late in year)',
          'Track cost basis carefully for future sales',
        ],
      };
    }

    return null;
  }

  /**
   * Analyze gain harvesting in low-tax years
   */
  private analyzeGainHarvesting(report: any): StrategyCard | null {
    const realizedGain = parseFloat(report.capitalGainRealizedUsd);
    const longTermGain = parseFloat(report.longTermGainUsd);

    // If realized gains are low or negative, suggest harvesting some gains
    if (realizedGain < 0) {
      const harvestableAmount = Math.abs(realizedGain);

      return {
        title: 'Tax-Free Gain Harvesting',
        body: `You have net capital losses of $${Math.abs(realizedGain).toFixed(2)} this year. You can realize up to this amount in gains without owing taxes, as the losses will offset them. Consider selling profitable positions and immediately repurchasing them to increase your cost basis.`,
        estimatedSavings: `$${(harvestableAmount * 0.3).toFixed(2)}`,
        priority: 'high',
        actions: [
          'Identify positions with unrealized gains',
          'Sell and repurchase to "step up" cost basis',
          'Unlike stocks, crypto is not subject to wash sale rules',
        ],
      };
    }

    return null;
  }

  /**
   * Analyze gas fee optimization
   */
  private analyzeGasFees(report: any): StrategyCard | null {
    const totalGasFees = parseFloat(report.totalGasFeeUsd);

    if (totalGasFees > 1000) {
      return {
        title: 'Gas Fee Deduction',
        body: `You paid $${totalGasFees.toFixed(2)} in gas fees this year. These fees can be deducted from your capital gains when selling crypto, reducing your taxable gains. Make sure to include all transaction fees in your tax reporting.`,
        estimatedSavings: `$${(totalGasFees * 0.3).toFixed(2)}`,
        priority: 'low',
        actions: [
          'Ensure all gas fees are properly documented',
          'Add gas fees to cost basis when selling',
          'Consider gas-efficient chains for future transactions',
        ],
      };
    }

    return null;
  }
}
