'use client';
import { useEffect, useRef, useState } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Phổ biến',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😍','🥰','😘','😎','🤩','🥳',
             '😇','🤗','😏','😒','😞','😔','😟','😢','😭','😤','😠','🤬','🤯','😱','🥺','🙏'],
  },
  {
    label: 'Tay & Tim',
    emojis: ['👍','👎','👊','✊','🤜','🤛','👏','🙌','🤝','🤜','💪','☝️','👆','👇','👈','👉',
             '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
  },
  {
    label: 'Vật & Ký hiệu',
    emojis: ['🔥','⭐','🌟','✨','💫','⚡','🎉','🎊','🎈','🎁','🏆','🥇','🎯','💎','👑','🔑',
             '✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🔶','🔷','💯','🆕','🆓','🔔','📣','📢'],
  },
  {
    label: 'Thức ăn & Thiên nhiên',
    emojis: ['🌹','🌺','🌸','🌼','🌻','🌞','🌙','⭐','🌈','☀️','🍀','🌿','🍁','🍂','🌱','🌳',
             '🍎','🍊','🍋','🍇','🍓','🍔','🍕','🍜','🍣','🍦','🎂','☕','🧋','🍺','🥂','🍾'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bottom-full mb-1 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 w-72 overflow-hidden"
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setTab(i)}
            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
              tab === i ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-44 overflow-y-auto">
        {EMOJI_GROUPS[tab].emojis.map((emoji, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl p-1 rounded hover:bg-gray-100 transition-colors leading-none"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
