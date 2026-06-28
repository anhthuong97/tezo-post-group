import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const groupsApi = {
  list: (identityId = 'personal') => api.get(`${ENDPOINTS.groups.list}?identityId=${identityId}`),
  sync: (identityId = 'personal') => api.post(ENDPOINTS.groups.sync, { identityId }),
};
