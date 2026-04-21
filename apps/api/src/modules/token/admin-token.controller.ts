import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTokenDto } from './dto/create-token.dto';
import { TokenService } from './token.service';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import type { CurrentAdminUser } from '../../common/auth/current-admin.decorator';

@Controller('admin/tokens')
export class AdminTokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post()
  create(
    @Body() dto: CreateTokenDto,
    @CurrentAdmin() admin?: CurrentAdminUser,
  ) {
    return this.tokenService.createToken(dto, admin?.id);
  }

  @Get()
  list() {
    return this.tokenService.listTokens();
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.tokenService.revokeToken(id);
  }

  @Post(':id/unban')
  unban(@Param('id') id: string) {
    return this.tokenService.unbanToken(id);
  }
}
