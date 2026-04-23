import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { ExternalIntegrationService } from './external-integration.service';

describe('ExternalIntegrationService channel config', () => {
  const originalConfigPath = process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE;
  const prismaMock = {
    auditLog: {
      create: jest.fn(),
    },
  } as any;
  const captchaOcrMock = {
    recognizeCaptcha: jest.fn(),
  } as any;

  let service: ExternalIntegrationService;
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'recharge-channel-config-'));
    service = new ExternalIntegrationService(prismaMock, captchaOcrMock);
  });

  afterEach(async () => {
    if (originalConfigPath == null) {
      delete process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE;
    } else {
      process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE = originalConfigPath;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('reads channel runtime config from file when present', async () => {
    const configFile = path.join(tempDir, 'channel-config.json');
    process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE = configFile;
    await writeFile(
      configFile,
      JSON.stringify(
        {
          Android: {
            createMode: 'android_order',
            appId: 'custom-app',
            payChannel: 'alipay',
            androidPayload: {
              id: 'custom-id',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const config = await (service as any).getRechargeChannelConfig('Android');

    expect(config.appId).toBe('custom-app');
    expect(config.androidPayload.id).toBe('custom-id');
  });

  it('creates a default config file when missing', async () => {
    const configFile = path.join(tempDir, 'missing-config.json');
    process.env.EXTERNAL_RECHARGE_CHANNEL_CONFIG_FILE = configFile;

    const config = await (service as any).getRechargeChannelConfig('网页');
    const saved = JSON.parse(await readFile(configFile, 'utf8')) as Record<
      string,
      { createMode: string }
    >;

    expect(config.createMode).toBe('h5_transaction');
    expect(saved['网页'].createMode).toBe('h5_transaction');
    expect(saved['Android']).toBeDefined();
  });
});
