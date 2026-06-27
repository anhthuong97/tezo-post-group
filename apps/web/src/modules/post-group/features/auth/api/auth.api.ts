import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';
import type { LoginRequest, MeResponse } from '../types/auth.types';

export const authApi = {
  login:  (data: LoginRequest) => api.post(ENDPOINTS.auth.login, data),
  logout: ()                   => api.post(ENDPOINTS.auth.logout),
  me:     ()                   => api.get<MeResponse>(ENDPOINTS.auth.me),
};
