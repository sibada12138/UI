import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Public } from '../../common/auth/public.decorator';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body() dto: AdminLoginDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    const header = String(authorization ?? '');
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('MISSING_ADMIN_TOKEN');
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('INVALID_ADMIN_TOKEN');
    }
    return this.authService.logout(token);
  }
}
