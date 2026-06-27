import type { Metadata } from 'next';
import { ErrorModal } from '@/shared/components/ErrorModal';

export const metadata: Metadata = { title: 'FB Auto Poster — Tezo' };

export default function PostGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ErrorModal />
    </>
  );
}
