import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';
import type { LoginRequest, MeResponse } from '../types/auth.types';

export const authApi = {
  login:  (data: LoginRequest) => api.post(ENDPOINTS.auth.login, data),
  logout: ()                   => api.post(ENDPOINTS.auth.logout),
  me:     ()                   => api.get<MeResponse>(ENDPOINTS.auth.me),

  listUsers:     ()                                  => api.get(ENDPOINTS.auth.users),
  createUser:    (username: string)                  => api.post(ENDPOINTS.auth.users, { username }),
  toggleUser:    (id: number, isActive: boolean)     => api.patch(`${ENDPOINTS.auth.users}/${id}/toggle`, { isActive }),
  resetPassword: (id: number)                        => api.patch(`${ENDPOINTS.auth.users}/${id}/reset-password`),
};
