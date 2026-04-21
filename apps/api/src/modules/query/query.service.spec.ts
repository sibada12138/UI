import { PrismaService } from '../prisma/prisma.service';
import { QueryService } from './query.service';
import { PublicQueryDto } from './dto/public-query.dto';

async function clearDb(prisma: PrismaService) {
  await prisma.auditLog.deleteMany();
  await prisma.queryLog.deleteMany();
  await prisma.rechargeTask.deleteMany();
  await prisma.userSubmission.deleteMany();
  await prisma.issueToken.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.admin.deleteMany();
}

function extractCode(svg: string) {
  const match = svg.match(/>([A-Z0-9]{4,6})<\/text>/);
  return match ? match[1] : '';
}

describe('QueryService', () => {
  const prisma = new PrismaService();
  const service = new QueryService(prisma);
  const ip = '10.10.10.10';

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

  it('bans ip for 1 hour after 5 consecutive failed queries', async () => {
    for (let i = 0; i < 4; i += 1) {
      const captcha = service.createCaptcha();
      const dto: PublicQueryDto = {
        queryType: 'token',
        queryValue: 'tk_not_exists',
        captchaId: captcha.captchaId,
        captchaCode: 'xxxx',
      };
      await expect(service.queryProgress(dto, ip)).rejects.toThrow(
        'CAPTCHA_INVALID',
      );
    }

    const fifth = service.createCaptcha();
    await expect(
      service.queryProgress(
        {
          queryType: 'token',
          queryValue: 'tk_not_exists',
          captchaId: fifth.captchaId,
          captchaCode: 'xxxx',
        },
        ip,
      ),
    ).rejects.toThrow('QUERY_BANNED_1H');

    const validCaptcha = service.createCaptcha();
    const validCode = extractCode(validCaptcha.captchaSvg);
    await expect(
      service.queryProgress(
        {
          queryType: 'token',
          queryValue: 'tk_not_exists',
          captchaId: validCaptcha.captchaId,
          captchaCode: validCode,
        },
        ip,
      ),
    ).rejects.toThrow('QUERY_BANNED_1H');
  });
});

