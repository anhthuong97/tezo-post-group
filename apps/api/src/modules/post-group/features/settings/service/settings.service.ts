import { Injectable } from '@nestjs/common';
import { ApiKeyRepository } from '../repository/api-key.repository';
import { ApiKeys } from '../entity/api-keys.entity';

export { ApiKeys };

function maskKey(key: string | null): { hasKey: boolean; masked: string } {
  if (!key) return { hasKey: false, masked: '' };
  const masked = key.length > 8 ? key.slice(0, 4) + '***' + key.slice(-4) : '***';
  return { hasKey: true, masked };
}

@Injectable()
export class SettingsService {
  constructor(private readonly repo: ApiKeyRepository) {}

  // Raw keys — dùng nội bộ (AI service, v.v.)
  async getRawKeys(userId: number): Promise<ApiKeys> {
    const row = await this.repo.getByEmployeeId(userId);
    return {
      gemini:   row?.gemini_key  || null,
      openai:   row?.openai_key  || null,
      priority: (row?.ai_priority || 'gemini') as 'gemini' | 'openai',
    };
  }

  // Masked keys — chỉ dùng cho hiển thị cài đặt
  async getMaskedKeys(userId: number) {
    const raw = await this.getRawKeys(userId);
    return {
      gemini:   maskKey(raw.gemini),
      openai:   maskKey(raw.openai),
      priority: raw.priority,
    };
  }

  async updateApiKeys(userId: number, gemini?: string, openai?: string): Promise<void> {
    // Chỉ update key khi có giá trị thực — không bao giờ xóa qua endpoint này
    if (gemini?.trim()) await this.repo.upsertKey(userId, 'gemini', gemini.trim());
    if (openai?.trim()) await this.repo.upsertKey(userId, 'openai', openai.trim());
  }

  async updatePriority(userId: number, priority: 'gemini' | 'openai'): Promise<void> {
    await this.repo.updatePriority(userId, priority);
  }
}
