import { IsString, Matches } from 'class-validator';

export class SmsBootstrapBodyDto {
  @IsString()
  @Matches(/^tk_[a-zA-Z0-9_-]{8,}$/)
  token!: string;
}
