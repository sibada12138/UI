import { IsString, Length } from 'class-validator';
import { SubmitTokenDto } from './submit-token.dto';

export class SubmitTokenBodyDto extends SubmitTokenDto {
  @IsString()
  @Length(1, 128)
  token!: string;
}
