import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RiskControlService } from './risk-control.service';
import { UnbanIpDto } from './dto/unban-ip.dto';
import { BanIpDto } from './dto/ban-ip.dto';
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

  @Get('recent-ips')
  async recentIps(@Query('scope') scope?: string, @Query('limit') limit?: string) {
    const typedScope = scope === 'token_submit' ? 'token_submit' : 'query';
    const take = Math.min(Math.max(Number(limit ?? 50), 10), 200);

    if (typedScope === 'token_submit') {
      const records = await this.prisma.userSubmission.findMany({
        where: { submitIp: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take,
        select: { submitIp: true, submittedAt: true },
      });
      const map = new Map<string, { ip: string; latestAt: string; count: number }>();
      for (const item of records) {
        const ip = String(item.submitIp ?? '').trim();
        if (!ip) continue;
        const existed = map.get(ip);
        if (existed) {
          existed.count += 1;
          continue;
        }
        map.set(ip, {
          ip,
          latestAt: item.submittedAt.toISOString(),
          count: 1,
        });
      }
      return { items: Array.from(map.values()) };
    }

    const records = await this.prisma.queryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { ip: true, createdAt: true },
    });
    const map = new Map<string, { ip: string; latestAt: string; count: number }>();
    for (const item of records) {
      const ip = String(item.ip ?? '').trim();
      if (!ip) continue;
      const existed = map.get(ip);
      if (existed) {
        existed.count += 1;
        continue;
      }
      map.set(ip, {
        ip,
        latestAt: item.createdAt.toISOString(),
        count: 1,
      });
    }
    return { items: Array.from(map.values()) };
  }

  @Post('bans/ban')
  async ban(
    @Body() dto: BanIpDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    const duration = dto.durationMinutes ?? 60;
    this.riskControlService.banIp(dto.scope, dto.ip, duration);
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: admin?.id ?? null,
        action: 'IP_BAN_MANUAL',
        targetType: 'risk_ban',
        targetId: `${dto.scope}:${dto.ip}`,
        metadataJson: {
          durationMinutes: duration,
        },
      },
    });
    return { success: true };
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
