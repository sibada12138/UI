import { IsString, Matches } from 'class-validator';

export class SendSmsCodeDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;
}
