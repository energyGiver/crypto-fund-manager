import { Controller, Post, Get, Delete, Param, Body, ValidationPipe } from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('api/report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * POST /api/report
   * Create a new tax report
   */
  @Post()
  async createReport(@Body(ValidationPipe) dto: CreateReportDto) {
    return this.reportService.createReport(dto);
  }

  /**
   * GET /api/report/:jobId/status
   * Get job status and progress
   */
  @Get(':jobId/status')
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.reportService.getJobStatus(jobId);
  }

  /**
   * GET /api/report/:jobId/result
   * Get report results
   */
  @Get(':jobId/result')
  async getReportResult(@Param('jobId') jobId: string) {
    return this.reportService.getReportResult(jobId);
  }

  /**
   * DELETE /api/report/:jobId
   * Delete a report and all related data
   */
  @Delete(':jobId')
  async deleteReport(@Param('jobId') jobId: string) {
    return this.reportService.deleteReport(jobId);
  }

  /**
   * DELETE /api/report/address/:address
   * Delete all reports for a specific address
   */
  @Delete('address/:address')
  async deleteReportsByAddress(@Param('address') address: string) {
    return this.reportService.deleteReportsByAddress(address);
  }
}
