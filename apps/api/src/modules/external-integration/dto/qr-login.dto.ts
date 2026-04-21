import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class QrLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  qrCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  unloginToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  deviceId!: string;
}
