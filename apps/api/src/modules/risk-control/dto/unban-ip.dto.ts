import { IsIn, IsString, Length } from 'class-validator';

export class UnbanIpDto {
  @IsString()
  @IsIn(['query', 'token_submit'])
  scope!: 'query' | 'token_submit';

  @IsString()
  @Length(1, 64)
  ip!: string;
}
