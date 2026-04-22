import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BanIpDto {
  @IsIn(['query', 'token_submit'])
  scope!: 'query' | 'token_submit';

  @IsString()
  ip!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number;
}
