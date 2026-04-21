import { Body, Controller, Get, Post } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/admin-users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  list() {
    return this.adminUserService.list();
  }

  @Roles('admin')
  @Post()
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.adminUserService.create(dto, admin!.id);
  }
}
