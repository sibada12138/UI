import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsIn(['admin', 'operator_admin'])
  role: 'admin' | 'operator_admin';
}

