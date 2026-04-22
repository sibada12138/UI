import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class DeleteAccountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  submissionIds!: string[];
}
