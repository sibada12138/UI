import {
  Body,
  Controller,
  Headers,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Public } from '../../common/auth/public.decorator';
import type { Response } from 'express';

function maskToken(token: string) {
  const value = String(token ?? '').trim();
  if (!value) {
    return '(empty)';
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractCookieToken(cookieHeader?: string) {
    const raw = String(cookieHeader ?? '').trim();
    if (!raw) {
      return '';
    }
    const entries = raw.split(';');
    for (const entry of entries) {
      const [name, ...rest] = entry.trim().split('=');
      if (name !== 'admin_access_token') {
        continue;
      }
      const value = rest.join('=').trim();
      if (!value) {
        return '';
      }
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
    return '';
  }

  private setAuthCookies(response: Response, token: string, maxAgeSec: number) {
    const safeToken = encodeURIComponent(String(token ?? '').trim());
    response.setHeader('Set-Cookie', [
      `admin_access_token=${safeToken}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`,
      `admin_auth=1; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`,
    ]);
  }

  private clearAuthCookies(response: Response) {
    response.setHeader('Set-Cookie', [
      'admin_access_token=; Path=/; Max-Age=0; SameSite=Lax',
      'admin_auth=; Path=/; Max-Age=0; SameSite=Lax',
    ]);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: AdminLoginDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    console.log('[AUTH_DEBUG][auth.controller] login request', {
      username: dto.username,
      ip,
      hasUserAgent: Boolean(userAgent),
    });
    const result = await this.authService.login(dto, ip, userAgent);
    if (response) {
      this.setAuthCookies(response, result.accessToken, 12 * 60 * 60);
      console.log('[AUTH_DEBUG][auth.controller] set login cookies', {
        token: maskToken(result.accessToken),
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
      });
    }
    return result;
  }

  @Post('logout')
  logout(
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookieHeader?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const header = String(authorization ?? '');
    let token = '';
    if (header.toLowerCase().startsWith('bearer ')) {
      token = header.slice(7).trim();
    }
    if (!token) {
      token = this.extractCookieToken(cookieHeader);
    }
    console.log('[AUTH_DEBUG][auth.controller] logout request', {
      hasAuthorization: header.toLowerCase().startsWith('bearer '),
      hasCookieToken: Boolean(this.extractCookieToken(cookieHeader)),
      token: maskToken(token),
    });
    if (!token) {
      throw new UnauthorizedException('MISSING_ADMIN_TOKEN');
    }
    if (response) {
      this.clearAuthCookies(response);
    }
    return this.authService.logout(token);
  }
}
