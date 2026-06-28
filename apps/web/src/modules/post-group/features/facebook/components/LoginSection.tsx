'use client';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import type { LoginMode } from '../types/facebook.types';

interface LoginSectionProps {
  mode: LoginMode;
  loading: boolean;
  identitySwitching: boolean;
  error: string;
  identityLoading: boolean;
  identityFailed: boolean;
  currentIdentity: string;
  switchable: string[];
  onOpen: () => void;
  onLogout: () => void;
  onSwitchIdentity: (name: string) => void;
  onReloadIdentity: () => void;
}

export function LoginSection({
  mode, loading, identitySwitching, error,
  identityLoading, identityFailed, currentIdentity, switchable,
  onOpen, onLogout, onSwitchIdentity, onReloadIdentity,
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

      {isLoggedIn && (
        <div>
          <label className="label">Đăng bài với tư cách</label>

          {identityLoading ? (
            <div className="input text-xs flex items-center gap-2 text-gray-400 bg-gray-50 pointer-events-none select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Đang xác định...
            </div>

          ) : identitySwitching ? (
            <div className="input text-xs flex items-center gap-2 text-blue-500 bg-blue-50 pointer-events-none select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Đang chuyển tư cách...
            </div>

          ) : identityFailed ? (
            <div className="input text-xs flex items-center justify-between bg-orange-50 border-orange-200 text-orange-600">
              <span>Không xác định được tư cách</span>
              <button type="button" onClick={onReloadIdentity}
                className="flex items-center gap-1 text-orange-500 hover:text-orange-700 transition-colors shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
                Thử lại
              </button>
            </div>

          ) : identityReady ? (
            <div className="flex gap-1.5">
              <select value={currentIdentity} onChange={(e) => onSwitchIdentity(e.target.value)}
                className="input text-xs flex-1">
                {allIdentities.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button type="button" onClick={onReloadIdentity}
                className="shrink-0 px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                title="Tải lại tư cách">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

          ) : (
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
