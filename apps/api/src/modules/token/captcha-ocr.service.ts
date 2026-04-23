import { Injectable } from '@nestjs/common';
import { CaptchaOnnxService } from '../../services/captchaOnnxService';

@Injectable()
export class CaptchaOcrService {
  private readonly captchaOnnxService = new CaptchaOnnxService();

  async recognizeCaptcha(base64OrDataUrl: string | Buffer): Promise<string> {
    const result = await this.captchaOnnxService.recognize(base64OrDataUrl);
    const code = String(result.text ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
    if (code.length < 4) {
      throw new Error('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }
    return code.slice(0, 4);
  }
}

