import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SmsSendCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  unloginToken!: string;

  @IsString()
  @Matches(/^\d{4,20}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{1,4}$/)
  phoneCc!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  captcha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
