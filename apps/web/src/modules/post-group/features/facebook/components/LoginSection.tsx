'use client';
import { Loader2, RefreshCw, Monitor, MonitorOff } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import type { LoginMode } from '../types/facebook.types';

interface LoginSectionProps {
  mode: LoginMode;
  loading: boolean;           // open login / logout
  identitySwitching: boolean; // đang chuyển tư cách
  error: string;
  identityLoading: boolean;
  identityFailed: boolean;
  currentIdentity: string;
  switchable: string[];
  // VNC
  vncLinux: boolean;
  vncPhase: 'login' | 'monitor' | 'idle' | null;
  vncError: string;
  onOpen: () => void;
  onLogout: () => void;
  onSwitchIdentity: (name: string) => void;
  onReloadIdentity: () => void;
  onStartMonitor: () => void;
  onStopMonitor: () => void;
}

export function LoginSection({
  mode, loading, identitySwitching, error,
  identityLoading, identityFailed, currentIdentity, switchable,
  vncLinux, vncPhase, vncError,
  onOpen, onLogout, onSwitchIdentity, onReloadIdentity,
  onStartMonitor, onStopMonitor,
}: LoginSectionProps) {
  const isLoggedIn = mode === 'logged-in';
  const isWaiting  = mode === 'waiting';

  const allIdentities = currentIdentity
    ? [currentIdentity, ...switchable.filter((s) => s !== currentIdentity)]
    : switchable;

  const identityReady = !identityLoading && !identityFailed && (!!currentIdentity || switchable.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="section-title mb-0">Facebook</p>
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Đã đăng nhập
            </span>
          )}
          {isLoggedIn ? (
            <Button variant="danger" loading={loading} onClick={onLogout} className="text-xs px-3 py-1 h-7">
              Đăng xuất FB
            </Button>
          ) : isWaiting ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-medium px-3 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang đăng nhập...
            </span>
          ) : (
            <Button variant="primary" loading={loading} onClick={onOpen} className="text-xs px-3 py-1 h-7">
              Đăng nhập Facebook
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
      {vncError && <p className="text-orange-500 text-xs">{vncError}</p>}

      {/* Nút theo dõi — chỉ hiện trên Linux sau khi đã login và có phiên Xvfb */}
      {isLoggedIn && vncLinux && (vncPhase === 'idle' || vncPhase === 'monitor') && (
        <div className="flex items-center gap-2">
          {vncPhase === 'monitor' ? (
            <button
              type="button"
              onClick={onStopMonitor}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
            >
              <MonitorOff className="w-3.5 h-3.5" />
              Đang theo dõi (nhấn để tắt)
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartMonitor}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded border border-gray-200 hover:border-blue-300 transition-colors"
            >
              <Monitor className="w-3.5 h-3.5" />
              Theo dõi trình duyệt
            </button>
          )}
        </div>
      )}

      {isLoggedIn && (
        <div>
          <label className="label">Đăng bài với tư cách</label>

          {identityLoading ? (
            /* Playwright đang xác định */
            <div className="input text-xs flex items-center gap-2 text-gray-400 bg-gray-50 pointer-events-none select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Đang xác định...
            </div>

          ) : identitySwitching ? (
            /* Playwright đang chuyển tư cách */
            <div className="input text-xs flex items-center gap-2 text-blue-500 bg-blue-50 pointer-events-none select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Đang chuyển tư cách...
            </div>

          ) : identityFailed ? (
            /* Xác định thất bại — cho retry */
            <div className="input text-xs flex items-center justify-between bg-orange-50 border-orange-200 text-orange-600">
              <span>Không xác định được tư cách</span>
              <button
                type="button"
                onClick={onReloadIdentity}
                className="flex items-center gap-1 text-orange-500 hover:text-orange-700 transition-colors shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Thử lại
              </button>
            </div>

          ) : identityReady ? (
            /* Đã xác định — select + nút Tải lại */
            <div className="flex gap-1.5">
              <select
                value={currentIdentity}
                onChange={(e) => onSwitchIdentity(e.target.value)}
                className="input text-xs flex-1"
              >
                {allIdentities.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onReloadIdentity}
                className="shrink-0 px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                title="Tải lại tư cách"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

          ) : (
            /* Chờ localStorage hydrate (thoáng qua) */
            <div className="input text-xs flex items-center gap-2 text-gray-400 bg-gray-50 pointer-events-none select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Đang xác định...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
