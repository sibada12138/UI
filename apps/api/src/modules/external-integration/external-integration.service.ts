import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { ProxyAgent } from 'undici';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { getOutboundProxyConfig } from '../../common/http/proxy-config';
import { normalizePhone } from '../../common/security/crypto.util';
import { CaptchaOcrService } from '../token/captcha-ocr.service';
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

type RechargeChannelRuntimeConfig = {
  createMode: 'h5_transaction' | 'android_order';
  appId: string;
  payChannel: 'alipay' | 'lenovo';
  h5Payload?: Record<string, string>;
  androidPayload?: Record<string, string>;
};

type RechargeChannelConfigMap = Record<
  RechargeChannel,
  RechargeChannelRuntimeConfig
>;

const APP_SIG_SIGN_KEY = 'Tw5AY783H@EU3#XC';
const APP_SIG_VERSION = '1.3';
const APP_SIG_DEFAULT_APP_ID = '6184556633574670337';

const CHANNEL_DEFAULTS: RechargeChannelConfigMap = {
  联想: {
    createMode: 'h5_transaction',
    appId: '6829803307010000000',
    payChannel: 'lenovo',
    h5Payload: {
      productId: '7404045067775924234',
      promotionId: '7404045237741709410',
      tradeSessionId: '7452615311004039822',
    },
  },
  网页: {
    createMode: 'h5_transaction',
    appId: '6829803307010000000',
    payChannel: 'alipay',
    h5Payload: {
      productId: '7128304588855461619',
      promotionId: '7128304882968448028',
      tradeSessionId: '7452615311528057245',
    },
  },
  Android: {
    createMode: 'android_order',
    appId: APP_SIG_DEFAULT_APP_ID,
    payChannel: 'alipay',
    androidPayload: {
      id: '6917711922213447365',
      purchase_type: '1',
      product_type: '1',
      promotional_type: '11',
      renew_sign_mode: '1',
      ext: '{"entrance":"new_pageEntrance","touch_type":"5","location":"9","hb_source":"99","user_type":"0","page_id":"vip_page","MT_PAY_CHANNEL":"alipay","vipSource":"1001","functionId":""}',
      sku_num: '',
      client_brand: 'OnePlus',
      client_channel_id: 'taobao',
      client_id: '1089867602',
      country_code: 'CN',
      sigEnv: '0',
      user_agent: 'mtxx-111700-OnePlus-KB2000-android-11-706a1555',
      version: '11.17.0',
    },
  },
};

