import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { ProxyAgent } from 'undici';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { getOutboundProxyConfig } from '../../common/http/proxy-config';
import { normalizePhone } from '../../common/security/crypto.util';
import { SmsBootstrapDto } from './dto/sms-bootstrap.dto';
import { SmsSendCodeDto } from './dto/sms-send-code.dto';
import { SmsLoginDto } from './dto/sms-login.dto';
import { QrCreateDto } from './dto/qr-create.dto';
import { QrStatusDto } from './dto/qr-status.dto';
import { QrLoginDto } from './dto/qr-login.dto';
import { VipOverviewDto } from './dto/vip-overview.dto';

type RawJson = Record<string, unknown>;
type PayloadValue = string | number | boolean;

export type RechargeChannel = '联想' | '网页' | 'Android';

export type RechargeFlowInput = {
  channel: RechargeChannel;
  accessToken: string;
  cookie?: string;
  transactionPayload?: Record<string, PayloadValue>;
  orderPayload?: Record<string, PayloadValue>;
  cashierPayload?: Record<string, PayloadValue>;
  actorId?: string;
};

export type ChannelCapabilityCheck = {
  channel: RechargeChannel;
  canRecharge: boolean;
  priceValue: number | null;
  reason: string;
};

export type CrediblePhoneResult = {
  phone: string;
  phoneCc: string;
  phoneType: string;
};

@Injectable()
export class ExternalIntegrationService {
  private readonly suggestClientId = process.env.EXTERNAL_SUGGEST_CLIENT_ID
    ? Number(process.env.EXTERNAL_SUGGEST_CLIENT_ID)
    : 1189857434;

  private readonly appClientId = process.env.EXTERNAL_APP_CLIENT_ID
    ? Number(process.env.EXTERNAL_APP_CLIENT_ID)
    : 1089867636;

  private readonly zipVersion = process.env.EXTERNAL_ZIP_VERSION ?? '2.9.91';
  private readonly webVersion = process.env.EXTERNAL_WEB_VERSION ?? '2.9.0';
  private readonly defaultDeviceId =
    process.env.EXTERNAL_DEFAULT_DEVICE_ID ?? 'web-default-device';
  private readonly userAgent =
    process.env.EXTERNAL_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  private proxyAgent?: ProxyAgent;
  private proxyAgentKey = '';

  constructor(private readonly prisma: PrismaService) {}

  private getDeviceId(deviceId?: string) {
    return (deviceId?.trim() || this.defaultDeviceId).slice(0, 64);
  }

  private getDispatcher() {
    const proxy = getOutboundProxyConfig();
    if (!proxy.enabled || !proxy.proxyUrl) {
      return undefined;
    }
    if (!this.proxyAgent || this.proxyAgentKey !== proxy.proxyUrl) {
      this.proxyAgent = new ProxyAgent(proxy.proxyUrl);
      this.proxyAgentKey = proxy.proxyUrl;
    }
    return this.proxyAgent;
  }

