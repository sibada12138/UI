import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';
import { ExternalIntegrationService } from './external-integration.service';
import { SmsBootstrapDto } from './dto/sms-bootstrap.dto';
import { SmsSendCodeDto } from './dto/sms-send-code.dto';
import { SmsLoginDto } from './dto/sms-login.dto';
import { QrCreateDto } from './dto/qr-create.dto';
import { QrStatusDto } from './dto/qr-status.dto';
import { QrLoginDto } from './dto/qr-login.dto';
import { VipOverviewDto } from './dto/vip-overview.dto';

@Controller('admin/external')
export class ExternalIntegrationController {
  constructor(
    private readonly externalIntegrationService: ExternalIntegrationService,
  ) {}

  @Post('sms/bootstrap')
  smsBootstrap(
    @Body() dto: SmsBootstrapDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.externalIntegrationService.smsBootstrap(dto, admin?.id);
  }

  @Post('sms/send-code')
  smsSendCode(
    @Body() dto: SmsSendCodeDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.externalIntegrationService.smsSendCode(dto, admin?.id);
  }

  @Post('sms/login')
  smsLogin(@Body() dto: SmsLoginDto, @CurrentAdmin() admin?: CurrentAdminUser) {
    return this.externalIntegrationService.smsLogin(dto, admin?.id);
  }

  @Post('qr/create')
  qrCreate(@Body() dto: QrCreateDto, @CurrentAdmin() admin?: CurrentAdminUser) {
    return this.externalIntegrationService.qrCreate(dto, admin?.id);
  }

  @Get('qr/status')
  qrStatus(
    @Query('qrCode') qrCode: string,
    @Query('unloginToken') unloginToken: string,
    @Query('deviceId') deviceId?: string,
  ) {
    const input: QrStatusDto = {
      qrCode,
      unloginToken,
      deviceId: deviceId?.trim() || 'web-default-device',
    };
    return this.externalIntegrationService.qrStatus(input);
  }

  @Post('qr/login')
  qrLogin(@Body() dto: QrLoginDto, @CurrentAdmin() admin?: CurrentAdminUser) {
    return this.externalIntegrationService.qrLogin(dto, admin?.id);
  }

  @Post('vip/overview')
  vipOverview(
    @Body() dto: VipOverviewDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.externalIntegrationService.vipOverview(dto, admin?.id);
  }
}
