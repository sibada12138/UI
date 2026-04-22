import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

type PayloadValue = string | number | boolean;

export class GenerateRechargeLinkDto {
  @IsOptional()
  @IsBoolean()
  useExternalApi?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['联想', '网页', 'Android'])
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cookie?: string;

  @IsOptional()
  @IsObject()
  transactionPayload?: Record<string, PayloadValue>;

  @IsOptional()
  @IsObject()
  orderPayload?: Record<string, PayloadValue>;

  @IsOptional()
  @IsObject()
  cashierPayload?: Record<string, PayloadValue>;
}
