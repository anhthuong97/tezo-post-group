export type AiPriority = 'gemini' | 'openai';

export interface ApiKeys {
  gemini:   string | null;
  openai:   string | null;
  priority: AiPriority;
}

export interface ApiKeysResponse { success: boolean; keys: ApiKeys; }
