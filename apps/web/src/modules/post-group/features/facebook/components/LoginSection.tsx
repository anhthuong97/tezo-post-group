'use client';
import { Loader2, RefreshCw, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { groupsApi } from '../../groups/api/groups.api';
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
  const [syncing, setSyncing]         = useState(false);
  const [syncError, setSyncError]     = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const activeId = currentIdentity?.id || 'personal';

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
          {agentOnline
            ? <><Wifi className="w-3 h-3" />Đang kết nối</>
            : <><WifiOff className="w-3 h-3" />Chưa kết nối</>}
        </span>
      </div>

      {!agentOnline && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Hãy mở <strong>TeZo Agent</strong> trên máy tính và đăng nhập để bắt đầu.
        </p>
      )}

      {agentOnline && (
        <>
          {/* Identity selector */}
          {identities.length > 0 && (
            <div className="relative">
              <p className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide font-medium">Đăng bài với tư cách</p>
              <button
                onClick={() => setShowDropdown(v => !v)}
                disabled={switching}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
                           bg-white border border-gray-200 rounded-lg hover:border-blue-300
                           transition-colors text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    currentIdentity?.type === 'page'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {currentIdentity?.type === 'page' ? 'Page' : 'Cá nhân'}
                  </span>
                  <span className="truncate font-medium text-gray-800">
                    {currentIdentity?.name || 'Trang cá nhân'}
                  </span>
                </span>
                {switching
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
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
                        identity.type === 'page'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {identity.type === 'page' ? 'Page' : 'Cá nhân'}
                      </span>
                      <span className="truncate">{identity.name}</span>
                      {identity.id === activeId && (
                        <span className="ml-auto text-blue-500 text-xs shrink-0">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sync info + button */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {syncedAt
                ? `Đã sync: ${new Date(syncedAt).toLocaleString('vi-VN')}`
                : 'Chưa có danh sách nhóm'}
            </span>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {syncing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {syncing ? 'Đang tải...' : 'Tải nhóm'}
            </button>
          </div>
        </>
      )}

      {syncError && <p className="text-red-500 text-xs">{syncError}</p>}
    </div>
  );
}
