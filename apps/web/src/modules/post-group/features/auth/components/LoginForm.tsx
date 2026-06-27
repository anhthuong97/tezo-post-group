'use client';
import { Button } from '@/shared/components/Button';
import { useLoginForm } from '../hooks/useLoginForm';

export function LoginForm() {
  const { username, setUsername, password, setPassword, loading, error, submit } = useLoginForm();

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="label">Tên đăng nhập</label>
        <input
          value={username} onChange={(e) => setUsername(e.target.value)}
          className="input" placeholder="admin"
          autoComplete="username" required
        />
      </div>
      <div>
        <label className="label">Mật khẩu</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="input" placeholder="••••••••"
          autoComplete="current-password" required
        />
      </div>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      <Button type="submit" variant="primary" loading={loading} className="w-full mt-1">
        Đăng nhập
      </Button>
    </form>
  );
}
