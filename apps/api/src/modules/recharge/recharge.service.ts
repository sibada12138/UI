import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { RechargeStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import {
  createRandomToken,
  decryptText,
  maskPhone,
  normalizePhone,
} from '../../common/security/crypto.util';
import { ExternalIntegrationService } from '../external-integration/external-integration.service';
import { GenerateRechargeLinkDto } from './dto/generate-recharge-link.dto';
import { CheckRechargeCapabilityDto } from './dto/check-recharge-capability.dto';

const DEFAULT_CHANNELS = ['联想', '网页', 'Android'];

@Injectable()
export class RechargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalIntegrationService: ExternalIntegrationService,
  ) {}

  private getChannelsFilePath() {
    const configured = process.env.RECHARGE_CHANNELS_FILE?.trim();
    if (configured) {
      return path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured);
    }
    return path.resolve(process.cwd(), './data/recharge-channels.txt');
  }

  private async ensureChannelsFile() {
    const filePath = this.getChannelsFilePath();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, `${DEFAULT_CHANNELS.join('\n')}\n`, 'utf8');
    }
    return filePath;
  }

  private sanitizeChannels(channelList: string[]) {
    const normalized = channelList
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    const unique = Array.from(new Set(normalized));
    if (unique.length === 0) {
      return [...DEFAULT_CHANNELS];
    }
    return unique;
  }

  async listChannels() {
    const filePath = await this.ensureChannelsFile();
    const content = await fs.readFile(filePath, 'utf8');
    const channels = this.sanitizeChannels(content.split(/\r?\n/g));
    return { channels, source: filePath };
  }

  async updateChannels(channelList: string[], operatorId?: string) {
    const filePath = await this.ensureChannelsFile();
    const channels = this.sanitizeChannels(channelList);
    await fs.writeFile(filePath, `${channels.join('\n')}\n`, 'utf8');
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: operatorId ?? null,
        action: 'RECHARGE_CHANNELS_UPDATE',
        targetType: 'system_config',
        targetId: 'recharge_channels',
        metadataJson: {
          channels,
          filePath,
        },
      },
    });
    return { channels, source: filePath };
  }

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
        ...(() => {
          const rawPhone = decryptText(item.userSubmission.phoneEnc);
          const smsCode = decryptText(item.userSubmission.smsCodeEnc);
          const isQrLogin = smsCode.startsWith('QR:');
          const normalizedPhone = normalizePhone(rawPhone);
          return {
            phone: isQrLogin ? '-' : normalizedPhone,
            phoneMasked: isQrLogin ? '-' : maskPhone(normalizedPhone),
            smsCode: isQrLogin ? '扫码登录' : smsCode,
          };
        })(),
        id: item.id,
        token: item.userSubmission.issueToken.token,
        status: item.status,
        rechargeLink: item.rechargeLink,
        qrPayload: item.qrPayload,
        remark: item.remark,
        updatedAt: item.updatedAt,
        submittedAt: item.userSubmission.submittedAt,
      })),
    };
  }

  async checkCapability(dto: CheckRechargeCapabilityDto, operatorId?: string) {
    const accessToken = String(dto.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }
    const channelData = await this.listChannels();
    const channels =
      dto.checkAll === true
        ? channelData.channels
        : [dto.channel ?? channelData.channels[0] ?? '网页'];

    const results: Array<{
      channel: string;
      canRecharge: boolean;
      reason: string;
    }> = [];

    for (const channel of channels) {
      try {
        await this.externalIntegrationService.vipOverview(
          { accessToken, cookie: dto.cookie },
          operatorId,
        );
        results.push({
          channel,
          canRecharge: true,
          reason: '账号可用，可尝试生成充值链接',
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'CHECK_FAILED';
        results.push({
          channel,
          canRecharge: false,
          reason,
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: operatorId ?? null,
        action: 'RECHARGE_CAPABILITY_CHECK',
        targetType: 'external_api',
        targetId: 'recharge_capability',
        metadataJson: {
          checkAll: dto.checkAll === true,
          channels,
          successCount: results.filter((item) => item.canRecharge).length,
        },
      },
    });

    return {
      channels,
      results,
    };
  }

  private async generateLocalLink(taskId: string) {
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/recharge/${taskId}/${createRandomToken('r_')}`;
    return {
      rechargeLink: link,
      qrPayload: await QRCode.toDataURL(link),
      remark: 'mode=local',
      mode: 'local' as const,
      detail: null,
    };
  }

  private async generateExternalLink(
    dto: GenerateRechargeLinkDto,
    operatorId?: string,
  ) {
    const channel = (dto.channel ?? '网页') as '联想' | '网页' | 'Android';
    const accessToken = String(dto.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }

    const data = await this.externalIntegrationService.createRechargeFlow({
      channel,
      accessToken,
      cookie: dto.cookie,
      transactionPayload: dto.transactionPayload,
      orderPayload: dto.orderPayload,
      cashierPayload: dto.cashierPayload,
      actorId: operatorId,
    });

    const orderNo = data.orderNo ? String(data.orderNo) : '';
    return {
      rechargeLink: data.paymentUrl,
      qrPayload: data.qrPayload,
      remark: `mode=external;channel=${channel}${orderNo ? `;orderNo=${orderNo}` : ''}`,
      mode: 'external' as const,
      detail: {
        channel,
        orderNo,
        priceValue: data.priceValue,
      },
    };
  }

  async generateLink(
    taskId: string,
    operatorId?: string,
    dto: GenerateRechargeLinkDto = {},
  ) {
    const task = await this.prisma.rechargeTask.findUnique({
      where: { id: taskId },
      include: {
        userSubmission: {
          include: { issueToken: true },
        },
      },
    });
    if (!task) {
      throw new NotFoundException('RECHARGE_TASK_NOT_FOUND');
    }

    if (dto.useExternalApi === false) {
      throw new BadRequestException('EXTERNAL_ONLY_MODE');
    }

    const generated = await this.generateExternalLink(dto, operatorId);

    const updated = await this.prisma.rechargeTask.update({
      where: { id: taskId },
      data: {
        status: RechargeStatus.link_generated,
        rechargeLink: generated.rechargeLink,
        qrPayload: generated.qrPayload,
        operatorId: operatorId ?? null,
        remark: generated.remark,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: operatorId ?? null,
        action: 'RECHARGE_LINK_GENERATE',
        targetType: 'recharge_task',
        targetId: taskId,
        metadataJson: {
          mode: generated.mode,
          channel: dto.channel ?? null,
          link: generated.rechargeLink,
        },
      },
    });

    return {
      taskId,
      status: updated.status,
      rechargeLink: updated.rechargeLink,
      qrPayload: updated.qrPayload,
      mode: generated.mode,
      detail: generated.detail,
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
