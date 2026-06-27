import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const facebookApi = {
  hasSession:     () => api.get(ENDPOINTS.facebook.session),
  checkLogin:     () => api.get(ENDPOINTS.facebook.checkLogin),
  openLogin:      () => api.post(ENDPOINTS.facebook.open),
  confirmLogin:   () => api.post(ENDPOINTS.facebook.confirm),
  logoutFacebook: () => api.post(ENDPOINTS.facebook.logout),
};

export const identityApi = {
  list:   () => api.get(ENDPOINTS.identity.list),
  switch: (name: string) => api.post(ENDPOINTS.identity.switch, { name }),
};
