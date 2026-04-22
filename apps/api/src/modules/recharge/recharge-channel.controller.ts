import { Body, Controller, Get, Post } from '@nestjs/common';
import { RechargeService } from './recharge.service';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';
import { UpdateRechargeChannelsDto } from './dto/update-recharge-channels.dto';

@Controller('admin/recharge/channels')
export class RechargeChannelController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Get()
  listChannels() {
    return this.rechargeService.listChannels();
  }

  @Post()
  updateChannels(
    @Body() dto: UpdateRechargeChannelsDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.updateChannels(dto.channels, admin?.id);
  }
}
