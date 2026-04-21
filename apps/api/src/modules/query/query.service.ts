import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PublicQueryDto } from './dto/public-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptText,
  hashPlainText,
  maskPhone,
  normalizePhone,
} from '../../common/security/crypto.util';
import { QueryResult, QueryType } from '@prisma/client';

type CaptchaCache = {
  code: string;
  expiresAt: number;
};

type IpRiskState = {
  failedCount: number;
  bannedUntil?: number;
};

@Injectable()
export class QueryService {
  private readonly captchaMap = new Map<string, CaptchaCache>();
  private readonly ipRiskMap = new Map<string, IpRiskState>();

  constructor(private readonly prisma: PrismaService) {}

  private randomCaptchaCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  private createCaptchaSvg(code: string) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44"><rect width="120" height="44" fill="#f5f5f7"/><text x="60" y="29" text-anchor="middle" font-size="22" font-family="Arial" fill="#1d1d1f" letter-spacing="4">${code}</text></svg>`;
  }

  private getRiskState(ip: string): IpRiskState {
    const state = this.ipRiskMap.get(ip) ?? { failedCount: 0 };
    if (state.bannedUntil && state.bannedUntil <= Date.now()) {
      state.bannedUntil = undefined;
      state.failedCount = 0;
    }
    this.ipRiskMap.set(ip, state);
    return state;
  }

  private registerFailure(ip: string): IpRiskState {
    const state = this.getRiskState(ip);
    state.failedCount += 1;
    if (state.failedCount >= 5) {
      state.bannedUntil = Date.now() + 60 * 60 * 1000;
    }
    this.ipRiskMap.set(ip, state);
    return state;
  }

  private resetFailure(ip: string) {
    this.ipRiskMap.set(ip, { failedCount: 0 });
  }

  private verifyCaptcha(captchaId: string, captchaCode: string) {
    const cached = this.captchaMap.get(captchaId);
    if (!cached || cached.expiresAt <= Date.now()) {
      this.captchaMap.delete(captchaId);
      return false;
    }
    this.captchaMap.delete(captchaId);
    return cached.code.toUpperCase() === captchaCode.trim().toUpperCase();
  }

  createCaptcha() {
    const id = randomBytes(8).toString('hex');
    const code = this.randomCaptchaCode();
    this.captchaMap.set(id, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return {
      captchaId: id,
      captchaSvg: this.createCaptchaSvg(code),
      expiresInSec: 300,
    };
  }

  async queryProgress(dto: PublicQueryDto, ip: string) {
    const risk = this.getRiskState(ip);
    if (risk.bannedUntil && risk.bannedUntil > Date.now()) {
      await this.prisma.queryLog.create({
        data: {
          queryType: dto.queryType === 'token' ? QueryType.token : QueryType.phone,
          queryKeyHash: hashPlainText(dto.queryValue.trim()),
          ip,
          result: QueryResult.banned,
          failReason: 'IP_BANNED',
        },
      });
      throw new ForbiddenException('QUERY_BANNED_1H');
    }

    const captchaOk = this.verifyCaptcha(dto.captchaId, dto.captchaCode);
    if (!captchaOk) {
      const failed = this.registerFailure(ip);
      await this.prisma.queryLog.create({
        data: {
          queryType: dto.queryType === 'token' ? QueryType.token : QueryType.phone,
          queryKeyHash: hashPlainText(dto.queryValue.trim()),
          ip,
          result: QueryResult.failed,
          failReason:
            failed.bannedUntil && failed.bannedUntil > Date.now()
              ? 'CAPTCHA_INVALID_AND_BANNED'
              : 'CAPTCHA_INVALID',
        },
      });
      if (failed.bannedUntil && failed.bannedUntil > Date.now()) {
        throw new ForbiddenException('QUERY_BANNED_1H');
      }
      throw new BadRequestException('CAPTCHA_INVALID');
    }

    const queryValue = dto.queryValue.trim();
    const queryType = dto.queryType;
    let tokenId: string | null = null;
    let tokenValue = '';
    let tokenStatus = '';
    let rechargeStatus = 'pending';
    let latestUpdatedAt: Date | null = null;
    let phoneMasked = '';

    if (queryType === 'token') {
      const token = await this.prisma.issueToken.findUnique({
        where: { token: queryValue },
        include: {
          submissions: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
            include: { rechargeTasks: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          },
        },
      });
      if (!token) {
        this.registerFailure(ip);
        await this.prisma.queryLog.create({
          data: {
            queryType: QueryType.token,
            queryKeyHash: hashPlainText(queryValue),
            ip,
            result: QueryResult.failed,
            failReason: 'TOKEN_NOT_FOUND',
          },
        });
        throw new NotFoundException('NO_RECORD');
      }

      tokenId = token.id;
      tokenValue = token.token;
      tokenStatus = token.status;
      const submission = token.submissions[0];
      if (submission) {
        phoneMasked = maskPhone(normalizePhone(decryptText(submission.phoneEnc)));
        latestUpdatedAt = submission.submittedAt;
        const task = submission.rechargeTasks[0];
        if (task) {
          rechargeStatus = task.status;
          latestUpdatedAt = task.updatedAt;
        }
      }
    } else {
      const normalized = normalizePhone(queryValue);
      const submission = await this.prisma.userSubmission.findFirst({
        where: { phoneHash: hashPlainText(normalized) },
        orderBy: { submittedAt: 'desc' },
        include: {
          issueToken: true,
          rechargeTasks: { orderBy: { updatedAt: 'desc' }, take: 1 },
        },
      });
      if (!submission) {
        this.registerFailure(ip);
        await this.prisma.queryLog.create({
          data: {
            queryType: QueryType.phone,
            queryKeyHash: hashPlainText(normalized),
            ip,
            result: QueryResult.failed,
            failReason: 'PHONE_NOT_FOUND',
          },
        });
        throw new NotFoundException('NO_RECORD');
      }

      tokenId = submission.issueToken.id;
      tokenValue = submission.issueToken.token;
      tokenStatus = submission.issueToken.status;
      phoneMasked = maskPhone(normalized);
      latestUpdatedAt = submission.submittedAt;
      const task = submission.rechargeTasks[0];
      if (task) {
        rechargeStatus = task.status;
        latestUpdatedAt = task.updatedAt;
      }
    }

    this.resetFailure(ip);
    await this.prisma.queryLog.create({
      data: {
        queryType: queryType === 'token' ? QueryType.token : QueryType.phone,
        queryKeyHash: hashPlainText(queryValue),
        issueTokenId: tokenId ?? undefined,
        ip,
        result: QueryResult.success,
      },
    });

    return {
      queryType,
      ip,
      phoneMasked,
      token: tokenValue,
      tokenStatus,
      rechargeStatus,
      updatedAt: latestUpdatedAt,
    };
  }
}
