import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RiskControlService } from './risk-control.service';
import { UnbanIpDto } from './dto/unban-ip.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/security')
export class RiskControlController {
  constructor(
    private readonly riskControlService: RiskControlService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('bans')
  listBans(@Query('scope') scope?: string) {
    const typedScope =
      scope === 'query' || scope === 'token_submit' ? scope : undefined;
    return {
      items: this.riskControlService.listActiveBans(typedScope),
    };
  }

  @Post('bans/unban')
  async unban(
    @Body() dto: UnbanIpDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    this.riskControlService.clearBan(dto.scope, dto.ip);
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: admin?.id ?? null,
        action: 'IP_UNBAN',
        targetType: 'risk_ban',
        targetId: `${dto.scope}:${dto.ip}`,
      },
    });
    return { success: true };
  }
}
