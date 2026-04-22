import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SendSmsCodeDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  captcha!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  smsSessionId!: string;
}
