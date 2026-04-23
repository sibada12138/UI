import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import {
  createRandomToken,
  hashPlainText,
} from '../../common/security/crypto.util';
import { AdminRole } from '@prisma/client';

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
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaultAdmin() {
    const username = process.env.ADMIN_INIT_USERNAME ?? 'admin';
    const initPassword = process.env.ADMIN_INIT_PASSWORD ?? 'Admin@123456';
    const exists = await this.prisma.admin.findUnique({ where: { username } });
    if (exists) {
      return;
    }

    await this.prisma.admin.create({
      data: {
        username,
        passwordHash: await argon2.hash(initPassword),
        role: AdminRole.admin,
      },
    });
  }

  async login(dto: AdminLoginDto, ip?: string, userAgent?: string) {
    console.log('[AUTH_DEBUG][auth.service] login start', {
      username: dto.username,
      ip: ip ?? '',
      hasUserAgent: Boolean(userAgent),
    });
    await this.ensureDefaultAdmin();
    const admin = await this.prisma.admin.findUnique({
      where: { username: dto.username },
    });
    if (!admin || admin.status !== 'active') {
      console.warn('[AUTH_DEBUG][auth.service] login reject', {
        username: dto.username,
        reason: 'ADMIN_NOT_FOUND',
      });
      throw new UnauthorizedException('ADMIN_NOT_FOUND');
    }

    const valid = await argon2.verify(admin.passwordHash, dto.password);
    if (!valid) {
      console.warn('[AUTH_DEBUG][auth.service] login reject', {
        username: dto.username,
        reason: 'PASSWORD_INVALID',
      });
      throw new UnauthorizedException('PASSWORD_INVALID');
    }

    const rawToken = createRandomToken('adm_');
    const tokenHash = hashPlainText(rawToken);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const session = await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash,
        ip: ip?.slice(0, 64),
        userAgent: userAgent?.slice(0, 255),
        expiresAt,
      },
    });

    console.log('[AUTH_DEBUG][auth.service] login success', {
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      token: maskToken(rawToken),
    });

    return {
      success: true,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
      accessToken: rawToken,
      expiresAt,
      sessionId: session.id,
    };
  }

  async logout(rawToken: string) {
    const tokenHash = hashPlainText(rawToken);
    console.log('[AUTH_DEBUG][auth.service] logout', {
      token: maskToken(rawToken),
    });
    await this.prisma.adminSession.deleteMany({ where: { tokenHash } });
    return { success: true };
  }
}
