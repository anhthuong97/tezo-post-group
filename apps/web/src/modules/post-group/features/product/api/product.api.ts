import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const productApi = {
  fetch: (url: string) => api.post(ENDPOINTS.product.fetch, { url }),
};
