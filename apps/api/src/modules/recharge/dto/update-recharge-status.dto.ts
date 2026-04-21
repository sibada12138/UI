import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateRechargeStatusDto {
  @IsString()
  @IsIn([
    'pending',
    'link_generated',
    'processing',
    'completed',
    'failed',
    'cancelled',
  ])
  status: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
