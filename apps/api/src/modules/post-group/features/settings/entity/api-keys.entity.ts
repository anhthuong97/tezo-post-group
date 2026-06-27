export interface ApiKeys {
  gemini:   string | null;
  openai:   string | null;
  priority: 'gemini' | 'openai';
}
