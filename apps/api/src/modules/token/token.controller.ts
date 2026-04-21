import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { TokenService } from './token.service';
import { SubmitTokenDto } from './dto/submit-token.dto';
import { SubmitTokenBodyDto } from './dto/submit-token-body.dto';
import { SendSmsCodeDto } from './dto/send-sms-code.dto';
import { SendSmsCodeBodyDto } from './dto/send-sms-code-body.dto';
import { Public } from '../../common/auth/public.decorator';

@Public()
@Controller('public/token')
export class PublicTokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get(':token/status')
  getStatus(@Param('token') token: string) {
    return this.tokenService.getTokenStatus(token);
  }

  @Post(':token/submit')
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitTokenDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.tokenService.submitToken(token, dto, ip, userAgent);
  }

  @Post(':token/send-sms')
  sendSmsByPath(
    @Param('token') token: string,
    @Body() dto: SendSmsCodeDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.tokenService.sendSmsCode(token, dto.phone, ip);
  }

  @Post('submit')
  submitByBody(
    @Body() dto: SubmitTokenBodyDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.tokenService.submitToken(
      dto.token,
      { phone: dto.phone, smsCode: dto.smsCode },
      ip,
      userAgent,
    );
  }

  @Post('send-sms')
  sendSmsByBody(
    @Body() dto: SendSmsCodeBodyDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.tokenService.sendSmsCode(dto.token, dto.phone, ip);
  }
}
