'use client';
import { Button } from '@/shared/components/Button';
import { useAiSuggest } from '../hooks/useAiSuggest';

interface AiSuggestPanelProps {
  content: string;
  onSelect: (text: string) => void;
}

export function AiSuggestPanel({ content, onSelect }: AiSuggestPanelProps) {
  const { suggestions, loading, error, getSuggestions, select } = useAiSuggest(onSelect);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" loading={loading} onClick={() => getSuggestions(content)} className="w-full">
        Gợi ý nội dung bằng AI
      </Button>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      {suggestions.map((s, i) => (
        <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p className="whitespace-pre-wrap text-gray-700 mb-2 text-xs leading-relaxed">{s.slice(0, 200)}{s.length > 200 ? '...' : ''}</p>
          <button onClick={() => select(s)} className="text-xs text-blue-500 hover:underline">
            Dùng nội dung này
          </button>
        </div>
      ))}
    </div>
  );
}
