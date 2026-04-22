import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SmsBootstrapDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  autoOcr?: boolean;
}
