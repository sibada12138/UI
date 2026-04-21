import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryResult, TokenStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [activeTokens, consumedToday, bannedIpRows, pendingRechargeTasks, totalQueries, failedQueries] =
      await Promise.all([
        this.prisma.issueToken.count({ where: { status: TokenStatus.active } }),
        this.prisma.userSubmission.count({
          where: { submittedAt: { gte: todayStart } },
        }),
        this.prisma.queryLog.findMany({
          where: { result: QueryResult.banned },
          distinct: ['ip'],
          select: { ip: true },
        }),
        this.prisma.rechargeTask.count({ where: { status: 'pending' } }),
        this.prisma.queryLog.count(),
        this.prisma.queryLog.count({ where: { result: QueryResult.failed } }),
      ]);

    return {
      activeTokens,
      consumedToday,
      queryFailRate: totalQueries === 0 ? 0 : Number((failedQueries / totalQueries).toFixed(4)),
      bannedIpCount: bannedIpRows.length,
      pendingRechargeTasks,
      timestamp: new Date(),
    };
  }
}
