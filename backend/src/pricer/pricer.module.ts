import { Module } from '@nestjs/common';
import { PricerService } from './pricer.service';

@Module({
  providers: [PricerService],
  exports: [PricerService],
})
export class PricerModule {}
