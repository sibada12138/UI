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
    const path = String(request.originalUrl ?? request.url ?? '');
    if (!path.startsWith('/api/admin')) {
      return true;
    }

    const authHeader = String(request.headers?.authorization ?? '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('MISSING_ADMIN_TOKEN');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('INVALID_ADMIN_TOKEN');
    }

    const tokenHash = hashPlainText(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }
    if (session.admin.status !== 'active') {
      throw new UnauthorizedException('ADMIN_DISABLED');
    }

    request.admin = {
      id: session.admin.id,
      username: session.admin.username,
      role: session.admin.role,
      sessionId: session.id,
    };
    request.adminToken = token;
    return true;
  }
}

