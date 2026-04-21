import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class QrCreateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  unloginToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
