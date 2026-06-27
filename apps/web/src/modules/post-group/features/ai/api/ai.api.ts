import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const aiApi = {
  suggest: (content: string) => api.post(ENDPOINTS.ai.suggest, { content }),
};
