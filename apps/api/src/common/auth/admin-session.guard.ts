import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { hashPlainText } from '../security/crypto.util';

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

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = String(request.method ?? '');
    const path = String(request.originalUrl ?? request.url ?? '');
    if (!path.startsWith('/api/admin')) {
      return true;
    }

    const authHeader = String(request.headers?.authorization ?? '');
    let token = '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
    const tokenFromAuthHeader = token;
    if (!token) {
      token = String(request.headers?.['x-admin-token'] ?? '').trim();
    }
    const tokenFromCustomHeader = token;
    if (!token) {
      token = this.getCookieToken(String(request.headers?.cookie ?? ''));
    }
    const tokenSource = tokenFromAuthHeader
      ? 'authorization'
      : tokenFromCustomHeader
        ? 'x-admin-token'
        : token
          ? 'cookie'
          : 'none';

    console.log('[AUTH_DEBUG][guard] request', {
      method,
      path,
      hasAuthorization: Boolean(tokenFromAuthHeader),
      hasXAdminToken: Boolean(tokenFromCustomHeader && !tokenFromAuthHeader),
      hasCookieToken: tokenSource === 'cookie',
      tokenSource,
      token: maskToken(token),
    });

    if (!token) {
      console.warn('[AUTH_DEBUG][guard] reject', {
        method,
        path,
        reason: 'MISSING_ADMIN_TOKEN',
      });
      throw new UnauthorizedException('MISSING_ADMIN_TOKEN');
    }

    const tokenHash = hashPlainText(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      console.warn('[AUTH_DEBUG][guard] reject', {
        method,
        path,
        reason: 'SESSION_EXPIRED',
        token: maskToken(token),
      });
      throw new UnauthorizedException('SESSION_EXPIRED');
    }
    if (session.admin.status !== 'active') {
      console.warn('[AUTH_DEBUG][guard] reject', {
        method,
        path,
        reason: 'ADMIN_DISABLED',
        adminId: session.admin.id,
      });
      throw new UnauthorizedException('ADMIN_DISABLED');
    }

    console.log('[AUTH_DEBUG][guard] pass', {
      method,
      path,
      adminId: session.admin.id,
      role: session.admin.role,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });

    request.admin = {
      id: session.admin.id,
      username: session.admin.username,
      role: session.admin.role,
      sessionId: session.id,
    };
    request.adminToken = token;
    return true;
  }

  private getCookieToken(cookieHeader: string) {
    const raw = String(cookieHeader ?? '').trim();
    if (!raw) {
      return '';
    }
    const parts = raw.split(';');
    for (const part of parts) {
      const [name, ...rest] = part.trim().split('=');
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
}
