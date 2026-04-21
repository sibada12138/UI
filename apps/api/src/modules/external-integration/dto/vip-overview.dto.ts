import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VipOverviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  accessToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  cookie?: string;
}
