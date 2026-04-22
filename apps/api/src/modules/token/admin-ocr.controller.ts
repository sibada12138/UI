import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { CaptchaOcrService } from './captcha-ocr.service';
import { YoloTestDto } from './dto/yolo-test.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/ocr')
export class AdminOcrController {
  constructor(
    private readonly captchaOcrService: CaptchaOcrService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('yolo/test')
  async yoloTest(
    @Body() dto: YoloTestDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    const startedAt = Date.now();
    try {
      const code = await this.captchaOcrService.recognizeCaptcha(dto.imageBase64);
      const durationMs = Date.now() - startedAt;
      await this.prisma.auditLog.create({
        data: {
          actorType: 'admin',
          actorId: admin?.id ?? null,
          action: 'YOLO_OCR_TEST',
          targetType: 'ocr',
          targetId: 'yolo11',
          metadataJson: {
            success: true,
            durationMs,
            codeLength: code.length,
          },
        },
      });
      return {
        success: true,
        code,
        durationMs,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'CAPTCHA_AUTO_RECOGNIZE_FAILED';
      await this.prisma.auditLog.create({
        data: {
          actorType: 'admin',
          actorId: admin?.id ?? null,
          action: 'YOLO_OCR_TEST',
          targetType: 'ocr',
          targetId: 'yolo11',
          metadataJson: {
            success: false,
            durationMs: Date.now() - startedAt,
            error: message,
          },
        },
      });
      throw new BadRequestException('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }
  }
}
