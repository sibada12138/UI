import { PrismaService } from '../prisma/prisma.service';
import { RiskControlService } from '../risk-control/risk-control.service';
import { TokenService } from './token.service';

async function clearDb(prisma: PrismaService) {
  await prisma.auditLog.deleteMany();
  await prisma.queryLog.deleteMany();
  await prisma.rechargeTask.deleteMany();
  await prisma.userSubmission.deleteMany();
  await prisma.issueToken.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.admin.deleteMany();
}

describe('TokenService', () => {
  const prisma = new PrismaService();
  const riskControl = new RiskControlService();
  const externalMock = {
    smsLogin: jest.fn(async () => ({
      accessToken: 'mock_access_token',
      uid: 'mock_uid',
    })),
  } as any;
  const captchaOcrMock = {
    recognizeCaptcha: jest.fn(async () => 'ABCD'),
  } as any;
  const service = new TokenService(
    prisma,
    riskControl,
    externalMock,
    captchaOcrMock,
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDb(prisma);
  });

  afterAll(async () => {
    await clearDb(prisma);
    await prisma.$disconnect();
  });

  it('consumes token once after successful submit', async () => {
    const created = await service.createToken({ expiresInMinutes: 30 });
    const token = created.token;
    const smsSessionId = 'sms_test_session';
    (service as any).smsSessionMap.set(smsSessionId, {
      token,
      phone: '13800138000',
      unloginToken: 'mock_unlogin',
      phoneCc: '86',
      deviceId: 'mock_device',
      expiresAt: Date.now() + 60_000,
    });

    const first = await service.submitToken(token, {
      phone: '13800138000',
      smsCode: '123456',
      smsSessionId,
    });
    expect(first.success).toBe(true);
    expect(first.status).toBe('consumed');

    await expect(
      service.submitToken(token, {
        phone: '13800138000',
        smsCode: '123456',
        smsSessionId,
      }),
    ).rejects.toThrow('TOKEN_INVALID');
  });

  it('bans ip after 5 consecutive invalid token submissions and supports manual unban', async () => {
    const ip = '10.20.30.40';

    for (let i = 0; i < 4; i += 1) {
      await expect(
        service.submitToken(
          'tk_invalid_not_exists',
          { phone: '13800138000', smsCode: '123456' },
          ip,
          'jest',
        ),
      ).rejects.toThrow('TOKEN_NOT_FOUND');
    }

    await expect(
      service.submitToken(
        'tk_invalid_not_exists',
        { phone: '13800138000', smsCode: '123456' },
        ip,
        'jest',
      ),
    ).rejects.toThrow('TOKEN_SUBMIT_BANNED_1H');

    riskControl.clearBan('token_submit', ip);

    await expect(
      service.submitToken(
        'tk_invalid_not_exists',
        { phone: '13800138000', smsCode: '123456' },
        ip,
        'jest',
      ),
    ).rejects.toThrow('TOKEN_NOT_FOUND');
  });

  it('can unban a revoked token before it expires', async () => {
    const created = await service.createToken({ expiresInMinutes: 30 });

    const revoked = await service.revokeToken(created.id);
    expect(revoked.status).toBe('revoked');

    const unbanned = await service.unbanToken(created.id);
    expect(unbanned.status).toBe('active');
  });

  it('uses 60 minutes as default token ttl', async () => {
    const before = Date.now();
    const created = await service.createToken({});
    const ttlMs = new Date(created.expiresAt).getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });
});
