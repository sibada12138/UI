import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CheckRechargeCapabilityDto {
  @IsString()
  @MaxLength(2048)
  accessToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cookie?: string;

  @IsOptional()
  @IsBoolean()
  checkAll?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['联想', '网页', 'Android'])
  channel?: string;
}