export type RechargeFlowInput = {
  channel: RechargeChannel;
  accessToken: string;
  cookie?: string;
  maxPrice?: number;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly captchaOcrService: CaptchaOcrService,
  ) {}

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

  private extractCookieHeader(response: Response) {
    const getSetCookie = (response.headers as Headers & {
      getSetCookie?: () => string[];
    }).getSetCookie?.();
    const cookieSource =
      Array.isArray(getSetCookie) && getSetCookie.length > 0
        ? getSetCookie
        : [response.headers.get('set-cookie') ?? ''];

    const cookies = cookieSource
      .flatMap((value) => String(value ?? '').split(/,(?=[^;]+?=)/g))
      .map((item) => item.split(';')[0]?.trim() ?? '')
      .filter(Boolean);

    return Array.from(new Set(cookies)).join('; ');
  }

  private async fetchSmsCaptchaByUnloginToken(
    unloginToken: string,
  ): Promise<{ captchaMimeType: string; captchaBase64: string }> {
    const token = String(unloginToken ?? '').trim();
    if (!token) {
      throw new BadRequestException('UNLOGIN_TOKEN_MISSING');
    }
    const captchaUrl = new URL('https://api.account.meitu.com/captcha/show.json');
    captchaUrl.searchParams.set('t', String(Date.now()));
    captchaUrl.searchParams.set('unlogin_token', token);
    captchaUrl.searchParams.set('client_id', String(this.appClientId));
    captchaUrl.searchParams.set('zip_version', this.zipVersion);
    const captcha = await this.requestBinary(captchaUrl.toString(), {
      'Unlogin-Token': token,
      Referer: 'https://account.meitu.com/',
    });
    return {
      captchaMimeType: captcha.contentType,
      captchaBase64: captcha.base64,
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

  private encodeSmsCaptcha(
    captcha: string,
    unloginToken: string,
    zipVersion: string,
  ) {
    const raw = String(captcha ?? '').trim().toLowerCase();
    const token = String(unloginToken ?? '').trim();
    if (!raw || !token) {
      return '';
    }
    const first = createHash('md5')
      .update(`${raw}${token}${zipVersion}`, 'utf8')
      .digest('hex');
    return createHash('md5').update(first, 'utf8').digest('hex');
  }

  private buildGnum() {
    return randomBytes(18).toString('hex').slice(0, 36);
  }

  private getAppSigSecKey(appId: string) {
    if (appId === '6184556633574670337') return 'qsF=+BcElEWFulmW';
    if (appId === '6184556654793654273') return 'iyC8GObqVIT3U!X_';
    if (appId === '6184556739355017217') return 'sqA#QH=M+Ns&q+Z&';
    if (appId === '6184557056498925569') return 'xX2mBC_L+N#EJyK2';
    return '';
  }

  private buildAppSig(
    form: Record<string, string>,
    path: string,
    appId = APP_SIG_DEFAULT_APP_ID,
    timestamp = String(Date.now()),
  ) {
    const secKey = this.getAppSigSecKey(appId);
    if (!secKey) {
      throw new BadRequestException('EXTERNAL_APP_SIG_APPID_INVALID');
    }
    const filteredValues = Object.entries(form)
      .filter(([key]) => !['sig', 'sigTime', 'sigVersion'].includes(key))
      .map(([, value]) => String(value))
      .sort((a, b) => a.localeCompare(b));
    const signString = `${path}${filteredValues.join('')}${secKey}${timestamp}${APP_SIG_SIGN_KEY}`;
    const md5 = createHash('md5').update(signString, 'utf8').digest('hex');
    const chars = md5.split('');
    for (let i = 0; i < chars.length - 1; i += 2) {
      const current = chars[i];
      chars[i] = chars[i + 1];
      chars[i + 1] = current;
    }
    return {
      sig: chars.join(''),
      sigTime: timestamp,
      sigVersion: APP_SIG_VERSION,
    };
  }

  private decodeUrlComponentSafe(value: string) {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return value;
    }
  }

  private parsePriceFromText(source: string) {
    const text = String(source ?? '');
    if (!text) {
      return null;
    }

    const decodedOnce = this.decodeUrlComponentSafe(text);
    const decodedTwice = this.decodeUrlComponentSafe(decodedOnce);
    const candidateText = [text, decodedOnce, decodedTwice].join('\n');
    const patterns = [
      /(?:^|[&?])amount=([0-9]+(?:\.[0-9]+)?)/i,
      /total_amount["':= ]+([0-9]+(?:\.[0-9]+)?)/i,
      /single_amount["':= ]+([0-9]+(?:\.[0-9]+)?)/i,
      /price["':= ]+([0-9]+(?:\.[0-9]+)?)/i,
    ];

    for (const regex of patterns) {
      const matched = candidateText.match(regex);
      if (!matched?.[1]) {
        continue;
      }
      const parsed = Number(matched[1]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        continue;
      }
      const normalized = parsed > 20 ? parsed / 100 : parsed;
      return Number(normalized.toFixed(2));
    }
    return null;
  }

  private extractFirstUrl(text: string) {
    const matched = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/i);
    return matched?.[0] ?? '';
  }

  private getRechargeChannelConfigFilePath() {
    const configured = process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE?.trim();
    if (configured) {
      return path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured);
    }
    return path.resolve(process.cwd(), './data/recharge-channel-config.json');
  }

  private async ensureRechargeChannelConfigFile() {
    const filePath = this.getRechargeChannelConfigFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(
        filePath,
        `${JSON.stringify(CHANNEL_DEFAULTS, null, 2)}\n`,
        'utf8',
      );
    }
    return filePath;
  }

  private toPayloadRecord(source: unknown) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(source).flatMap(([key, value]) => {
        if (value == null) {
          return [];
        }
        if (['string', 'number', 'boolean'].includes(typeof value)) {
          return [[key, String(value)]];
        }
        return [];
      }),
    );
  }

  private sanitizeRechargeChannelConfig(
    channel: RechargeChannel,
    source: unknown,
  ): RechargeChannelRuntimeConfig {
    const defaults = CHANNEL_DEFAULTS[channel];
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return {
        ...defaults,
        h5Payload: defaults.h5Payload ? { ...defaults.h5Payload } : undefined,
        androidPayload: defaults.androidPayload
          ? { ...defaults.androidPayload }
          : undefined,
      };
    }

    const raw = source as RawJson;
    const createMode =
      raw.createMode === 'android_order' || raw.createMode === 'h5_transaction'
        ? raw.createMode
        : defaults.createMode;
    const appId =
      typeof raw.appId === 'string' && raw.appId.trim()
        ? raw.appId.trim()
        : defaults.appId;
    const payChannel =
      raw.payChannel === 'alipay' || raw.payChannel === 'lenovo'
        ? raw.payChannel
        : defaults.payChannel;
    const h5Payload = {
      ...(defaults.h5Payload ?? {}),
      ...(this.toPayloadRecord(raw.h5Payload) ?? {}),
    };
    const androidPayload = {
      ...(defaults.androidPayload ?? {}),
      ...(this.toPayloadRecord(raw.androidPayload) ?? {}),
    };

    return {
      createMode,
      appId,
      payChannel,
      h5Payload: Object.keys(h5Payload).length > 0 ? h5Payload : undefined,
      androidPayload:
        Object.keys(androidPayload).length > 0 ? androidPayload : undefined,
    };
  }

  private async loadRechargeChannelConfigMap(): Promise<RechargeChannelConfigMap> {
    const filePath = await this.ensureRechargeChannelConfigFile();
    let parsed: unknown = {};

    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as RawJson;
    } catch {
      parsed = {};
    }

    const source =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as RawJson)
        : {};

    return {
      联想: this.sanitizeRechargeChannelConfig('联想', source['联想']),
      网页: this.sanitizeRechargeChannelConfig('网页', source['网页']),
      Android: this.sanitizeRechargeChannelConfig('Android', source['Android']),
    };
  }

  private async getRechargeChannelConfig(channel: RechargeChannel) {
    const configMap = await this.loadRechargeChannelConfigMap();
    return configMap[channel];
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
    const token = String(dto.unloginToken ?? '').trim();
    const manualCaptcha = String(dto.captcha ?? '').trim();
    const captchaTextCandidates: string[] = [];

    if (manualCaptcha) {
      captchaTextCandidates.push(manualCaptcha);
    }

    if (captchaTextCandidates.length === 0) {
      let solved = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const captcha = await this.fetchSmsCaptchaByUnloginToken(token);
          solved = await this.captchaOcrService.recognizeCaptcha(
            captcha.captchaBase64,
          );
          if (solved) {
            captchaTextCandidates.push(solved);
            break;
          }
        } catch (error) {
          if (attempt >= 2) {
            throw error;
          }
        }
      }
    }

    const captchaCandidateList = Array.from(
      new Set(
        captchaTextCandidates.flatMap((captchaText) => {
          const primaryEncoded = this.encodeSmsCaptcha(
            captchaText,
            token,
            this.zipVersion,
          );
          const fallbackEncoded =
            this.zipVersion === '2.9.5.1'
              ? ''
              : this.encodeSmsCaptcha(captchaText, token, '2.9.5.1');
          return [primaryEncoded, fallbackEncoded].filter(Boolean);
        }),
      ),
    );
    if (captchaCandidateList.length === 0) {
      throw new BadRequestException('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }

    const url = 'https://api.account.meitu.com/common/login_verify_code';
    let result: { response: Response; data: RawJson } | null = null;
    let lastError: unknown = null;

    for (const encodedCaptcha of captchaCandidateList) {
      const form = {
        client_id: String(this.suggestClientId + 1),
        client_language: 'zh-CN',
        os_type: 'web',
        gnum: this.buildGnum(),
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
      try {
        result = await this.requestJson(url, {
          method: 'POST',
          form,
          headers: {
            'Unlogin-Token': token,
            Referer: url,
          },
        });
        this.assertApiSuccess(result.data);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!result) {
      throw (lastError as Error) ?? new BadRequestException('EXTERNAL_API_FAILED');
    }

    await this.logAction(actorId, 'EXTERNAL_SMS_SEND_CODE', {
      phoneMasked: `${String(dto.phone).slice(0, 3)}****${String(dto.phone).slice(-4)}`,
      phoneCc: dto.phoneCc,
      deviceId,
      unloginTokenPrefix: token.slice(0, 8),
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
    const cookie = this.extractCookieHeader(result.response);
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
      cookie,
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
    const cookie = this.extractCookieHeader(result.response);
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
      cookie,
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

  private assertWalletSuccess(data: RawJson) {
    const code = Number((data as RawJson).code ?? NaN);
    if (Number.isFinite(code) && ![0, 100000].includes(code)) {
      throw new BadRequestException(
        this.toSafeMessage((data as RawJson).msg ?? (data as RawJson).message),
      );
    }
  }

  private async createH5Transaction(
    input: RechargeFlowInput,
    accessToken: string,
  ) {
    const config = await this.getRechargeChannelConfig(input.channel);
    const h5TransactionUrl =
      process.env.EXTERNAL_RECHARGE_H5_TRANSACTION_URL?.trim() ||
      'https://api-h5-sub.meitu.com/h5/transaction/v2/create.json';
    const payload = this.toStringRecord({
      ...(config.h5Payload ?? {}),
      returnUrl: 'https://web-payment.meitu.com/payment/success',
      ...(input.transactionPayload ?? {}),
    });

    const tx = await this.requestJson(h5TransactionUrl, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        ...(input.cookie?.trim() ? { Cookie: input.cookie.trim() } : {}),
        App_id: payload.appId || config.appId,
        Language: 'zh-Hans',
        Platform: '4',
        Sdk_version: '1.0.0',
        System_type: '1',
        Origin: 'https://web-payment.meitu.com',
        Referer: 'https://web-payment.meitu.com/',
      },
      form: payload,
    });
    this.assertApiSuccess(tx.data);

    const financialContent =
      this.findFirstStringValue(tx.data, ['financial_content']) ?? '';
    const transactionId =
      this.findFirstStringValue(tx.data, ['transaction_id']) ?? '';
    const priceValue = this.parsePriceFromText(financialContent);
    return {
      payload,
      financialContent,
      transactionId,
      priceValue,
      raw: tx.data,
    };
  }

  private async createAndroidOrder(
    input: RechargeFlowInput,
    accessToken: string,
  ) {
    const config = await this.getRechargeChannelConfig('Android');
    const orderCreateUrl =
      process.env.EXTERNAL_RECHARGE_ORDER_CREATE_URL?.trim() ||
      'https://api.xiuxiu.meitu.com/v1/vip/subscription/order/create.json';
    const path = orderCreateUrl
      .replace(/^https:\/\/api\.xiuxiu\.meitu\.com\/v1\//, '')
      .replace(/^https:\/\/api-sub\.meitu\.com\/v2\//, '');
    const payload = this.toStringRecord({
      ...(config.androidPayload ?? {}),
      ...(input.orderPayload ?? {}),
    });
    const sig = this.buildAppSig(
      payload,
      path,
      config.appId || APP_SIG_DEFAULT_APP_ID,
      String(Date.now()),
    );
    const form = this.toStringRecord({
      ...payload,
      sig: sig.sig,
      sigTime: sig.sigTime,
      sigVersion: sig.sigVersion,
    });

    const order = await this.requestJson(orderCreateUrl, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        ...(input.cookie?.trim() ? { Cookie: input.cookie.trim() } : {}),
        Connection: 'Keep-Alive',
        HAVE_PRE_HEADER: 'HAVE_PRE_HEADER',
        HAVE_PRE_REFRESH_TOKEN: 'HAVE_PRE_REFRESH_TOKEN',
        HAVE_PRE_SIGN: 'HAVE_PRE_SIGN',
        Host: 'api.xiuxiu.meitu.com',
        'User-Agent':
          process.env.EXTERNAL_ANDROID_UA ??
          'mtxx-111700-OnePlus-KB2000-android-11-706a1555',
      },
      form,
    });
    this.assertApiSuccess(order.data);
    const retCode = Number((order.data as RawJson).ret ?? 0);
    if (Number.isFinite(retCode) && retCode !== 0) {
      throw new BadRequestException(
        this.toSafeMessage((order.data as RawJson).msg ?? 'EXTERNAL_API_FAILED'),
      );
    }

    const content = this.findFirstStringValue(order.data, ['content']) ?? '';
    const orderId =
      this.findFirstStringValue(order.data, ['order_id', 'orderid']) ?? '';
    const priceValue = this.parsePriceFromText(content);
    return {
      payload: form,
      content,
      orderId,
      priceValue,
      raw: order.data,
    };
  }

  private async createCashierAgreement(
    input: RechargeFlowInput,
    content: string,
  ) {
    const config = await this.getRechargeChannelConfig(input.channel);
    const cashierAgreementUrl =
      process.env.EXTERNAL_RECHARGE_CASHIER_URL?.trim() ||
      'https://api.wallet.meitu.com/payment/cashier/agreement.json';
    const form = this.toStringRecord({
      content,
      trade_type: input.channel === 'Android' ? 'APP' : 'WAP',
      pay_channel:
        String(input.cashierPayload?.pay_channel ?? '').trim() ||
        config.payChannel,
      language: 'zh-Hans',
      ...(input.cashierPayload ?? {}),
    });

    const cashier = await this.requestJson(cashierAgreementUrl, {
      method: 'POST',
      headers:
        input.channel === 'Android'
          ? {
              Connection: 'Keep-Alive',
              Host: 'api.wallet.meitu.com',
              'User-Agent':
                process.env.EXTERNAL_ANDROID_UA ??
                'mtxx-111700-OnePlus-KB2000-android-11-706a1555',
            }
          : {
              Origin: 'https://web-payment.meitu.com',
              Referer: 'https://web-payment.meitu.com/',
              Host: 'api.wallet.meitu.com',
            },
      form,
    });
    this.assertWalletSuccess(cashier.data);

    const keyHints =
      input.channel === '联想'
        ? ['lenovo_content', 'alipay_content', 'content']
        : ['alipay_content', 'lenovo_content', 'content'];
    const paymentContent =
      this.findFirstStringValue(cashier.data, keyHints) ??
      this.findFirstStringValue(cashier.data, [
        'payment_url',
        'pay_url',
        'cashier_url',
      ]) ??
      '';
    if (!paymentContent) {
      throw new BadGatewayException('RECHARGE_PAYMENT_URL_NOT_FOUND');
    }
    const paymentUrl = this.extractFirstUrl(paymentContent) || paymentContent;
    return {
      paymentContent,
      paymentUrl,
      raw: cashier.data,
    };
  }

  async createRechargeFlow(input: RechargeFlowInput) {
    const accessToken = input.accessToken.trim();
    if (!accessToken) {
      throw new BadRequestException('EXTERNAL_ACCESS_TOKEN_REQUIRED');
    }
    const maxPrice =
      typeof input.maxPrice === 'number' && Number.isFinite(input.maxPrice)
        ? input.maxPrice
        : 1.1;

    const vipData = await this.vipOverview(
      { accessToken, cookie: input.cookie },
      input.actorId,
    );

    const isAndroid = input.channel === 'Android';
    const created = isAndroid
      ? await this.createAndroidOrder(input, accessToken)
      : await this.createH5Transaction(input, accessToken);
    const priceValue = created.priceValue;
    if (priceValue == null) {
      throw new BadRequestException('RECHARGE_PRICE_NOT_FOUND');
    }
    if (priceValue > maxPrice) {
      throw new BadRequestException('RECHARGE_PRICE_NOT_ALLOWED');
    }

    const contentForAgreement =
      input.channel === 'Android'
        ? (created as { content: string }).content
        : (created as { financialContent: string }).financialContent;
    const agreement = await this.createCashierAgreement(
      input,
      contentForAgreement,
    );
    const qrPayload = agreement.paymentUrl.startsWith('data:image/')
      ? agreement.paymentUrl
      : await QRCode.toDataURL(agreement.paymentUrl);
    const orderNo = isAndroid
      ? String((created as { orderId: string }).orderId || '')
      : String((created as { transactionId: string }).transactionId || '');

    await this.logAction(input.actorId, 'EXTERNAL_RECHARGE_FLOW', {
      channel: input.channel,
      mode: isAndroid ? 'android_order' : 'h5_transaction',
      hasOrderNo: Boolean(orderNo),
      priceValue: priceValue ?? null,
      maxPrice,
    });

    return {
      channel: input.channel,
      paymentUrl: agreement.paymentUrl,
      paymentContent: agreement.paymentContent,
      qrPayload,
      orderNo,
      priceValue,
      vip: vipData,
      transaction: isAndroid ? null : (created as { raw: RawJson }).raw,
      order: isAndroid ? (created as { raw: RawJson }).raw : null,
      cashier: agreement.raw,
    };
  }

  async checkRechargeChannelCapability(input: {
    channel: RechargeChannel;
    accessToken: string;
    cookie?: string;
    maxPrice?: number;
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
    const maxPrice =
      typeof input.maxPrice === 'number' && Number.isFinite(input.maxPrice)
        ? input.maxPrice
        : 1.1;
    const isAndroid = input.channel === 'Android';

    try {
      await this.vipOverview(
        { accessToken, cookie: input.cookie },
        input.actorId,
      );
      const created = isAndroid
        ? await this.createAndroidOrder(
            {
              channel: input.channel,
              accessToken,
              cookie: input.cookie,
              actorId: input.actorId,
            },
            accessToken,
          )
        : await this.createH5Transaction(
            {
              channel: input.channel,
              accessToken,
              cookie: input.cookie,
              actorId: input.actorId,
            },
            accessToken,
          );
      if (created.priceValue == null) {
        return {
          channel: input.channel,
          canRecharge: false,
          priceValue: null,
          reason: 'RECHARGE_PRICE_NOT_FOUND',
        };
      }

      const canRecharge = Number(created.priceValue) <= maxPrice;
      await this.logAction(input.actorId, 'EXTERNAL_CHANNEL_CAPABILITY_CHECK', {
        channel: input.channel,
        mode: isAndroid ? 'android_order' : 'h5_transaction',
        canRecharge,
        priceValue: Number(created.priceValue),
        maxPrice,
      });

      return {
        channel: input.channel,
        canRecharge,
        priceValue: Number(created.priceValue),
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
