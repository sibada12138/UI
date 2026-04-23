import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RechargeService } from './recharge.service';
import { UpdateRechargeStatusDto } from './dto/update-recharge-status.dto';
import { GenerateRechargeLinkDto } from './dto/generate-recharge-link.dto';
import { CheckRechargeCapabilityDto } from './dto/check-recharge-capability.dto';
import { BatchTaskCapabilityDto } from './dto/batch-task-capability.dto';
import { BatchGenerateLinkDto } from './dto/batch-generate-link.dto';
import { DeleteAccountsDto } from './dto/delete-accounts.dto';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/recharge/tasks')
export class RechargeController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Get()
  list() {
    return this.rechargeService.listTasks();
  }

  @Get('notifications')
  listNotifications(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rechargeService.listTaskNotifications(
      since,
      Number(limit ?? 30),
    );
  }

  @Get('accounts')
  listAccounts() {
    return this.rechargeService.listAccounts();
  }

  @Post('accounts')
  listAccountsPost() {
    return this.rechargeService.listAccounts();
  }

  @Post('accounts/delete')
  deleteAccounts(
    @Body() dto: DeleteAccountsDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.deleteAccounts(dto.submissionIds, admin?.id);
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

  @Post('batch/capability')
  checkCapabilityByTasks(
    @Body() dto: BatchTaskCapabilityDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.checkCapabilityByTasks(
      dto.taskIds,
      dto.preferredChannel,
      admin?.id,
    );
  }

  @Post('batch/check-capability')
  checkCapabilityByTasksAlias(
    @Body() dto: BatchTaskCapabilityDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.checkCapabilityByTasks(
      dto.taskIds,
      dto.preferredChannel,
      admin?.id,
    );
  }

  @Post('batch/generate-links')
  generateLinksByTasks(
    @Body() dto: BatchGenerateLinkDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.generateLinksByTasks(
      dto.taskIds,
      dto.preferredChannel,
      admin?.id,
    );
  }

  @Post(':id/refresh-vip')
  refreshVip(
    @Param('id') id: string,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.rechargeService.refreshTaskVip(id, admin?.id);
  }
}
