import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import {
  createRandomToken,
  hashPlainText,
} from '../../common/security/crypto.util';
import { AdminRole } from '@prisma/client';

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
    await this.ensureDefaultAdmin();
    const admin = await this.prisma.admin.findUnique({
      where: { username: dto.username },
    });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('ADMIN_NOT_FOUND');
    }

    const valid = await argon2.verify(admin.passwordHash, dto.password);
    if (!valid) {
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
    await this.prisma.adminSession.deleteMany({ where: { tokenHash } });
    return { success: true };
  }
}
