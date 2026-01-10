import { Module } from '@nestjs/common';
import { AdvisorService } from './advisor.service';

@Module({
  providers: [AdvisorService],
  exports: [AdvisorService],
})
export class AdvisorModule {}
