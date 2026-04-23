import { Body, Controller, Post } from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Public } from '../common/auth/public.decorator';
import { CaptchaOnnxService } from '../services/captchaOnnxService';

class CaptchaRecognizeBodyDto {
  @IsString()
  imageBase64!: string;

  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(2048)
  imgSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(0.99)
  conf?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(0.99)
  nms?: number;
}

@Public()
@Controller('captcha')
export class CaptchaController {
  private readonly captchaOnnxService = new CaptchaOnnxService();

  @Post('recognize')
  async recognize(@Body() body: CaptchaRecognizeBodyDto) {
    try {
      const result = await this.captchaOnnxService.recognize(body.imageBase64, {
        imgSize: body.imgSize,
        conf: body.conf,
        nms: body.nms,
      });
      return {
        success: true,
        data: {
          text: result.text,
          detections: result.detections,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'CAPTCHA_RECOGNIZE_FAILED';
      return {
        success: false,
        message,
      };
    }
  }
}

