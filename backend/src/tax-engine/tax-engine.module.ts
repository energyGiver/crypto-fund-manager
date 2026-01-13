import { Module } from '@nestjs/common';
import { TaxEngineService } from './tax-engine.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  providers: [TaxEngineService],
  exports: [TaxEngineService],
})
export class TaxEngineModule {}
