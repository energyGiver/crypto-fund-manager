import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { IndexerModule } from '../indexer/indexer.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { PricerModule } from '../pricer/pricer.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { AdvisorModule } from '../advisor/advisor.module';

@Module({
  imports: [
    IndexerModule,
    ClassifierModule,
    PricerModule,
    TaxEngineModule,
    AdvisorModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
