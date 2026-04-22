import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RechargeService } from './recharge.service';
import { UpdateRechargeStatusDto } from './dto/update-recharge-status.dto';
import { GenerateRechargeLinkDto } from './dto/generate-recharge-link.dto';
import { CheckRechargeCapabilityDto } from './dto/check-recharge-capability.dto';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/recharge/tasks')
export class RechargeController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Get()
  list() {
    return this.rechargeService.listTasks();
  }

  @Post(':id/generate-link')
  generateLink(
    @Param('id') id: string,
    @Body() dto: GenerateRechargeLinkDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.generateLink(id, admin?.id, dto);
  }

  @Post(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRechargeStatusDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.updateStatus(
      id,
      dto.status,
      dto.remark,
      admin?.id,
    );
  }

  @Post('capability/check')
  checkCapability(
    @Body() dto: CheckRechargeCapabilityDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.checkCapability(dto, admin?.id);
  }
}
