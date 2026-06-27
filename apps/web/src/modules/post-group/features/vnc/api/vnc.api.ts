import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export const vncApi = {
  status:       () => api.get(ENDPOINTS.vnc.status),
  loginStart:   () => api.post(ENDPOINTS.vnc.loginStart),
  loginStop:    () => api.post(ENDPOINTS.vnc.loginStop),
  monitorStart: () => api.post(ENDPOINTS.vnc.monitorStart),
  monitorStop:  () => api.post(ENDPOINTS.vnc.monitorStop),
  monitorTouch: () => api.post(ENDPOINTS.vnc.monitorTouch),
};
