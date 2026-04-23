import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TokenStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RiskControlService } from '../risk-control/risk-control.service';
import { ExternalIntegrationService } from '../external-integration/external-integration.service';
import { CaptchaOcrService } from './captcha-ocr.service';
import { CreateTokenDto } from './dto/create-token.dto';
import { SubmitTokenDto } from './dto/submit-token.dto';
import {
  createRandomToken,
  decryptText,
  encryptText,
  hashPlainText,
  maskPhone,
  normalizePhone,
} from '../../common/security/crypto.util';

type SmsSession = {
  token: string;
  phone: string;
  unloginToken: string;
  phoneCc: string;
  deviceId: string;
  expiresAt: number;
};

type QrSession = {
  token: string;
  unloginToken: string;
  qrCode: string;
  deviceId: string;
  expiresAt: number;
  verified: boolean;
  accessToken?: string;
  refreshToken?: string;
  cookie?: string;
  uid?: string;
  raw?: unknown;
};

type LoginResolveResult = {
  mode: 'sms' | 'qr';
  credential: string;
  accessToken: string;
  refreshToken?: string;
  cookie?: string;
  uid?: string;
  raw?: unknown;
};

const SMS_SESSION_TTL_MS = 10 * 60 * 1000;
const QR_SESSION_TTL_MS = 120 * 1000;
const TOKEN_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const TOKEN_DELETE_AFTER_EXPIRED_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TokenService {
  private readonly smsCooldownMap = new Map<string, number>();
  private readonly smsSessionMap = new Map<string, SmsSession>();
  private readonly qrSessionMap = new Map<string, QrSession>();
  private lastTokenCleanupAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskControlService: RiskControlService,
    private readonly externalIntegrationService: ExternalIntegrationService,
    private readonly captchaOcrService: CaptchaOcrService,
  ) {}

  private buildPseudoPhone(seed: string) {
    const hash = hashPlainText(seed || 'qr-login-seed');
    let digits = '';
    for (const ch of hash) {
      digits += String(parseInt(ch, 16) % 10);
      if (digits.length >= 8) {
        break;
      }
    }
    return `199${digits.padEnd(8, '0')}`;
  }

  private isQrExpiredError(message: string) {
    if (!message) {
      return false;
    }
    const lower = message.toLowerCase();
    return (
      lower.includes('expired') ||
      lower.includes('timeout') ||
      lower.includes('invalid') ||
      message.includes('过期') ||
      message.includes('失效')
    );
  }

  private registerTokenSubmitFailure(ip?: string) {
    const state = this.riskControlService.registerFailure('token_submit', ip);
    if (state.bannedUntil && state.bannedUntil > Date.now()) {
      throw new ForbiddenException('TOKEN_SUBMIT_BANNED_1H');
    }
  }

  private ensureTokenSubmitAllowed(ip?: string) {
    if (this.riskControlService.isBanned('token_submit', ip)) {
      throw new ForbiddenException('TOKEN_SUBMIT_BANNED_1H');
    }
  }

  private normalizeTokenOrThrow(token: string, submitIp?: string) {
    const normalized = String(token ?? '').trim();
    if (!/^tk_[a-zA-Z0-9_-]{8,}$/.test(normalized)) {
      this.registerTokenSubmitFailure(submitIp);
      throw new BadRequestException('TOKEN_INVALID');
    }
    return normalized;
  }

  private cleanupAuthCache() {
    const now = Date.now();
    for (const [key, value] of this.smsSessionMap.entries()) {
      if (value.expiresAt <= now) {
        this.smsSessionMap.delete(key);
      }
    }
    for (const [key, value] of this.qrSessionMap.entries()) {
      if (value.expiresAt <= now) {
        this.qrSessionMap.delete(key);
      }
    }
    for (const [key, value] of this.smsCooldownMap.entries()) {
      if (value <= now) {
        this.smsCooldownMap.delete(key);
      }
    }
  }

  private async syncAndCleanupTokens(force = false) {
    const now = Date.now();
    if (!force && now - this.lastTokenCleanupAt < TOKEN_CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastTokenCleanupAt = now;
    const nowDate = new Date(now);
    const staleCutoff = new Date(now - TOKEN_DELETE_AFTER_EXPIRED_MS);

    await this.prisma.issueToken.updateMany({
      where: {
        status: TokenStatus.active,
        expiresAt: { lte: nowDate },
      },
      data: { status: TokenStatus.expired },
    });

    await this.prisma.issueToken.deleteMany({
      where: {
        status: TokenStatus.expired,
        expiresAt: { lte: staleCutoff },
      },
    });

    await this.prisma.rechargeTask.deleteMany({
      where: {
        userSubmission: {
          submittedAt: { lte: staleCutoff },
        },
      },
    });
    await this.prisma.userSubmission.deleteMany({
      where: {
        submittedAt: { lte: staleCutoff },
      },
    });
  }

  private shouldRetrySmsFlow(message: string) {
    const normalized = String(message ?? '').toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized.includes('captcha_auto_recognize_failed') ||
      normalized.includes('captcha') ||
      normalized.includes('verify') ||
      normalized.includes('captcha_ocr_')
    );
  }

  private getErrorCode(error: unknown, fallback = 'REQUEST_FAILED') {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string' && response.trim()) {
        return response.trim();
      }
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof (response as { message?: unknown }).message === 'string'
      ) {
        const message = String((response as { message: string }).message).trim();
        if (message) {
          return message;
        }
      }
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return fallback;
  }

  private async getActiveTokenOrThrow(token: string, submitIp?: string) {
    const issueToken = await this.prisma.issueToken.findUnique({
      where: { token },
    });
    if (!issueToken) {
      this.registerTokenSubmitFailure(submitIp);
      throw new NotFoundException('TOKEN_NOT_FOUND');
    }

    if (issueToken.status === TokenStatus.active) {
      if (issueToken.expiresAt.getTime() <= Date.now()) {
        await this.prisma.issueToken.update({
          where: { id: issueToken.id },
          data: { status: TokenStatus.expired },
        });
        this.registerTokenSubmitFailure(submitIp);
        throw new BadRequestException('TOKEN_EXPIRED');
      }
      return issueToken;
    }

    if (issueToken.status === TokenStatus.expired) {
      this.registerTokenSubmitFailure(submitIp);
      throw new BadRequestException('TOKEN_EXPIRED');
    }

    this.registerTokenSubmitFailure(submitIp);
    throw new BadRequestException('TOKEN_INVALID');
  }

  private getSmsCooldownKey(token: string, phone: string, ip?: string) {
    return `${token}:${phone}:${ip ?? '127.0.0.1'}`;
  }

  private getSmsSessionOrThrow(sessionId: string, token: string) {
    const normalizedId = String(sessionId ?? '').trim();
    const session = this.smsSessionMap.get(normalizedId);
    if (!session || session.expiresAt <= Date.now() || session.token !== token) {
      throw new BadRequestException('SMS_SESSION_INVALID');
    }
    return session;
  }

  private ensureSmsSessionPhone(session: SmsSession, phone: string) {
    if (session.phone !== phone) {
      throw new BadRequestException('SMS_SESSION_PHONE_MISMATCH');
    }
  }

  private extractQrSignals(raw: unknown) {
    const serialized = JSON.stringify(raw ?? {}).toLowerCase();
    const expiredByText =
      serialized.includes('expired') ||
      serialized.includes('timeout') ||
      serialized.includes('invalid');
    const scannedByText =
      serialized.includes('scanned') ||
      serialized.includes('confirm') ||
      serialized.includes('authorized') ||
      serialized.includes('allow');

    const response =
      raw && typeof raw === 'object'
        ? ((raw as Record<string, unknown>).response as Record<string, unknown>)
        : undefined;
    const statusValue =
      response && typeof response === 'object' ? response.status : undefined;
    const statusCode = Number(statusValue);
    const expiredByCode =
      Number.isFinite(statusCode) && [2, 4, 410, 408].includes(statusCode);
    const scannedByCode =
      Number.isFinite(statusCode) && [1, 3, 200, 201].includes(statusCode);

    const expired = expiredByText || expiredByCode;
    const scanned = !expired && (scannedByText || scannedByCode);
    return {
      scanned,
      expired,
    };
  }

  private getQrSessionOrThrow(sessionId: string, token: string) {
    const normalizedId = String(sessionId ?? '').trim();
    const session = this.qrSessionMap.get(normalizedId);
    if (!session || session.expiresAt <= Date.now() || session.token !== token) {
      throw new BadRequestException('QR_SESSION_INVALID');
    }
    return session;
  }

  async createSmsBootstrap(token: string, submitIp?: string, autoOcr = true) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();
    await this.syncAndCleanupTokens();

    const normalizedToken = this.normalizeTokenOrThrow(token, submitIp);
    const issueToken = await this.getActiveTokenOrThrow(normalizedToken, submitIp);

    const bootstrap = await this.externalIntegrationService.smsBootstrap({
      autoOcr,
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        action: 'TOKEN_SMS_BOOTSTRAP',
        targetType: 'issue_token',
        targetId: issueToken.id,
      },
    });

    return {
      phoneCc: String(bootstrap.phoneCc ?? 86),
      captchaImageDataUrl: `data:${bootstrap.captchaMimeType};base64,${bootstrap.captchaBase64}`,
      captchaAutoText: bootstrap.captchaAutoText ?? null,
      captchaAutoError: bootstrap.captchaAutoError ?? null,
      expiresInSec: Math.floor(SMS_SESSION_TTL_MS / 1000),
    };
  }

  async sendSmsCode(token: string, phone: string, submitIp?: string) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();
    await this.syncAndCleanupTokens();

    const normalizedToken = this.normalizeTokenOrThrow(token, submitIp);
    const normalizedPhone = normalizePhone(phone);
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      throw new BadRequestException('PHONE_INVALID');
    }
    const issueToken = await this.getActiveTokenOrThrow(normalizedToken, submitIp);
    const cooldownKey = this.getSmsCooldownKey(
      normalizedToken,
      normalizedPhone,
      submitIp,
    );
    const now = Date.now();
    const nextAllowedAt = this.smsCooldownMap.get(cooldownKey) ?? 0;
    if (nextAllowedAt > now) {
      const remainSec = Math.max(1, Math.ceil((nextAllowedAt - now) / 1000));
      return { success: false, retryAfterSec: remainSec, message: 'SMS_WAIT' };
    }

    let sessionToSave: SmsSession | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const bootstrap = await this.externalIntegrationService.smsBootstrap({
          autoOcr: false,
        });
        const solvedCaptcha = await this.captchaOcrService.recognizeCaptcha(
          bootstrap.captchaBase64,
        );

        await this.externalIntegrationService.smsSendCode({
          unloginToken: bootstrap.unloginToken,
          phone: normalizedPhone,
          phoneCc: String(bootstrap.phoneCc ?? 86),
          captcha: solvedCaptcha,
          deviceId: bootstrap.deviceId,
        });

        sessionToSave = {
          token: normalizedToken,
          phone: normalizedPhone,
          unloginToken: bootstrap.unloginToken,
          phoneCc: String(bootstrap.phoneCc ?? 86),
          deviceId: bootstrap.deviceId,
          expiresAt: Date.now() + SMS_SESSION_TTL_MS,
        };
        break;
      } catch (error) {
        lastError = error;
        const raw = this.getErrorCode(error, 'SMS_SEND_FAILED');
        if (!this.shouldRetrySmsFlow(raw) || attempt >= 2) {
          if (raw !== 'EXTERNAL_NETWORK_ERROR' && !raw.startsWith('EXTERNAL_HTTP_5')) {
            this.registerTokenSubmitFailure(submitIp);
          }
          if (error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException(raw);
        }
      }
    }

    if (!sessionToSave) {
      const raw = this.getErrorCode(lastError, 'SMS_SEND_FAILED');
      throw new BadRequestException(raw);
    }

    const smsSessionId = createRandomToken('sms_');
    this.smsSessionMap.set(smsSessionId, sessionToSave);
    this.smsCooldownMap.set(cooldownKey, now + 60 * 1000);
    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        action: 'TOKEN_SMS_SEND_REQUEST',
        targetType: 'issue_token',
        targetId: issueToken.id,
        metadataJson: {
          phoneMasked: maskPhone(normalizedPhone),
        },
      },
    });
    this.riskControlService.resetFailure('token_submit', submitIp);

    return {
      success: true,
      retryAfterSec: 60,
      smsSessionId,
      message: 'SMS_SENT',
    };
  }

  async createQrSession(token: string, submitIp?: string) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();
    await this.syncAndCleanupTokens();

    const normalizedToken = this.normalizeTokenOrThrow(token, submitIp);
    await this.getActiveTokenOrThrow(normalizedToken, submitIp);

    const qr = await this.externalIntegrationService.qrCreate({});
    const qrSessionId = createRandomToken('qr_');
    const qrImageDataUrl = await QRCode.toDataURL(qr.qrCode);
    this.qrSessionMap.set(qrSessionId, {
      token: normalizedToken,
      unloginToken: qr.unloginToken,
      qrCode: qr.qrCode,
      deviceId: qr.deviceId,
      verified: false,
      expiresAt: Date.now() + QR_SESSION_TTL_MS,
    });

    return {
      qrSessionId,
      qrCode: qr.qrCode,
      qrImageDataUrl,
      expiresInSec: Math.floor(QR_SESSION_TTL_MS / 1000),
    };
  }

  async getQrStatus(sessionId: string, submitIp?: string) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();

    const normalizedId = String(sessionId ?? '').trim();
    const session = this.qrSessionMap.get(normalizedId);
    if (!session || session.expiresAt <= Date.now()) {
      throw new BadRequestException('QR_SESSION_INVALID');
    }

    let raw: unknown;
    try {
      raw = await this.externalIntegrationService.qrStatus({
        qrCode: session.qrCode,
        unloginToken: session.unloginToken,
        deviceId: session.deviceId,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : '';
      if (this.isQrExpiredError(text)) {
        this.qrSessionMap.delete(normalizedId);
        return {
          qrSessionId: normalizedId,
          verified: false,
          scanned: false,
          expired: true,
          raw: { error: text || 'QR_EXPIRED' },
        };
      }
      throw error;
    }
    const signal = this.extractQrSignals(raw);
    if (signal.expired) {
      this.qrSessionMap.delete(normalizedId);
    }

    return {
      qrSessionId: normalizedId,
      verified: session.verified,
      scanned: signal.scanned,
      expired: signal.expired,
      raw,
    };
  }

  async loginByQr(token: string, qrSessionId: string, submitIp?: string) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();
    await this.syncAndCleanupTokens();

    const normalizedToken = this.normalizeTokenOrThrow(token, submitIp);
    await this.getActiveTokenOrThrow(normalizedToken, submitIp);
    const session = this.getQrSessionOrThrow(qrSessionId, normalizedToken);

    const result = await this.externalIntegrationService.qrLogin({
      qrCode: session.qrCode,
      unloginToken: session.unloginToken,
      deviceId: session.deviceId,
    });

    const qrAccessToken = String(result.accessToken ?? '').trim();
    if (!qrAccessToken) {
      throw new BadRequestException('EXTERNAL_LOGIN_FAILED');
    }

    this.qrSessionMap.set(qrSessionId, {
      ...session,
      verified: true,
      accessToken: qrAccessToken,
      refreshToken: result.refreshToken ? String(result.refreshToken) : undefined,
      cookie: result.cookie ? String(result.cookie) : undefined,
      uid: result.uid ? String(result.uid) : undefined,
      raw: result.raw,
      expiresAt: Date.now() + QR_SESSION_TTL_MS,
    });
    this.riskControlService.resetFailure('token_submit', submitIp);

    return {
      success: true,
      qrSessionId,
      uid: result.uid ?? null,
    };
  }

  async createToken(dto: CreateTokenDto, createdBy?: string) {
    await this.syncAndCleanupTokens(true);
    const expiresInMinutes = dto.expiresInMinutes ?? 60;
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
    await this.syncAndCleanupTokens(true);
    const tokens = await this.prisma.issueToken.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
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

  async unbanToken(id: string) {
    await this.syncAndCleanupTokens(true);
    const token = await this.prisma.issueToken.findFirst({
      where: { OR: [{ id }, { token: id }] },
    });
    if (!token) {
      throw new NotFoundException('TOKEN_NOT_FOUND');
    }
    if (token.status === TokenStatus.consumed) {
      throw new BadRequestException('TOKEN_ALREADY_CONSUMED');
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('TOKEN_EXPIRED');
    }

    const updated = await this.prisma.issueToken.update({
      where: { id: token.id },
      data: {
        status: TokenStatus.active,
        revokedAt: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        action: 'TOKEN_UNBAN',
        targetType: 'issue_token',
        targetId: updated.id,
      },
    });
    return { id: updated.id, status: updated.status };
  }

  async getTokenStatus(token: string) {
    await this.syncAndCleanupTokens(true);
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
            remark: latestTask.remark,
            apiMessage: latestTask.apiMessage,
          }
        : null,
    };
  }

  private async resolveLogin(
    normalizedToken: string,
    dto: SubmitTokenDto,
  ): Promise<LoginResolveResult> {
    const mode = dto.loginMode === 'qr' ? 'qr' : 'sms';
    if (mode === 'qr') {
      if (!dto.qrSessionId) {
        throw new BadRequestException('QR_SESSION_REQUIRED');
      }
      const qrSession = this.getQrSessionOrThrow(dto.qrSessionId, normalizedToken);
      if (!qrSession.verified || !qrSession.accessToken) {
        throw new BadRequestException('QR_LOGIN_REQUIRED');
      }
      return {
        mode: 'qr',
        credential: `QR:${qrSession.uid ?? 'verified'}`,
        accessToken: qrSession.accessToken,
        refreshToken: qrSession.refreshToken,
        cookie: qrSession.cookie,
        uid: qrSession.uid,
        raw: qrSession.raw,
      };
    }

    const smsCode = String(dto.smsCode ?? '').trim();
    if (!smsCode) {
      throw new BadRequestException('SMSCODE_INVALID');
    }
    const normalizedPhone = normalizePhone(String(dto.phone ?? ''));
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      throw new BadRequestException('PHONE_INVALID');
    }
    if (!dto.smsSessionId) {
      throw new BadRequestException('SMS_SESSION_REQUIRED');
    }
    const smsSession = this.getSmsSessionOrThrow(dto.smsSessionId, normalizedToken);
    this.ensureSmsSessionPhone(smsSession, normalizedPhone);
    const loginResult = await this.externalIntegrationService.smsLogin({
      unloginToken: smsSession.unloginToken,
      phone: normalizedPhone,
      phoneCc: smsSession.phoneCc,
      verifyCode: smsCode,
      deviceId: smsSession.deviceId,
    });
    const smsAccessToken = String(loginResult.accessToken ?? '').trim();
    if (!smsAccessToken) {
      throw new BadRequestException('EXTERNAL_LOGIN_FAILED');
    }
    return {
      mode: 'sms',
      credential: smsCode,
      accessToken: smsAccessToken,
      refreshToken: loginResult.refreshToken
        ? String(loginResult.refreshToken)
        : undefined,
      cookie: loginResult.cookie ? String(loginResult.cookie) : undefined,
      uid: loginResult.uid ? String(loginResult.uid) : undefined,
      raw: loginResult.raw,
    };
  }

  async submitToken(
    token: string,
    dto: SubmitTokenDto,
    submitIp?: string,
    userAgent?: string,
  ) {
    this.riskControlService.recordAttempt('token_submit', submitIp);
    this.ensureTokenSubmitAllowed(submitIp);
    this.cleanupAuthCache();
    await this.syncAndCleanupTokens();

    const normalizedToken = this.normalizeTokenOrThrow(token, submitIp);
    const loginMode = dto.loginMode === 'qr' ? 'qr' : 'sms';

    const issueToken = await this.getActiveTokenOrThrow(normalizedToken, submitIp);
    let login: LoginResolveResult;
    try {
      login = await this.resolveLogin(normalizedToken, dto);
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      if (raw !== 'EXTERNAL_NETWORK_ERROR' && !raw.startsWith('EXTERNAL_HTTP_5')) {
        this.registerTokenSubmitFailure(submitIp);
      }
      throw error;
    }
    let resolvedPhoneRaw =
      loginMode === 'sms'
        ? normalizePhone(String(dto.phone ?? ''))
        : this.buildPseudoPhone(login.uid ?? normalizedToken);

    if (loginMode === 'qr') {
      try {
        const credible = await this.externalIntegrationService.crediblePhone({
          accessToken: login.accessToken,
          cookie: login.cookie,
        });
        const crediblePhone = normalizePhone(String(credible?.phone ?? ''));
        if (crediblePhone.length >= 6) {
          resolvedPhoneRaw = crediblePhone;
        }
      } catch {
        // ignore credible_phone errors; QR mode keeps pseudo phone fallback
      }
    }

    const normalizedPhone = resolvedPhoneRaw;
    if (loginMode === 'sms' && !/^1\d{10}$/.test(normalizedPhone)) {
      throw new BadRequestException('PHONE_INVALID');
    }
    const phoneMaskedForStore =
      loginMode === 'sms' ? maskPhone(normalizedPhone) : '-';

    let vipSnapshot: { userVip: unknown; winkVip: unknown } | null = null;
    let vipFetchError = '';
    try {
      vipSnapshot = await this.externalIntegrationService.vipOverview({
        accessToken: login.accessToken,
        cookie: login.cookie,
      });
    } catch (error) {
      vipFetchError = error instanceof Error ? error.message : 'VIP_FETCH_FAILED';
    }

    let result: { submissionId: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
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
            smsCodeEnc: encryptText(login.credential),
            accessTokenEnc: encryptText(login.accessToken),
            refreshTokenEnc: login.refreshToken
              ? encryptText(login.refreshToken)
              : null,
            cookieEnc: login.cookie ? encryptText(login.cookie) : null,
            externalUid: login.uid ?? null,
            loginPayloadJson:
              login.raw != null ? (login.raw as Prisma.InputJsonValue) : undefined,
            userVipJson: vipSnapshot
              ? (vipSnapshot.userVip as Prisma.InputJsonValue)
              : undefined,
            winkVipJson: vipSnapshot
              ? (vipSnapshot.winkVip as Prisma.InputJsonValue)
              : undefined,
            vipFetchedAt: vipSnapshot ? new Date() : null,
            submitIp: submitIp?.slice(0, 64),
            userAgent: userAgent?.slice(0, 255),
          },
        });
        await tx.rechargeTask.create({
          data: {
            userSubmissionId: submission.id,
            status: 'pending',
            apiStatus: vipSnapshot ? 'ready' : 'vip_fetch_failed',
            apiMessage: vipSnapshot
              ? '已记录 VIP 信息，可直接查询可开通渠道'
              : `VIP 信息拉取失败: ${vipFetchError || '未知错误'}`,
            availableChannelsJson: [] as Prisma.InputJsonValue,
            lastApiAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'user',
            action: 'TOKEN_SUBMIT_SUCCESS',
            targetType: 'issue_token',
            targetId: issueToken.id,
            metadataJson: {
              phoneMasked: phoneMaskedForStore,
              loginMode: login.mode,
              uid: login.uid ?? null,
              hasAccessToken: Boolean(login.accessToken),
              vipSnapshotReady: Boolean(vipSnapshot),
              vipFetchError: vipFetchError || null,
            },
          },
        });
        return { submissionId: submission.id };
      });
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        String(error.message).includes('TOKEN_INVALID')
      ) {
        this.registerTokenSubmitFailure(submitIp);
      }
      throw error;
    }

    if (dto.smsSessionId) {
      this.smsSessionMap.delete(dto.smsSessionId);
    }
    if (dto.qrSessionId) {
      this.qrSessionMap.delete(dto.qrSessionId);
    }
    this.riskControlService.resetFailure('token_submit', submitIp);

    return {
      success: true,
      token: normalizedToken,
      phoneMasked: phoneMaskedForStore,
      status: TokenStatus.consumed,
      loginMode: login.mode,
      submissionId: result.submissionId,
    };
  }
}



