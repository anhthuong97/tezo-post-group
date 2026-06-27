import { Injectable } from '@nestjs/common';
import { getAiSuggestionsGemini, buildProductPostGemini } from '../providers/gemini.provider';
import { getAiSuggestionsOpenAI } from '../providers/openai.provider';
import { SettingsService } from '../../settings/service/settings.service';

@Injectable()
export class AiService {
  constructor(private readonly settings: SettingsService) {}

  async getSuggestions(userId: number, content: string): Promise<string[]> {
    const keys     = await this.settings.getRawKeys(userId);
    const priority = keys.priority || 'gemini';

    const geminiKey = (priority === 'openai' && keys.openai) ? null : keys.gemini;
    const openaiKey = keys.openai;

    // Thứ tự thử theo priority
    const order: Array<'gemini' | 'openai'> =
      priority === 'openai' ? ['openai', 'gemini'] : ['gemini', 'openai'];

    for (const provider of order) {
      try {
        if (provider === 'gemini' && geminiKey) {
          return await getAiSuggestionsGemini(content, { apiKey: geminiKey });
        }
        if (provider === 'openai' && openaiKey) {
          return await getAiSuggestionsOpenAI(content, { apiKey: openaiKey });
        }
      } catch (err: any) {
        console.error(`[AI] ${provider} error:`, err.message);
      }
    }

    throw new Error('Chưa cấu hình API Key AI hoặc tất cả provider đều thất bại.');
  }

  async buildProductPost(userId: number, productInfo: string): Promise<string> {
    const keys = await this.settings.getRawKeys(userId);
    if (!keys.gemini) throw new Error('Chưa cấu hình Gemini API Key.');
    return buildProductPostGemini(productInfo, { apiKey: keys.gemini });
  }
}
