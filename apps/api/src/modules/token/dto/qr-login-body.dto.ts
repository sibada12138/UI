import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class QrLoginBodyDto {
  @IsString()
  @Matches(/^tk_[a-zA-Z0-9_-]{8,}$/)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  qrSessionId!: string;
}
