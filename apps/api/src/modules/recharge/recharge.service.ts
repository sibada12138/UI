import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createRandomToken, decryptText, maskPhone, normalizePhone } from '../../common/security/crypto.util';
import { RechargeStatus } from '@prisma/client';
import * as QRCode from 'qrcode';

@Injectable()
export class RechargeService {
  constructor(private readonly prisma: PrismaService) {}

  async listTasks() {
    const items = await this.prisma.rechargeTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        userSubmission: {
          include: {
            issueToken: true,
          },
        },
      },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        phoneMasked: maskPhone(
          normalizePhone(decryptText(item.userSubmission.phoneEnc)),
        ),
        token: item.userSubmission.issueToken.token,
        status: item.status,
        updatedAt: item.updatedAt,
        submittedAt: item.userSubmission.submittedAt,
      })),
    };
  }

  async generateLink(taskId: string, operatorId?: string) {
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/recharge/${taskId}/${createRandomToken('r_')}`;
    const qrPayload = await QRCode.toDataURL(link);
    const updated = await this.prisma.rechargeTask.update({
      where: { id: taskId },
      data: {
        status: RechargeStatus.link_generated,
        rechargeLink: link,
        qrPayload,
        operatorId: operatorId ?? null,
      },
    });
    return {
      taskId,
      status: updated.status,
      rechargeLink: link,
      qrPayload,
    };
  }

  async updateStatus(
    taskId: string,
    status: string,
    remark?: string,
    operatorId?: string,
  ) {
    const updated = await this.prisma.rechargeTask.update({
      where: { id: taskId },
      data: {
        status: status as RechargeStatus,
        remark: remark ?? null,
        operatorId: operatorId ?? null,
      },
    });
    return {
      taskId,
      status: updated.status,
      remark: updated.remark,
      updatedAt: updated.updatedAt,
    };
  }
}
