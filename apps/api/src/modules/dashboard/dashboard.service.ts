import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryResult, TokenStatus } from '@prisma/client';
import { RiskControlService } from '../risk-control/risk-control.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riskControlService: RiskControlService,
  ) {}

  async getMetrics() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - 6);
    const rangeEnd = new Date(todayStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    const [
      activeTokens,
      consumedToday,
      pendingRechargeTasks,
      totalQueries,
      failedQueries,
      tokenRows,
      submissionRows,
      completedRows,
      failedRows,
    ] = await Promise.all([
      this.prisma.issueToken.count({
        where: { status: TokenStatus.active, expiresAt: { gt: new Date() } },
      }),
      this.prisma.userSubmission.count({
        where: { submittedAt: { gte: todayStart } },
      }),
      this.prisma.rechargeTask.count({ where: { status: 'pending' } }),
      this.prisma.queryLog.count(),
      this.prisma.queryLog.count({ where: { result: QueryResult.failed } }),
      this.prisma.issueToken.findMany({
        where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { createdAt: true },
      }),
      this.prisma.userSubmission.findMany({
        where: { submittedAt: { gte: rangeStart, lt: rangeEnd } },
        select: { submittedAt: true },
      }),
      this.prisma.rechargeTask.findMany({
        where: {
          status: 'completed',
          updatedAt: { gte: rangeStart, lt: rangeEnd },
        },
        select: { updatedAt: true },
      }),
      this.prisma.rechargeTask.findMany({
        where: {
          status: 'failed',
          updatedAt: { gte: rangeStart, lt: rangeEnd },
        },
        select: { updatedAt: true },
      }),
    ]);

    const dailyMap = new Map<
      string,
      {
        tokenCreated: number;
        submissionCount: number;
        completedCount: number;
        failedCount: number;
      }
    >();

    for (let offset = 0; offset < 7; offset += 1) {
      const current = new Date(todayStart);
      current.setDate(todayStart.getDate() - (6 - offset));
      const key = current.toISOString().slice(0, 10);
      dailyMap.set(key, {
        tokenCreated: 0,
        submissionCount: 0,
        completedCount: 0,
        failedCount: 0,
      });
    }

    const addToMap = (
      dateValue: Date,
      field: 'tokenCreated' | 'submissionCount' | 'completedCount' | 'failedCount',
    ) => {
      const key = dateValue.toISOString().slice(0, 10);
      const item = dailyMap.get(key);
      if (!item) {
        return;
      }
      item[field] += 1;
    };

    tokenRows.forEach((row) => addToMap(row.createdAt, 'tokenCreated'));
    submissionRows.forEach((row) => addToMap(row.submittedAt, 'submissionCount'));
    completedRows.forEach((row) => addToMap(row.updatedAt, 'completedCount'));
    failedRows.forEach((row) => addToMap(row.updatedAt, 'failedCount'));

    return {
      activeTokens,
      consumedToday,
      queryFailRate:
        totalQueries === 0
          ? 0
          : Number((failedQueries / totalQueries).toFixed(4)),
      bannedIpCount: this.riskControlService.listActiveBans().length,
      pendingRechargeTasks,
      dailySnapshots: Array.from(dailyMap.entries()).map(([date, value]) => ({
        date,
        ...value,
      })),
      timestamp: new Date(),
    };
  }
}
