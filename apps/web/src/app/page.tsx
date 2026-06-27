import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-3xl font-bold text-gray-800">Tezo</h1>
      <p className="text-gray-500">Chọn công cụ để bắt đầu</p>
      <div className="flex gap-4">
        <Link
          href="/post-group/dashboard"
          className="btn-primary px-6 py-3 rounded-xl text-base"
        >
          FB Auto Poster
        </Link>
      </div>
    </main>
  );
}
