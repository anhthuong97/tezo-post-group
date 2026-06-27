'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/modules/post-group/features/auth/api/auth.api';
import { LoginForm } from '@/modules/post-group/features/auth/components/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    authApi.me().then(() => router.replace('/post-group/dashboard')).catch(() => {});
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">FB Auto Poster</h1>
          <p className="text-gray-400 text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-gray-400 mt-6">
          Developed by ThuongNA5 © 2026
        </p>
      </div>
    </main>
  );
}
