import { IsString, Matches } from 'class-validator';

export class SendSmsCodeBodyDto {
  @IsString()
  @Matches(/^tk_[a-zA-Z0-9_-]{8,}$/)
  token!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;
}
