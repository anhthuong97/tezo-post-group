'use client';
import { Loader2, RefreshCw, Wifi, WifiOff, ChevronDown, LogIn, LogOut, Monitor } from 'lucide-react';
import { groupsApi } from '../../groups/api/groups.api';
import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';
import { useState } from 'react';
import type { FbIdentity } from '../hooks/useFacebookLogin';

interface LoginSectionProps {
  agentOnline: boolean;
  syncedAt: string | null;
  identities: FbIdentity[];
  currentIdentity: FbIdentity | null;
  switching: boolean;
  onSyncGroups: (identityId: string) => void;
  onSwitchIdentity: (identityId: string) => void;
}

export function LoginSection({
  agentOnline, syncedAt,
  identities, currentIdentity, switching,
  onSyncGroups, onSwitchIdentity,
}: LoginSectionProps) {
  const [syncing, setSyncing]           = useState(false);
  const [syncError, setSyncError]       = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loggingIn, setLoggingIn]             = useState(false);
  const [loginMsg, setLoginMsg]               = useState('');
  const [actionMsg, setActionMsg]             = useState('');
  const [syncingIdentities, setSyncingIdents] = useState(false);

  const activeId   = currentIdentity?.id || 'personal';
  const isLoggedIn = identities.length > 0;

  const dispatch = async (type: string) => {
    const res: any = await api.post(ENDPOINTS.agent.dispatch, { type, payload: {} });
    return res;
  };

  const handleLoginFacebook = async () => {
    setLoggingIn(true);
    setLoginMsg('Đang gửi lệnh đến TeZo Agent...');
    try {
      const res = await dispatch('login_facebook');
      setLoginMsg(res.success
        ? 'Cửa sổ đăng nhập đã mở trên máy tính. Vui lòng đăng nhập Facebook trong đó.'
        : res.error || 'Agent chưa kết nối.');
      if (!res.success) setLoggingIn(false);
    } catch (e: any) {
      setLoginMsg(e.message || 'Lỗi kết nối');
      setLoggingIn(false);
    }
    setTimeout(() => { setLoggingIn(false); setLoginMsg(''); }, 12000);
  };

  const showAction = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 5000);
  };

  const handleShowBrowser = async () => {
    try {
      const res = await dispatch('show_browser');
      if (res?.success) showAction('Đang mở cửa sổ Facebook trên máy tính...');
      else showAction(res?.error || 'Agent chưa kết nối — hãy mở TeZo Agent trên máy tính.');
    } catch (e: any) {
      showAction(e.message || 'Lỗi kết nối');
    }
  };

  const handleLogout = async () => {
    if (!confirm('Đăng xuất Facebook? Cần đăng nhập lại để tiếp tục.')) return;
    try {
      const res = await dispatch('clear_session');
      showAction(res?.success ? 'Đã đăng xuất Facebook.' : (res?.error || 'Agent chưa kết nối.'));
    } catch (e: any) { showAction(e.message || 'Lỗi'); }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncError('');
    try {
      await groupsApi.sync(activeId);
      onSyncGroups(activeId);
    } catch (e: any) {
      setSyncError(e.message || 'Lỗi đồng bộ nhóm');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncIdentities = async () => {
    setSyncingIdents(true);
    try {
      const res = await dispatch('sync_identities');
      showAction(res?.success
        ? 'Đang tải lại tư cách... (mất ~10-20 giây)'
        : (res?.error || 'Agent chưa kết nối.'));
    } catch (e: any) {
      showAction(e.message || 'Lỗi');
    } finally {
      setSyncingIdents(false);
    }
  };

  const handleSelectIdentity = (id: string) => {
    setShowDropdown(false);
    onSwitchIdentity(id);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Agent status */}
      <div className="flex items-center justify-between">
        <p className="section-title mb-0">TeZo Agent</p>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          agentOnline ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'
        }`}>
          {agentOnline ? <><Wifi className="w-3 h-3" />Đang kết nối</> : <><WifiOff className="w-3 h-3" />Chưa kết nối</>}
        </span>
      </div>

      {!agentOnline && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Hãy mở <strong>TeZo Agent</strong> trên máy tính và kết nối VPS để bắt đầu.
        </p>
      )}

      {agentOnline && (
        <>
          {/* Login / Logout + Show Browser */}
          <div className="flex gap-1.5">
            {!isLoggedIn ? (
              <button
                onClick={handleLoginFacebook}
                disabled={loggingIn}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2
                           bg-[#1877f2] hover:bg-[#1561d4] text-white text-xs font-semibold
                           rounded-lg transition-colors disabled:opacity-60"
              >
                {loggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                {loggingIn ? 'Đang mở...' : 'Đăng nhập FB'}
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2
                           bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold
                           rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất FB
              </button>
            )}
            <button
              onClick={handleShowBrowser}
              className="flex items-center justify-center gap-1.5 py-2 px-3
                         bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold
                         rounded-lg transition-colors"
              title="Hiện cửa sổ browser"
            >
              <Monitor className="w-3.5 h-3.5" />
              Hiện Browser
            </button>
          </div>

          {loginMsg && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">{loginMsg}</p>
          )}
          {actionMsg && (
            <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{actionMsg}</p>
          )}

          {/* Identity selector */}
          {identities.length > 0 && (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Đăng bài với tư cách</p>
                <button
                  onClick={handleSyncIdentities}
                  disabled={syncingIdentities || switching}
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50 rounded transition-colors"
                  title="Tải lại danh sách tư cách từ Facebook"
                >
                  {syncingIdentities
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Khi đang chuyển tư cách: hiện spinner, khoá hoàn toàn — giống logic master cũ */}
              {switching ? (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-500
                                bg-blue-50 border border-blue-200 rounded-lg
                                pointer-events-none select-none">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Đang chuyển tư cách...
                </div>
              ) : syncingIdentities ? (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400
                                bg-gray-50 border border-gray-200 rounded-lg
                                pointer-events-none select-none">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Đang tải lại tư cách...
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowDropdown(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
                               bg-white border border-gray-200 rounded-lg hover:border-blue-300
                               transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        currentIdentity?.type === 'page' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {currentIdentity?.type === 'page' ? 'Page' : 'Cá nhân'}
                      </span>
                      <span className="truncate font-medium text-gray-800">
                        {currentIdentity?.name || 'Trang cá nhân'}
                      </span>
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>

                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200
                                    rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {identities.map(identity => (
                        <button
                          key={identity.id}
                          onClick={() => handleSelectIdentity(identity.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                                      hover:bg-blue-50 transition-colors
                                      ${identity.id === activeId ? 'bg-blue-50' : ''}`}
                        >
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                            identity.type === 'page' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {identity.type === 'page' ? 'Page' : 'Cá nhân'}
                          </span>
                          <span className="truncate">{identity.name}</span>
                          {identity.id === activeId && <span className="ml-auto text-blue-500 text-xs shrink-0">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sync */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {syncedAt ? `Đã sync: ${new Date(syncedAt).toLocaleString('vi-VN')}` : 'Chưa có danh sách nhóm'}
            </span>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {syncing ? 'Đang tải...' : 'Tải nhóm'}
            </button>
          </div>
        </>
      )}

      {syncError && <p className="text-red-500 text-xs">{syncError}</p>}
    </div>
  );
}
