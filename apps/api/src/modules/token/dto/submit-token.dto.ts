import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SubmitTokenDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone: string;

  @IsString()
  @IsNotEmpty()
  smsCode: string;
}

