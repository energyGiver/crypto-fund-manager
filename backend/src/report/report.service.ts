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

    return {
      status: 'completed',
      summary: {
        address: job.address,
        year: job.year,
        network: job.network,
        ordinaryIncome: job.report.ordinaryIncomeUsd,
        capitalGainRealized: job.report.capitalGainRealizedUsd,
        capitalGainUnrealized: job.report.capitalGainUnrealizedUsd,
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
    };
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
