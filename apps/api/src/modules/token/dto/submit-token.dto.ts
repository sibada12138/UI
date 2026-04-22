import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SubmitTokenDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  smsCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['sms', 'qr'])
  loginMode?: 'sms' | 'qr';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  smsSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  qrSessionId?: string;
}
