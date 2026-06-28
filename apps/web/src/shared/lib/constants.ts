export const API_BASE = '/api/post-group';

export const ENDPOINTS = {
  auth:     { login: `${API_BASE}/auth/login`, logout: `${API_BASE}/auth/logout`, me: `${API_BASE}/auth/me`, register: `${API_BASE}/auth/register`, users: `${API_BASE}/auth/users` },
  facebook: { session: `${API_BASE}/facebook/session`, checkLogin: `${API_BASE}/facebook/check-login`, open: `${API_BASE}/facebook/open`, confirm: `${API_BASE}/facebook/confirm`, logout: `${API_BASE}/facebook/logout` },
  groups:   { list: `${API_BASE}/groups`, open: `${API_BASE}/groups/open` },
  identity: { list: `${API_BASE}/identity`, switch: `${API_BASE}/identity/switch` },
  post:     { start: `${API_BASE}/post`, status: `${API_BASE}/post/status`, log: `${API_BASE}/post/log`, cancel: `${API_BASE}/post/cancel`, cancelAll: `${API_BASE}/post/cancel-all`, upload: `${API_BASE}/post/upload` },
  ai:       { suggest: `${API_BASE}/ai/suggest` },
  product:  { fetch: `${API_BASE}/product/fetch` },
  settings: { apiKeys: `${API_BASE}/settings/api-keys`, priority: `${API_BASE}/settings/ai-priority` },
  log:      { get: `${API_BASE}/log`, clear: `${API_BASE}/log` },
} as const;
