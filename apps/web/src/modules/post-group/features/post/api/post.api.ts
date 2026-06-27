import { api, apiFetch } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const postApi = {
  start: (data: { groups: any[]; content: string; images?: string[]; comment?: string }) =>
    api.post(ENDPOINTS.post.start, data),
  status:    () => api.get(ENDPOINTS.post.status),
  log:       () => api.get(ENDPOINTS.post.log),
  cancel:    (url: string) => api.post(ENDPOINTS.post.cancel, { url }),
  cancelAll: () => api.post(ENDPOINTS.post.cancelAll),
  upload: async (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return apiFetch(ENDPOINTS.post.upload, { method: 'POST', body: fd, headers: {} });
  },
};
