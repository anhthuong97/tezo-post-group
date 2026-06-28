'use client';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { groupsApi } from '../../groups/api/groups.api';
import { useState } from 'react';

interface LoginSectionProps {
  agentOnline: boolean;
  syncedAt: string | null;
  onSyncGroups: () => void;
}

export function LoginSection({ agentOnline, syncedAt, onSyncGroups }: LoginSectionProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    setSyncing(true); setSyncError('');
    try {
      await groupsApi.sync();
      // Sau khi dispatch task, chờ agent fetch xong rồi web tự reload groups
      setTimeout(onSyncGroups, 3000);
    } catch (e: any) {
      setSyncError(e.message || 'Lỗi đồng bộ nhóm');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
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
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {syncedAt
              ? `Nhóm đã sync: ${new Date(syncedAt).toLocaleString('vi-VN')}`
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
      )}

      {syncError && <p className="text-red-500 text-xs">{syncError}</p>}
    </div>
  );
}
