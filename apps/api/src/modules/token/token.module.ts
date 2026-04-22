import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { AdminTokenController } from './admin-token.controller';
import { PublicTokenController } from './token.controller';
import { ExternalIntegrationModule } from '../external-integration/external-integration.module';
import { CaptchaOcrService } from './captcha-ocr.service';
import { AdminOcrController } from './admin-ocr.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ExternalIntegrationModule, PrismaModule],
  providers: [TokenService, CaptchaOcrService],
  controllers: [AdminTokenController, PublicTokenController, AdminOcrController],
  exports: [TokenService],
})
export class TokenModule {}
