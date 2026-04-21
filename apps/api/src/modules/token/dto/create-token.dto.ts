import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateTokenDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  expiresInMinutes?: number;
}

