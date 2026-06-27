import { IsArray, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreatePostDto {
  @IsArray()
  groups: Array<{ url: string; name: string }>;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  productLink?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  identity?: string;
}
