import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const settingsApi = {
  getKeys:        () => api.get(ENDPOINTS.settings.apiKeys),
  updateKeys:     (gemini?: string, openai?: string) =>
    api.put(ENDPOINTS.settings.apiKeys, { gemini, openai }),
  updatePriority: (priority: 'gemini' | 'openai') =>
    api.put(ENDPOINTS.settings.priority, { priority }),
};
