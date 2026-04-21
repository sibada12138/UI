import { Body, Controller, Headers, Post } from '@nestjs/common';
import { QueryService } from './query.service';
import { PublicQueryDto } from './dto/public-query.dto';
import { Public } from '../../common/auth/public.decorator';

@Public()
@Controller('public')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('captcha/create')
  createCaptcha() {
    return this.queryService.createCaptcha();
  }

  @Post('query')
  queryProgress(
    @Body() dto: PublicQueryDto,
    @Headers('x-forwarded-for') xForwardedFor?: string,
  ) {
    const ip = xForwardedFor?.split(',')[0]?.trim() ?? '127.0.0.1';
    return this.queryService.queryProgress(dto, ip);
  }
}
