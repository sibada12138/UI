import { PrismaService } from '../prisma/prisma.service';
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
  const service = new TokenService(prisma);

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

    const first = await service.submitToken(token, {
      phone: '13800138000',
      smsCode: '123456',
    });
    expect(first.success).toBe(true);
    expect(first.status).toBe('consumed');

    await expect(
      service.submitToken(token, {
        phone: '13800138000',
        smsCode: '123456',
      }),
    ).rejects.toThrow('TOKEN_INVALID');
  });
});

