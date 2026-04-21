import { Global, Module } from '@nestjs/common';
import { RiskControlService } from './risk-control.service';
import { RiskControlController } from './risk-control.controller';

@Global()
@Module({
  providers: [RiskControlService],
  exports: [RiskControlService],
  controllers: [RiskControlController],
})
export class RiskControlModule {}
