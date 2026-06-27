'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../api/auth.api';

export function useLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authApi.login({ username, password });
      if (res.success) router.replace('/post-group/dashboard');
      else setError(res.error || 'Đăng nhập thất bại');
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return { username, setUsername, password, setPassword, loading, error, submit };
}
