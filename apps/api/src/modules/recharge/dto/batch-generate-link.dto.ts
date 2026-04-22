import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class BatchGenerateLinkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  taskIds!: string[];

  @IsOptional()
  @IsString()
  @IsIn(['联想', '网页', 'Android'])
  preferredChannel?: string;
}
