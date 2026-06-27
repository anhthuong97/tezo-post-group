'use client';

type ErrorHandler = (msg: string) => void;
let globalErrorHandler: ErrorHandler | null = null;

export function registerErrorHandler(fn: ErrorHandler) {
  globalErrorHandler = fn;
}

function friendlyError(raw: string): string {
  if (!raw) return 'Đã xảy ra lỗi không xác định.';
  if (/ECONNREFUSED|socket hang up|ENOTFOUND|network/i.test(raw))
    return 'Mất kết nối với máy chủ.';
  if (/timeout|timed out/i.test(raw))
    return 'Yêu cầu mất quá nhiều thời gian, vui lòng thử lại.';
  if (/api key|apikey|unauthorized|invalid_api_key/i.test(raw))
    return 'API Key chưa cấu hình hoặc không hợp lệ.';
  if (/session|đăng nhập/i.test(raw))
    return 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.';
  // Truncate dài
  return raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'include',
      ...options,
    });
  } catch {
    const msg = 'Mất kết nối với máy chủ.';
    globalErrorHandler?.(msg);
    throw new Error(msg);
  }

  if (res.status === 401) {
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/post-group/login';
    }
    throw new Error('Chưa đăng nhập');
  }

  if (!res.ok && res.status >= 500) {
    const body = await res.json().catch(() => ({}));
    const raw  = body?.message || body?.error || `Lỗi máy chủ (${res.status})`;
    const msg  = friendlyError(raw);
    globalErrorHandler?.(msg);
    throw new Error(msg);
  }

  return res.json();
}

export const api = {
  get:    <T = any>(path: string, opts?: RequestInit) => apiFetch<T>(path, { method: 'GET', ...opts }),
  post:   <T = any>(path: string, body?: any, opts?: RequestInit) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),
  put:    <T = any>(path: string, body?: any, opts?: RequestInit) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  delete: <T = any>(path: string, opts?: RequestInit) => apiFetch<T>(path, { method: 'DELETE', ...opts }),
};
