import type { Metadata } from 'next';
import '@/shared/styles/globals.css';

export const metadata: Metadata = {
  title: 'Tezo',
  description: 'Bộ công cụ tự động hóa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 h-screen overflow-hidden">{children}</body>
    </html>
  );
}
