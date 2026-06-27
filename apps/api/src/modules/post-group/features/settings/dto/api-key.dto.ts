import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateApiKeyDto {
  @IsOptional() @IsString() gemini?: string;
  @IsOptional() @IsString() openai?: string;
}

export class UpdatePriorityDto {
  @IsIn(['gemini', 'openai'])
  priority: 'gemini' | 'openai';
}
