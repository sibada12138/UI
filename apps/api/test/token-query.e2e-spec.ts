import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Token + Query (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates captcha and rejects invalid query payload', async () => {
    const captcha = await request(app.getHttpServer())
      .post('/api/public/captcha/create')
      .expect(201);

    expect(captcha.body.captchaId).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/public/query')
      .send({
        queryType: 'token',
        queryValue: 'x',
        captchaId: captcha.body.captchaId,
        captchaCode: 'xx',
      })
      .expect(400);
  });
});
