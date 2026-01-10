import { Module } from '@nestjs/common';
import { ClassifierService } from './classifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  providers: [ClassifierService],
  exports: [ClassifierService],
})
export class ClassifierModule {}
