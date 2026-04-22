import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class YoloTestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  imageBase64!: string;
}
