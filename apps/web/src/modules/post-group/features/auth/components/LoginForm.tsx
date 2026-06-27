'use client';
import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { useLoginForm } from '../hooks/useLoginForm';
import { authApi } from '../api/auth.api';

export function LoginForm() {
  const { username, setUsername, password, setPassword, loading, error, submit } = useLoginForm();
  const [mode, setMode]           = useState<'login' | 'register'>('login');
  const [regUser, setRegUser]     = useState('');
  const [regPass, setRegPass]     = useState('');
  const [regPass2, setRegPass2]   = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError]   = useState('');
  const [regDone, setRegDone]     = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regPass !== regPass2) { setRegError('Mật khẩu không khớp.'); return; }
    if (regPass.length < 6) { setRegError('Mật khẩu tối thiểu 6 ký tự.'); return; }
    setRegLoading(true);
    const res = await authApi.register(regUser.trim(), regPass).catch(() => null);
    setRegLoading(false);
    if (!res?.success) { setRegError(res?.error || 'Lỗi đăng ký.'); return; }
    setRegDone(true);
  };

  if (mode === 'register') {
    return (
      <div className="flex flex-col gap-4">
        {regDone ? (
          <div className="text-center space-y-3">
            <p className="text-green-600 font-medium">Đăng ký thành công!</p>
            <Button variant="primary" className="w-full" onClick={() => { setMode('login'); setRegDone(false); }}>
              Đăng nhập ngay
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div>
              <label className="label">Tên đăng nhập</label>
              <input value={regUser} onChange={(e) => setRegUser(e.target.value)}
                className="input" placeholder="username" required />
            </div>
            <div>
              <label className="label">Mật khẩu</label>
              <input type="password" value={regPass} onChange={(e) => setRegPass(e.target.value)}
                className="input" placeholder="••••••••" required />
            </div>
            <div>
              <label className="label">Nhập lại mật khẩu</label>
              <input type="password" value={regPass2} onChange={(e) => setRegPass2(e.target.value)}
                className="input" placeholder="••••••••" required />
            </div>
            {regError && <p className="text-red-500 text-sm text-center">{regError}</p>}
            <Button type="submit" variant="primary" loading={regLoading} className="w-full mt-1">
              Đăng ký
            </Button>
          </form>
        )}
        {!regDone && (
          <p className="text-center text-sm text-gray-500">
            Đã có tài khoản?{' '}
            <button onClick={() => setMode('login')} className="text-blue-600 hover:underline font-medium">
              Đăng nhập
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label">Tên đăng nhập</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            className="input" placeholder="admin"
            autoComplete="username" required />
        </div>
        <div>
          <label className="label">Mật khẩu</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="input" placeholder="••••••••"
            autoComplete="current-password" required />
        </div>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <Button type="submit" variant="primary" loading={loading} className="w-full mt-1">
          Đăng nhập
        </Button>
      </form>
      <p className="text-center text-sm text-gray-500">
        Chưa có tài khoản?{' '}
        <button onClick={() => setMode('register')} className="text-blue-600 hover:underline font-medium">
          Đăng ký
        </button>
      </p>
    </div>
  );
}
