'use client';
import { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, Power } from 'lucide-react';
import { authApi } from '../api/auth.api';
import { Button } from '@/shared/components/Button';

interface Employee {
  id: number;
  username: string;
  is_active: boolean;
  last_login_at: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UserManageModal({ open, onClose }: Props) {
  const [users, setUsers]       = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(false);
  const [newUser, setNewUser]   = useState('');
  const [error, setError]       = useState('');
  const [working, setWorking]   = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authApi.listUsers().catch(() => null);
    setLoading(false);
    if (res) setUsers(res as Employee[]);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleCreate = async () => {
    if (!newUser.trim()) return;
    setError('');
    const res = await authApi.createUser(newUser.trim()).catch(() => null);
    if (!res?.success) { setError(res?.error || 'Lỗi tạo tài khoản.'); return; }
    setNewUser('');
    load();
  };

  const handleToggle = async (user: Employee) => {
    setWorking(user.id);
    await authApi.toggleUser(user.id, !user.is_active).catch(() => {});
    setWorking(null);
    load();
  };

  const handleReset = async (user: Employee) => {
    if (!confirm(`Reset mật khẩu "${user.username}" về Admin@123?`)) return;
    setWorking(user.id);
    await authApi.resetPassword(user.id).catch(() => {});
    setWorking(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Quản lý tài khoản</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tạo user mới */}
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Username mới..."
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button variant="primary" onClick={handleCreate} className="text-xs px-3 h-9">
              <UserPlus className="w-4 h-4 mr-1" /> Tạo
            </Button>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <p className="text-xs text-gray-400">Mật khẩu mặc định: <span className="font-mono">Admin@123</span></p>

          {/* Danh sách */}
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-4">Đang tải...</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-gray-50">
                  <div>
                    <p className={`text-sm font-medium ${u.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {u.username}
                    </p>
                    <p className="text-xs text-gray-400">
                      {u.last_login_at ? `Lần cuối: ${new Date(u.last_login_at).toLocaleDateString('vi-VN')}` : 'Chưa đăng nhập'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleReset(u)}
                      disabled={working === u.id}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Reset mật khẩu"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggle(u)}
                      disabled={working === u.id}
                      className={`p-1.5 rounded transition-colors ${u.is_active ? 'text-green-500 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-500'}`}
                      title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
