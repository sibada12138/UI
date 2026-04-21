import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

export class PublicQueryDto {
  @IsString()
  @IsIn(['token', 'phone'])
  queryType: 'token' | 'phone';

  @IsString()
  @IsNotEmpty()
  queryValue: string;

  @IsString()
  @IsNotEmpty()
  captchaId: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{4,6}$/)
  captchaCode: string;
}
