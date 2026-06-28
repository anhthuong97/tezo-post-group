import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const groupsApi = {
  list: () => api.get(ENDPOINTS.groups.list),
  sync: () => api.post(ENDPOINTS.groups.sync, {}),
};
