import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SmsLoginDto {
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

  @IsString()
  @Matches(/^\d{4,8}$/)
  verifyCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
