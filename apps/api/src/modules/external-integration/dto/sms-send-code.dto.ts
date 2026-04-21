import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SmsSendCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  unloginToken!: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{1,4}$/)
  phoneCc!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  captcha!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
