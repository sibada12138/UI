import { Module } from '@nestjs/common';
import { RechargeController } from './recharge.controller';
import { RechargeService } from './recharge.service';
import { RechargeChannelController } from './recharge-channel.controller';
import { ExternalIntegrationModule } from '../external-integration/external-integration.module';

@Module({
  imports: [ExternalIntegrationModule],
  controllers: [RechargeController, RechargeChannelController],
  providers: [RechargeService],
})
export class RechargeModule {}
