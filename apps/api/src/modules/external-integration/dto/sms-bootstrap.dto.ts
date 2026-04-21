import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SmsBootstrapDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
