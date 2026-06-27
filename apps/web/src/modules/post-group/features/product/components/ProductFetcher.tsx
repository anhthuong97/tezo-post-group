'use client';
import { Button } from '@/shared/components/Button';
import { useProduct } from '../hooks/useProduct';

interface ProductFetcherProps {
  onFetched: (content: string, url: string) => void;
  onImagesReady?: (filenames: string[]) => void;
}

export function ProductFetcher({ onFetched, onImagesReady }: ProductFetcherProps) {
  const { url, setUrl, loading, error, fetchAndBuild } = useProduct(onFetched, onImagesReady);

  return (
    <div className="flex flex-col gap-2">
      <label className="label">Lấy nội dung từ sản phẩm tezo.vn</label>
      <div className="flex gap-2">
        <input
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tezo.vn/products/..."
          className="input flex-1 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && fetchAndBuild()}
        />
        <Button variant="secondary" loading={loading} onClick={fetchAndBuild}>
          Lấy
        </Button>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
