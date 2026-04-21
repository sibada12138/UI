import { ConflictException, Injectable } from '@nestjs/common';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { AdminRole } from '@prisma/client';

@Injectable()
export class AdminUserService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const admins = await this.prisma.admin.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        createdBy: true,
      },
    });
    return {
      items: admins,
    };
  }

  async create(dto: CreateAdminUserDto, creatorId: string) {
    let created;
    try {
      created = await this.prisma.admin.create({
        data: {
          username: dto.username,
          passwordHash: await argon2.hash(dto.password),
          role:
            dto.role === 'admin' ? AdminRole.admin : AdminRole.operator_admin,
          createdBy: creatorId,
        },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
    } catch {
      throw new ConflictException('ADMIN_USERNAME_EXISTS');
    }
    await this.prisma.auditLog.create({
      data: {
        actorType: 'admin',
        actorId: creatorId,
        action: 'ADMIN_CREATE',
        targetType: 'admin',
        targetId: created.id,
      },
    });
    return {
      success: true,
      user: created,
    };
  }
}
