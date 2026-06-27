import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const groupsApi = {
  list: () => api.get(ENDPOINTS.groups.list),
  open: (url: string) => api.post(ENDPOINTS.groups.open, { url }),
};