  private async requestJson(
    url: string,
    init: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      form?: Record<string, string>;
    } = {},
  ) {
    const body = init.form
      ? new URLSearchParams(init.form).toString()
      : undefined;
    const headers: Record<string, string> = {
      Accept: '*/*',
      'Accept-Language': 'zh-CN',
      'User-Agent': this.userAgent,
      ...(init.headers ?? {}),
    };
    if (body && !headers['Content-Type']) {
      headers['Content-Type'] =
        'application/x-www-form-urlencoded; charset=UTF-8';
    }

    const requestInit = {
      method: init.method ?? 'GET',
      headers,
      body,
      dispatcher: this.getDispatcher(),
    };

    let response: Response;
    try {
      response = await fetch(url, requestInit);
    } catch {
      throw new BadGatewayException('EXTERNAL_NETWORK_ERROR');
    }

    const rawText = await response.text();
    let parsed: unknown = rawText;
    try {
      parsed = JSON.parse(rawText) as RawJson;
    } catch {
      throw new BadGatewayException('EXTERNAL_RESPONSE_INVALID_JSON');
    }
    if (!response.ok) {
      throw new BadGatewayException(`EXTERNAL_HTTP_${response.status}`);
    }
    return { response, data: parsed as RawJson };
  }

  private async requestBinary(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ contentType: string; base64: string }> {
    const requestInit = {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'zh-CN',
        'User-Agent': this.userAgent,
        ...headers,
      },
      dispatcher: this.getDispatcher(),
    };

    let response: Response;
    try {
      response = await fetch(url, requestInit);
    } catch {
      throw new BadGatewayException('EXTERNAL_NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new BadGatewayException(`EXTERNAL_HTTP_${response.status}`);
    }

    const arr = await response.arrayBuffer();
    return {
      contentType: response.headers.get('content-type') ?? 'image/png',
      base64: Buffer.from(arr).toString('base64'),
    };
  }

  private assertApiSuccess(data: RawJson) {
    const meta = data.meta as RawJson | undefined;
    if (typeof meta?.code === 'number' && meta.code !== 0) {
      throw new BadRequestException(
        this.toSafeMessage(meta.msg ?? meta.error ?? 'EXTERNAL_API_FAILED'),
      );
    }
    if (typeof data.code === 'number' && data.code !== 0) {
      throw new BadRequestException(
        this.toSafeMessage(data.message ?? data.msg ?? 'EXTERNAL_API_FAILED'),
      );
    }
  }

  private toSafeMessage(input: unknown) {
    return typeof input === 'string' && input.trim()
      ? input.trim()
      : 'EXTERNAL_API_FAILED';
  }

  private encodeSmsCaptcha(captcha: string, unloginToken: string) {
    const raw = String(captcha ?? '').trim().toLowerCase();
    const token = String(unloginToken ?? '').trim();
    if (!raw || !token) {
      return '';
    }
    const first = createHash('md5')
      .update(`${raw}${token}${this.zipVersion}`, 'utf8')
      .digest('hex');
    return createHash('md5').update(first, 'utf8').digest('hex');
  }

  private toStringRecord(source: Record<string, PayloadValue> = {}) {
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, String(value)]),
    );
  }

  private findFirstStringValue(
    source: unknown,
    keyHintList: string[],
  ): string | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    const normalizedHints = keyHintList.map((item) => item.toLowerCase());
    const stack: unknown[] = [source];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') {
        continue;
      }
      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
        continue;
      }
      for (const [key, value] of Object.entries(current)) {
        const lowerKey = key.toLowerCase();
        if (
          normalizedHints.some((hint) => lowerKey.includes(hint)) &&
          typeof value === 'string' &&
          value.trim()
        ) {
          return value.trim();
        }
        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
    return undefined;
  }

  private findFirstNumberValue(source: unknown, keyHintList: string[]) {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    const normalizedHints = keyHintList.map((item) => item.toLowerCase());
    const stack: unknown[] = [source];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') {
        continue;
      }
      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
        continue;
      }
      for (const [key, value] of Object.entries(current)) {
        const lowerKey = key.toLowerCase();
        if (normalizedHints.some((hint) => lowerKey.includes(hint))) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }
        }
        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
    return undefined;
  }

  private async logAction(
    actorId: string | undefined,
    action: string,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: actorId ?? null,
        action,
        targetType: 'external_api',
        targetId: action,
        metadataJson: payload as Prisma.InputJsonValue,
      },
    });
  }

  async smsBootstrap(dto: SmsBootstrapDto, actorId?: string) {
    const deviceId = this.getDeviceId(dto.deviceId);
    const suggestUrl = new URL(
      'https://api.account.meitu.com/common/suggest_phone_cc.json',
    );
    suggestUrl.searchParams.set('client_id', String(this.suggestClientId));
    suggestUrl.searchParams.set('client_language', 'zh-CN');
    suggestUrl.searchParams.set('os_type', 'web');
    suggestUrl.searchParams.set('sid', '');
    suggestUrl.searchParams.set('zip_version', this.zipVersion);
    suggestUrl.searchParams.set('web_version', this.webVersion);
    suggestUrl.searchParams.set('is_web', '1');
    suggestUrl.searchParams.set('mt_g', deviceId);

    const suggestResult = await this.requestJson(suggestUrl.toString(), {
      method: 'GET',
    });
    this.assertApiSuccess(suggestResult.data);

    const unloginToken =
      suggestResult.response.headers.get('unlogin-token') ??
      suggestResult.response.headers.get('Unlogin-Token') ??
      '';
    if (!unloginToken) {
      throw new BadGatewayException('UNLOGIN_TOKEN_MISSING');
    }

    const responseData = suggestResult.data.response as RawJson | undefined;
    const phoneCc = Number(responseData?.phone_cc ?? 86);

    const captchaUrl = new URL(
      'https://api.account.meitu.com/captcha/show.json',
    );
    captchaUrl.searchParams.set('t', String(Date.now()));
    captchaUrl.searchParams.set('unlogin_token', unloginToken);
    captchaUrl.searchParams.set('client_id', String(this.appClientId));
    captchaUrl.searchParams.set('zip_version', this.zipVersion);
    const captcha = await this.requestBinary(captchaUrl.toString(), {
      'Unlogin-Token': unloginToken,
      Referer: 'https://account.meitu.com/',
    });

    await this.logAction(actorId, 'EXTERNAL_SMS_BOOTSTRAP', {
      deviceId,
      phoneCc,
      proxyEnabled: Boolean(getOutboundProxyConfig().enabled),
    });

    return {
      unloginToken,
      phoneCc,
      captchaMimeType: captcha.contentType,
      captchaBase64: captcha.base64,
      deviceId,
    };
  }

  async smsSendCode(dto: SmsSendCodeDto, actorId?: string) {
    const deviceId = this.getDeviceId(dto.deviceId);
    const encodedCaptcha = this.encodeSmsCaptcha(dto.captcha, dto.unloginToken);
    if (!encodedCaptcha) {
      throw new BadRequestException('CAPTCHA_INVALID');
    }
    const url = 'https://api.account.meitu.com/common/login_verify_code';
    const form = {
      client_id: String(this.suggestClientId + 1),
      client_language: 'zh-CN',
      os_type: 'web',
      sid: '',
      zip_version: this.zipVersion,
      web_version: this.webVersion,
      is_web: '1',
      app_package: '',
      source_from: '',
      mt_g: deviceId,
      type: 'reset_password',
      phone_cc: String(dto.phoneCc),
      phone: normalizePhone(dto.phone),
      captcha: encodedCaptcha,
    };
    const result = await this.requestJson(url, {
      method: 'POST',
      form,
      headers: {
        'Unlogin-Token': dto.unloginToken.trim(),
        Referer: url,
      },
    });
    this.assertApiSuccess(result.data);

    await this.logAction(actorId, 'EXTERNAL_SMS_SEND_CODE', {
      phoneMasked: `${String(dto.phone).slice(0, 3)}****${String(dto.phone).slice(-4)}`,
      phoneCc: dto.phoneCc,
      deviceId,
    });
    return result.data;
  }

  async smsLogin(dto: SmsLoginDto, actorId?: string) {
    const deviceId = this.getDeviceId(dto.deviceId);
    const url = 'https://account.meitu.com/oauth/access_token.json';
    const form = {
      client_id: String(this.suggestClientId + 1),
      client_language: 'zh-Hans',
      os_type: 'web',
      zip_version: this.zipVersion,
      web_version: this.webVersion,
      is_web: '1',
      app_package: 'com.meitu.mtxx',
      source_from: '',
      grant_type: 'phone_login_by_login_verify_code',
      phone: normalizePhone(dto.phone),
      phone_cc: String(dto.phoneCc),
      verify_code: dto.verifyCode,
      agreed_authorization: '1',
      mt_g: deviceId,
    };
    const result = await this.requestJson(url, {
      method: 'POST',
      form,
      headers: {
        'Unlogin-Token': dto.unloginToken.trim(),
        Referer: url,
      },
    });
    this.assertApiSuccess(result.data);
    const responseData = result.data.response as RawJson | undefined;
    const accessToken =
      this.findFirstStringValue(result.data, ['access_token', 'accesstoken']) ??
      '';
    const refreshToken =
      this.findFirstStringValue(result.data, ['refresh_token', 'refreshtoken']) ??
      '';
    const uidRaw =
      this.findFirstNumberValue(result.data, ['uid']) ??
      this.findFirstStringValue(result.data, ['uid']) ??
      null;

    await this.logAction(actorId, 'EXTERNAL_SMS_LOGIN', {
      uid: uidRaw,
      hasToken: Boolean(accessToken),
      deviceId,
    });

    return {
      accessToken,
      refreshToken,
      uid: uidRaw,
      raw: result.data,
    };
  }

  async qrCreate(dto: QrCreateDto, actorId?: string) {
    const bootstrap =
      dto.unloginToken && dto.unloginToken.trim()
        ? {
            unloginToken: dto.unloginToken.trim(),
            phoneCc: 86,
            deviceId: this.getDeviceId(dto.deviceId),
          }
        : await this.smsBootstrap({ deviceId: dto.deviceId }, actorId);

    const url = new URL('https://api.account.meitu.com/qr/get_code');
    url.searchParams.set('client_id', String(this.appClientId));
    url.searchParams.set('client_language', 'zh-CN');
    url.searchParams.set('os_type', 'web');
    url.searchParams.set('sid', '');
    url.searchParams.set('zip_version', this.zipVersion);
    url.searchParams.set('web_version', this.webVersion);
    url.searchParams.set('is_web', '1');
    url.searchParams.set('mt_g', bootstrap.deviceId);

    const result = await this.requestJson(url.toString(), {
      headers: {
        'Unlogin-Token': bootstrap.unloginToken,
        Referer: 'https://account.meitu.com/',
      },
    });
    this.assertApiSuccess(result.data);
    const qrCode = String(
      ((result.data.response as RawJson | undefined)?.qr_code as string) ?? '',
    );
    if (!qrCode) {
      throw new BadGatewayException('QR_CODE_MISSING');
    }

    await this.logAction(actorId, 'EXTERNAL_QR_CREATE', {
      deviceId: bootstrap.deviceId,
      qrCodeLength: qrCode.length,
    });
    return {
      unloginToken: bootstrap.unloginToken,
      deviceId: bootstrap.deviceId,
      qrCode,
      raw: result.data,
    };
  }

  async qrStatus(dto: QrStatusDto) {
    const url = new URL('https://api.account.meitu.com/qr/get_status');
    url.searchParams.set('client_id', String(this.appClientId));
    url.searchParams.set('client_language', 'zh-CN');
    url.searchParams.set('os_type', 'web');
    url.searchParams.set('sid', '');
    url.searchParams.set('zip_version', this.zipVersion);
    url.searchParams.set('web_version', this.webVersion);
    url.searchParams.set('is_web', '1');
    url.searchParams.set('mt_g', dto.deviceId);
    url.searchParams.set('qr_code', dto.qrCode);
    const result = await this.requestJson(url.toString(), {
      headers: {
        'Unlogin-Token': dto.unloginToken,
        Referer: 'https://account.meitu.com/',
      },
    });
    this.assertApiSuccess(result.data);
    return result.data;
  }

  async qrLogin(dto: QrLoginDto, actorId?: string) {
    const url = 'https://account.meitu.com/oauth/access_token.json';
    const form = {
      client_id: String(this.appClientId),
      client_language: 'zh-CN',
      os_type: 'web',
      zip_version: this.zipVersion,
      web_version: this.webVersion,
      is_web: '1',
      app_package: '',
      source_from: '',
      grant_type: 'qr_code',
      qr_code: dto.qrCode,
      mt_g: dto.deviceId,
    };
    const result = await this.requestJson(url, {
      method: 'POST',
      form,
      headers: {
        'Unlogin-Token': dto.unloginToken,
        Referer: url,
      },
    });
    this.assertApiSuccess(result.data);
    const accessToken =
      this.findFirstStringValue(result.data, ['access_token', 'accesstoken']) ??
      '';
    const refreshToken =
      this.findFirstStringValue(result.data, ['refresh_token', 'refreshtoken']) ??
      '';
    const uidRaw =
      this.findFirstNumberValue(result.data, ['uid']) ??
      this.findFirstStringValue(result.data, ['uid']) ??
      null;

    await this.logAction(actorId, 'EXTERNAL_QR_LOGIN', {
      uid: uidRaw,
      hasToken: Boolean(accessToken),
    });

    return {
      accessToken,
      refreshToken,
      uid: uidRaw,
      raw: result.data,
    };
  }

  async crediblePhone(
    dto: { accessToken: string; cookie?: string },
    actorId?: string,
  ): Promise<CrediblePhoneResult | null> {
    const accessToken = String(dto.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }
    const result = await this.requestJson(
      'https://api.account.meitu.com/users_safety/credible_phone.json',
      {
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          ...(dto.cookie?.trim() ? { Cookie: dto.cookie.trim() } : {}),
        },
      },
    );
    this.assertApiSuccess(result.data);

    const responseData = result.data.response as RawJson | undefined;
    const data = Array.isArray(responseData?.data)
      ? (responseData?.data as RawJson[])
      : [];
    const first =
      data.find(
        (item) =>
          this.findFirstStringValue(item, ['phone_type']) === 'bind_phone',
      ) ?? data[0];

    const phone =
      this.findFirstStringValue(first, ['phone']) ??
      this.findFirstStringValue(responseData, ['phone']) ??
      '';
    const phoneCc =
      this.findFirstStringValue(first, ['phone_cc']) ??
      this.findFirstStringValue(responseData, ['phone_cc']) ??
      '';
    const phoneType =
      this.findFirstStringValue(first, ['phone_type']) ?? 'bind_phone';

    await this.logAction(actorId, 'EXTERNAL_CREDIBLE_PHONE', {
      hasPhone: Boolean(phone),
      phoneCc,
      phoneType,
    });

    if (!phone) {
      return null;
    }
    return {
      phone,
      phoneCc,
      phoneType,
    };
  }

  async vipOverview(dto: VipOverviewDto, actorId?: string) {
    const commonHeaders = {
      'Access-Token': dto.accessToken,
      ...(dto.cookie ? { Cookie: dto.cookie } : {}),
    };

    const userVip = await this.requestJson(
      `https://h5.xiuxiu.meitu.com/v1/h5/vip/new_sub_detail.json?client_id=${this.appClientId}&version=9670`,
      {
        method: 'GET',
        headers: commonHeaders,
      },
    );
    this.assertApiSuccess(userVip.data);

    const winkVip = await this.requestJson(
      'https://api-h5-sub.meitu.com/h5/user/vip_info_by_group.json?app_id=6829803307010000000&vip_group=wink_group',
      {
        method: 'GET',
        headers: {
          ...commonHeaders,
          app_id: '6829803307010000000',
          platform: '4',
        },
      },
    );
    this.assertApiSuccess(winkVip.data);

    await this.logAction(actorId, 'EXTERNAL_VIP_OVERVIEW', {
      hasCookie: Boolean(dto.cookie),
    });

    return {
      userVip: userVip.data,
      winkVip: winkVip.data,
    };
  }

  async createRechargeFlow(input: RechargeFlowInput) {
    const accessToken = input.accessToken.trim();
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }

    const isMobileChannel = input.channel === 'Android';
    const commonHeaders = {
      'Access-Token': accessToken,
      ...(input.cookie?.trim() ? { Cookie: input.cookie.trim() } : {}),
    };

    const vipData = await this.vipOverview(
      { accessToken, cookie: input.cookie },
      input.actorId,
    );

    const h5TransactionUrl =
      process.env.EXTERNAL_RECHARGE_H5_TRANSACTION_URL?.trim() ||
      'https://api-h5-sub.meitu.com/h5/transaction/v2/create.json';
    const orderCreateUrl =
      process.env.EXTERNAL_RECHARGE_ORDER_CREATE_URL?.trim() ||
      'https://api.xiuxiu.meitu.com/v1/vip/subscription/order/create.json';
    const cashierAgreementUrl =
      process.env.EXTERNAL_RECHARGE_CASHIER_URL?.trim() ||
      'https://api.wallet.meitu.com/payment/cashier/agreement.json';

    let transactionResponse: RawJson | null = null;
    if (!isMobileChannel) {
      const transactionPayload = this.toStringRecord({
        channel: input.channel,
        ...(input.transactionPayload ?? {}),
      });
      const tx = await this.requestJson(h5TransactionUrl, {
        method: 'POST',
        headers: commonHeaders,
        form: transactionPayload,
      });
      this.assertApiSuccess(tx.data);
      transactionResponse = tx.data;
    }

    const orderPayload = this.toStringRecord({
      channel: input.channel,
      ...(input.orderPayload ?? {}),
    });
    const order = await this.requestJson(orderCreateUrl, {
      method: 'POST',
      headers: commonHeaders,
      form: orderPayload,
    });
    this.assertApiSuccess(order.data);

    const priceValue = this.findFirstNumberValue(order.data, [
      'price',
      'amount',
      'pay_amount',
      'total_fee',
    ]);
    if (typeof priceValue === 'number' && priceValue > 1.1) {
      throw new BadRequestException('RECHARGE_PRICE_NOT_ALLOWED');
    }

    const orderNo =
      this.findFirstStringValue(order.data, [
        'order_no',
        'orderid',
        'order_id',
        'trade_no',
      ]) ?? '';

    const cashierPayload = this.toStringRecord({
      channel: input.channel,
      ...(orderNo ? { order_no: orderNo } : {}),
      ...(input.cashierPayload ?? {}),
    });
    const cashier = await this.requestJson(cashierAgreementUrl, {
      method: 'POST',
      headers: commonHeaders,
      form: cashierPayload,
    });
    this.assertApiSuccess(cashier.data);

    const paymentUrl =
      this.findFirstStringValue(cashier.data, [
        'qr',
        'qrcode',
        'pay_url',
        'cashier_url',
        'payment_url',
      ]) ??
      this.findFirstStringValue(order.data, [
        'qr',
        'qrcode',
        'pay_url',
        'cashier_url',
        'payment_url',
      ]);

    if (!paymentUrl) {
      throw new BadGatewayException('RECHARGE_PAYMENT_URL_NOT_FOUND');
    }

    const qrPayload = paymentUrl.startsWith('data:image/')
      ? paymentUrl
      : await QRCode.toDataURL(paymentUrl);

    await this.logAction(input.actorId, 'EXTERNAL_RECHARGE_FLOW', {
      channel: input.channel,
      hasTransaction: Boolean(transactionResponse),
      hasOrderNo: Boolean(orderNo),
      priceValue: priceValue ?? null,
    });

    return {
      channel: input.channel,
      paymentUrl,
      qrPayload,
      orderNo,
      priceValue: priceValue ?? null,
      vip: vipData,
      transaction: transactionResponse,
      order: order.data,
      cashier: cashier.data,
    };
  }

  async checkRechargeChannelCapability(input: {
    channel: RechargeChannel;
    accessToken: string;
    cookie?: string;
    actorId?: string;
  }): Promise<ChannelCapabilityCheck> {
    const accessToken = input.accessToken.trim();
    if (!accessToken) {
      return {
        channel: input.channel,
        canRecharge: false,
        priceValue: null,
        reason: 'EXTERNAL_ACCESS_TOKEN_REQUIRED',
      };
    }

    const isMobileChannel = input.channel === 'Android';
    const commonHeaders = {
      'Access-Token': accessToken,
      ...(input.cookie?.trim() ? { Cookie: input.cookie.trim() } : {}),
    };

    const h5TransactionUrl =
      process.env.EXTERNAL_RECHARGE_H5_TRANSACTION_URL?.trim() ||
      'https://api-h5-sub.meitu.com/h5/transaction/v2/create.json';
    const orderCreateUrl =
      process.env.EXTERNAL_RECHARGE_ORDER_CREATE_URL?.trim() ||
      'https://api.xiuxiu.meitu.com/v1/vip/subscription/order/create.json';

    try {
      await this.vipOverview(
        { accessToken, cookie: input.cookie },
        input.actorId,
      );

      if (!isMobileChannel) {
        const tx = await this.requestJson(h5TransactionUrl, {
          method: 'POST',
          headers: commonHeaders,
          form: this.toStringRecord({ channel: input.channel }),
        });
        this.assertApiSuccess(tx.data);
      }

      const order = await this.requestJson(orderCreateUrl, {
        method: 'POST',
        headers: commonHeaders,
        form: this.toStringRecord({ channel: input.channel }),
      });
      this.assertApiSuccess(order.data);

      const priceValue = this.findFirstNumberValue(order.data, [
        'price',
        'amount',
        'pay_amount',
        'total_fee',
      ]);

      if (!Number.isFinite(priceValue)) {
        return {
          channel: input.channel,
          canRecharge: false,
          priceValue: null,
          reason: 'RECHARGE_PRICE_NOT_FOUND',
        };
      }

      const canRecharge = Number(priceValue) <= 1.1;
      await this.logAction(input.actorId, 'EXTERNAL_CHANNEL_CAPABILITY_CHECK', {
        channel: input.channel,
        canRecharge,
        priceValue: Number(priceValue),
      });

      return {
        channel: input.channel,
        canRecharge,
        priceValue: Number(priceValue),
        reason: canRecharge ? 'OK' : 'RECHARGE_PRICE_NOT_ALLOWED',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'CHECK_FAILED';
      await this.logAction(input.actorId, 'EXTERNAL_CHANNEL_CAPABILITY_CHECK', {
        channel: input.channel,
        canRecharge: false,
        reason,
      });
      return {
        channel: input.channel,
        canRecharge: false,
        priceValue: null,
        reason,
      };
    }
  }
}
