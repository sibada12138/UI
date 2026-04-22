import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalIntegrationController } from './external-integration.controller';
import { ExternalIntegrationService } from './external-integration.service';
import { CaptchaOcrService } from '../token/captcha-ocr.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExternalIntegrationController],
  providers: [ExternalIntegrationService, CaptchaOcrService],
  exports: [ExternalIntegrationService],
})
export class ExternalIntegrationModule {}
