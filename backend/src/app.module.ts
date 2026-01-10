import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './report/report.module';
import { IndexerModule } from './indexer/indexer.module';
import { ClassifierModule } from './classifier/classifier.module';
import { PricerModule } from './pricer/pricer.module';
import { TaxEngineModule } from './tax-engine/tax-engine.module';
import { AdvisorModule } from './advisor/advisor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    ReportModule,
    IndexerModule,
    ClassifierModule,
    PricerModule,
    TaxEngineModule,
    AdvisorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
