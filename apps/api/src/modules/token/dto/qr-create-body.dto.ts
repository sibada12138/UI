import { IsString, Matches } from 'class-validator';

export class QrCreateBodyDto {
  @IsString()
  @Matches(/^tk_[a-zA-Z0-9_-]{8,}$/)
  token!: string;
}
