import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTokenDto } from './dto/create-token.dto';
import { SubmitTokenDto } from './dto/submit-token.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  createRandomToken,
  decryptText,
  encryptText,
  hashPlainText,
  maskPhone,
  normalizePhone,
} from '../../common/security/crypto.util';
import { TokenStatus } from '@prisma/client';

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(dto: CreateTokenDto, createdBy?: string) {
    const expiresInMinutes = dto.expiresInMinutes ?? 30;
    const token = createRandomToken('tk_');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const issueToken = await this.prisma.issueToken.create({
      data: { token, expiresAt, createdBy: createdBy ?? null },
    });
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: createdBy ?? null,
        action: 'TOKEN_CREATE',
        targetType: 'issue_token',
        targetId: issueToken.id,
      },
    });

    return {
      id: issueToken.id,
      token: issueToken.token,
      status: issueToken.status,
      expiresAt: issueToken.expiresAt,
      link: `/t/${token}`,
    };
  }

  async listTokens() {
    const tokens = await this.prisma.issueToken.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      items: tokens,
    };
  }

  async revokeToken(id: string) {
    const token = await this.prisma.issueToken.findFirst({
      where: { OR: [{ id }, { token: id }] },
    });
    if (!token) {
      throw new NotFoundException('TOKEN_NOT_FOUND');
    }
    const updated = await this.prisma.issueToken.update({
      where: { id: token.id },
      data: { status: TokenStatus.revoked, revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        action: 'TOKEN_REVOKE',
        targetType: 'issue_token',
        targetId: updated.id,
      },
    });
    return { id: updated.id, status: updated.status };
  }

  async getTokenStatus(token: string) {
    const issueToken = await this.prisma.issueToken.findUnique({
      where: { token },
      include: {
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          include: {
            rechargeTasks: { orderBy: { updatedAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!issueToken) {
      throw new NotFoundException('TOKEN_NOT_FOUND');
    }

    const isExpired =
      issueToken.status === TokenStatus.active &&
      issueToken.expiresAt.getTime() <= Date.now();
    if (isExpired) {
      await this.prisma.issueToken.update({
        where: { id: issueToken.id },
        data: { status: TokenStatus.expired },
      });
      issueToken.status = TokenStatus.expired;
    }

    const latestSubmission = issueToken.submissions[0];
    const latestTask = latestSubmission?.rechargeTasks[0];
    return {
      token: issueToken.token,
      status: issueToken.status,
      expiresAt: issueToken.expiresAt,
      consumedAt: issueToken.consumedAt,
      submission:
        latestSubmission == null
          ? null
          : {
              phoneMasked: maskPhone(
                normalizePhone(decryptText(latestSubmission.phoneEnc)),
              ),
              submittedAt: latestSubmission.submittedAt,
            },
      recharge: latestTask
        ? {
            status: latestTask.status,
            updatedAt: latestTask.updatedAt,
          }
        : null,
    };
  }

  async submitToken(
    token: string,
    dto: SubmitTokenDto,
    submitIp?: string,
    userAgent?: string,
  ) {
    const normalizedPhone = normalizePhone(dto.phone);
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      throw new BadRequestException('PHONE_INVALID');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const issueToken = await tx.issueToken.findUnique({ where: { token } });
      if (!issueToken) {
        throw new NotFoundException('TOKEN_NOT_FOUND');
      }
      if (issueToken.status !== TokenStatus.active) {
        throw new BadRequestException('TOKEN_INVALID');
      }
      if (issueToken.expiresAt.getTime() <= Date.now()) {
        await tx.issueToken.update({
          where: { id: issueToken.id },
          data: { status: TokenStatus.expired },
        });
        throw new BadRequestException('TOKEN_EXPIRED');
      }

      const consumeResult = await tx.issueToken.updateMany({
        where: { id: issueToken.id, status: TokenStatus.active },
        data: { status: TokenStatus.consumed, consumedAt: new Date() },
      });
      if (consumeResult.count !== 1) {
        throw new BadRequestException('TOKEN_INVALID');
      }

      const submission = await tx.userSubmission.create({
        data: {
          issueTokenId: issueToken.id,
          phoneHash: hashPlainText(normalizedPhone),
          phoneEnc: encryptText(normalizedPhone),
          smsCodeEnc: encryptText(dto.smsCode),
          submitIp: submitIp?.slice(0, 64),
          userAgent: userAgent?.slice(0, 255),
        },
      });
      await tx.rechargeTask.create({
        data: { userSubmissionId: submission.id, status: 'pending' },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'user',
          action: 'TOKEN_SUBMIT_SUCCESS',
          targetType: 'issue_token',
          targetId: issueToken.id,
          metadataJson: {
            phoneMasked: maskPhone(normalizedPhone),
          },
        },
      });
      return { submissionId: submission.id, issueTokenId: issueToken.id };
    });

    return {
      success: true,
      token,
      phoneMasked: maskPhone(normalizedPhone),
      status: TokenStatus.consumed,
      submissionId: result.submissionId,
    };
  }
}
