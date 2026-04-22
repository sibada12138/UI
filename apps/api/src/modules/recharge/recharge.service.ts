import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { Prisma, RechargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptText,
  maskPhone,
  normalizePhone,
} from '../../common/security/crypto.util';
import {
  ChannelCapabilityCheck,
  ExternalIntegrationService,
  RechargeChannel,
} from '../external-integration/external-integration.service';
import { GenerateRechargeLinkDto } from './dto/generate-recharge-link.dto';
import { CheckRechargeCapabilityDto } from './dto/check-recharge-capability.dto';

const DEFAULT_CHANNELS: RechargeChannel[] = ['联想', '网页', 'Android'];

type TaskWithSubmission = Prisma.RechargeTaskGetPayload<{
  include: {
    userSubmission: {
      include: {
        issueToken: true;
      };
    };
  };
}>;

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
      .filter((item): item is RechargeChannel =>
        DEFAULT_CHANNELS.includes(item as RechargeChannel),
      )
      .slice(0, 20);
    const unique = Array.from(new Set(normalized));
    if (unique.length === 0) {
      return [...DEFAULT_CHANNELS];
    }
    return unique;
  }

  private getAccessTokenFromTask(task: TaskWithSubmission) {
    const encrypted = String(task.userSubmission.accessTokenEnc ?? '').trim();
    if (!encrypted) {
      return '';
    }
    try {
      return String(decryptText(encrypted)).trim();
    } catch {
      return '';
    }
  }

  private parseAvailableChannels(
    source: Prisma.JsonValue | null,
  ): RechargeChannel[] {
    if (!Array.isArray(source)) {
      return [];
    }
    const channels = source
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (
          item &&
          typeof item === 'object' &&
          'channel' in item &&
          typeof item.channel === 'string'
        ) {
          return item.channel;
        }
        return '';
      })
      .filter((item): item is RechargeChannel =>
        DEFAULT_CHANNELS.includes(item as RechargeChannel),
      );
    return Array.from(new Set(channels));
  }

  private formatCapabilityMessage(results: ChannelCapabilityCheck[]) {
    const available = results.filter((item) => item.canRecharge);
    if (available.length === 0) {
      return '未找到价格为 1.1 的可用渠道';
    }
    return `可用渠道：${available
      .map((item) => `${item.channel}${item.priceValue != null ? `(${item.priceValue})` : ''}`)
      .join(' / ')}`;
  }

  private normalizeApiMessage(input: string | null | undefined) {
    const value = String(input ?? '').trim();
    if (!value) {
      return '';
    }
    if (value.includes('当前模式：外部账号充值')) {
      return '请先查询可开通接口，再生成开通链接';
    }
    if (value.includes('外部模式下必须填写 Access-Token')) {
      return '该账户缺少 AccessToken，请先完成登录提交';
    }
    return value;
  }

  private async getOrderedChannels(preferredChannel?: string) {
    const channelData = await this.listChannels();
    const channels = channelData.channels;
    const preferred = String(preferredChannel ?? '').trim();
    if (!preferred) {
      return channels;
    }
    if (!channels.includes(preferred as RechargeChannel)) {
      return [preferred as RechargeChannel, ...channels];
    }
    const index = channels.findIndex((item) => item === preferred);
    return [...channels.slice(index), ...channels.slice(0, index)];
  }

  private async checkTaskCapabilityCore(
    task: TaskWithSubmission,
    preferredChannel: string | undefined,
    operatorId?: string,
  ) {
    const accessToken = this.getAccessTokenFromTask(task);
    if (!accessToken) {
      const message = '该账户缺少 AccessToken，请先完成登录提交';
      await this.prisma.rechargeTask.update({
        where: { id: task.id },
        data: {
          apiStatus: 'missing_access_token',
          apiMessage: message,
          availableChannelsJson: [] as Prisma.InputJsonValue,
          selectedChannel: null,
          lastApiAt: new Date(),
        },
      });
      return {
        taskId: task.id,
        token: task.userSubmission.issueToken.token,
        canOpen: false,
        selectedChannel: null,
        availableChannels: [] as RechargeChannel[],
        message,
        results: [] as ChannelCapabilityCheck[],
      };
    }

    const orderedChannels = await this.getOrderedChannels(preferredChannel);
    const results: ChannelCapabilityCheck[] = [];
    for (const channel of orderedChannels) {
      const checked =
        await this.externalIntegrationService.checkRechargeChannelCapability({
          channel,
          accessToken,
          actorId: operatorId,
        });
      results.push(checked);
    }

    const availableChannels = results
      .filter((item) => item.canRecharge)
      .map((item) => item.channel);
    const selectedChannel = availableChannels[0] ?? null;
    const selectedItem = results.find((item) => item.channel === selectedChannel);
    const message = this.formatCapabilityMessage(results);

    await this.prisma.rechargeTask.update({
      where: { id: task.id },
      data: {
        apiStatus: availableChannels.length > 0 ? 'channel_ready' : 'channel_unavailable',
        apiMessage: message,
        availableChannelsJson: results as Prisma.InputJsonValue,
        selectedChannel,
        lastApiAt: new Date(),
        lastPriceValue: selectedItem?.priceValue ?? null,
      },
    });

    return {
      taskId: task.id,
      token: task.userSubmission.issueToken.token,
      canOpen: availableChannels.length > 0,
      selectedChannel,
      availableChannels,
      message,
      results,
    };
  }

  private async generateExternalLinkWithFallback(
    task: TaskWithSubmission,
    dto: GenerateRechargeLinkDto,
    operatorId?: string,
  ) {
    const accessToken = this.getAccessTokenFromTask(task);
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }

    const orderedChannels = await this.getOrderedChannels(
      dto.channel ?? task.selectedChannel ?? undefined,
    );
    const startChannel = orderedChannels[0];
    let lastError: unknown = null;

    for (const channel of orderedChannels) {
      try {
        const generated = await this.externalIntegrationService.createRechargeFlow({
          channel,
          accessToken,
          cookie: dto.cookie,
          transactionPayload: dto.transactionPayload,
          orderPayload: dto.orderPayload,
          cashierPayload: dto.cashierPayload,
          actorId: operatorId,
        });
        const fallbackUsed = channel !== startChannel;
        const orderNo = generated.orderNo ? String(generated.orderNo) : '';
        return {
          rechargeLink: generated.paymentUrl,
          qrPayload: generated.qrPayload,
          remark: `mode=external;channel=${channel}${fallbackUsed ? ';fallback=1' : ''}${orderNo ? `;orderNo=${orderNo}` : ''}`,
          detail: {
            channel,
            orderNo,
            priceValue: generated.priceValue,
            fallbackUsed,
          },
        };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : '';
        if (message === 'RECHARGE_PRICE_NOT_ALLOWED') {
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new BadRequestException('RECHARGE_NO_AVAILABLE_CHANNEL');
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
      take: 500,
      include: {
        userSubmission: {
          include: {
            issueToken: true,
          },
        },
      },
    });

    return {
      items: items.map((item) => {
        const rawPhone = decryptText(item.userSubmission.phoneEnc);
        const smsCode = decryptText(item.userSubmission.smsCodeEnc);
        const isQrLogin = smsCode.startsWith('QR:');
        const normalizedPhone = normalizePhone(rawPhone);
        const availableChannels = this.parseAvailableChannels(
          item.availableChannelsJson,
        );

        return {
          id: item.id,
          token: item.userSubmission.issueToken.token,
          phone: isQrLogin ? '-' : normalizedPhone,
          phoneMasked: isQrLogin ? '-' : maskPhone(normalizedPhone),
          smsCode: isQrLogin ? '扫码登录' : smsCode,
          status: item.status,
          apiStatus: item.apiStatus,
          apiMessage: this.normalizeApiMessage(item.apiMessage),
          availableChannels,
          selectedChannel: item.selectedChannel,
          lastApiAt: item.lastApiAt,
          lastPriceValue: item.lastPriceValue,
          rechargeLink: item.rechargeLink,
          qrPayload: item.qrPayload,
          remark: item.remark,
          vipFetchedAt: item.userSubmission.vipFetchedAt,
          hasUserVip: item.userSubmission.userVipJson != null,
          hasWinkVip: item.userSubmission.winkVipJson != null,
          externalUid: item.userSubmission.externalUid,
          updatedAt: item.updatedAt,
          submittedAt: item.userSubmission.submittedAt,
        };
      }),
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
        : [((dto.channel as RechargeChannel) ?? channelData.channels[0] ?? '网页')];
    const results: ChannelCapabilityCheck[] = [];
    for (const channel of channels) {
      const checked =
        await this.externalIntegrationService.checkRechargeChannelCapability({
          channel,
          accessToken,
          cookie: dto.cookie,
          actorId: operatorId,
        });
      results.push(checked);
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

  async checkCapabilityByTasks(
    taskIds: string[],
    preferredChannel?: string,
    operatorId?: string,
  ) {
    const uniqueTaskIds = Array.from(
      new Set(taskIds.map((item) => String(item).trim()).filter(Boolean)),
    ).slice(0, 500);
    if (uniqueTaskIds.length === 0) {
      throw new BadRequestException('TASK_IDS_REQUIRED');
    }

    const tasks = await this.prisma.rechargeTask.findMany({
      where: { id: { in: uniqueTaskIds } },
      include: {
        userSubmission: {
          include: { issueToken: true },
        },
      },
    });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const items: Array<{
      taskId: string;
      token: string | null;
      canOpen: boolean;
      selectedChannel: string | null;
      availableChannels: RechargeChannel[];
      message: string;
      results: ChannelCapabilityCheck[];
    }> = [];

    for (const taskId of uniqueTaskIds) {
      const task = taskById.get(taskId);
      if (!task) {
        items.push({
          taskId,
          token: null,
          canOpen: false,
          selectedChannel: null,
          availableChannels: [],
          message: '任务不存在',
          results: [],
        });
        continue;
      }
      const checked = await this.checkTaskCapabilityCore(
        task,
        preferredChannel,
        operatorId,
      );
      items.push(checked);
    }

    return {
      total: uniqueTaskIds.length,
      success: items.filter((item) => item.canOpen).length,
      items,
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

    const generated = await this.generateExternalLinkWithFallback(
      task,
      dto,
      operatorId,
    );

    const updated = await this.prisma.rechargeTask.update({
      where: { id: taskId },
      data: {
        status: RechargeStatus.link_generated,
        rechargeLink: generated.rechargeLink,
        qrPayload: generated.qrPayload,
        operatorId: operatorId ?? null,
        remark: generated.remark,
        apiStatus: 'recharge_link_generated',
        apiMessage: generated.detail.fallbackUsed
          ? `默认渠道不可用，已切换为 ${generated.detail.channel}`
          : `已使用渠道 ${generated.detail.channel}`,
        selectedChannel: generated.detail.channel,
        lastApiAt: new Date(),
        lastPriceValue: generated.detail.priceValue ?? null,
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
          channel: generated.detail.channel,
          fallbackUsed: generated.detail.fallbackUsed,
          link: generated.rechargeLink,
        },
      },
    });

    return {
      taskId,
      status: updated.status,
      rechargeLink: updated.rechargeLink,
      qrPayload: updated.qrPayload,
      detail: generated.detail,
    };
  }

  async generateLinksByTasks(
    taskIds: string[],
    preferredChannel?: string,
    operatorId?: string,
  ) {
    const uniqueTaskIds = Array.from(
      new Set(taskIds.map((item) => String(item).trim()).filter(Boolean)),
    ).slice(0, 500);
    if (uniqueTaskIds.length === 0) {
      throw new BadRequestException('TASK_IDS_REQUIRED');
    }

    const items: Array<{
      taskId: string;
      success: boolean;
      message: string;
      rechargeLink: string | null;
      selectedChannel: string | null;
      fallbackUsed: boolean;
    }> = [];

    for (const taskId of uniqueTaskIds) {
      try {
        const generated = await this.generateLink(taskId, operatorId, {
          useExternalApi: true,
          channel: preferredChannel,
        });
        items.push({
          taskId,
          success: true,
          message: '生成成功',
          rechargeLink: generated.rechargeLink ?? null,
          selectedChannel: generated.detail.channel ?? null,
          fallbackUsed: Boolean(generated.detail.fallbackUsed),
        });
      } catch (error) {
        const text = error instanceof Error ? error.message : '生成失败';
        items.push({
          taskId,
          success: false,
          message: text,
          rechargeLink: null,
          selectedChannel: null,
          fallbackUsed: false,
        });
      }
    }

    return {
      total: uniqueTaskIds.length,
      success: items.filter((item) => item.success).length,
      items,
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

  async refreshTaskVip(taskId: string, operatorId?: string) {
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

    const accessToken = this.getAccessTokenFromTask(task);
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }

    const vipSnapshot = await this.externalIntegrationService.vipOverview(
      { accessToken },
      operatorId,
    );
    await this.prisma.userSubmission.update({
      where: { id: task.userSubmissionId },
      data: {
        userVipJson: vipSnapshot.userVip as Prisma.InputJsonValue,
        winkVipJson: vipSnapshot.winkVip as Prisma.InputJsonValue,
        vipFetchedAt: new Date(),
      },
    });
    const updated = await this.prisma.rechargeTask.update({
      where: { id: taskId },
      data: {
        apiStatus: 'vip_refreshed',
        apiMessage: 'VIP 信息已刷新',
        lastApiAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: operatorId ?? null,
        action: 'RECHARGE_TASK_VIP_REFRESH',
        targetType: 'recharge_task',
        targetId: taskId,
        metadataJson: {
          hasUserVip: true,
          hasWinkVip: true,
        },
      },
    });

    return {
      taskId,
      status: updated.status,
      apiStatus: updated.apiStatus,
      apiMessage: updated.apiMessage,
    };
  }
}
