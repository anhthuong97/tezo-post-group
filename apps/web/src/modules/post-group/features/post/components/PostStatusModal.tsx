'use client';
import { Loader2, ExternalLink, X } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import type { PostStatusItem, PostStatus } from '../types/post.types';

interface StatusCfg { label: string; cls: string; spin?: boolean }
const STATUS_CFG: Record<PostStatus, StatusCfg> = {
  pending:    { label: 'Đang chờ',    cls: 'text-gray-400' },
  uploading:  { label: 'Tải ảnh',     cls: 'text-sky-500',    spin: true },
  writing:    { label: 'Viết bài',    cls: 'text-indigo-500', spin: true },
  posting:    { label: 'Đang đăng',   cls: 'text-blue-500',   spin: true },
  commenting: { label: 'Comment',     cls: 'text-purple-500', spin: true },
  success:    { label: 'Thành công',  cls: 'text-green-600' },
  error:      { label: 'Lỗi',         cls: 'text-red-500' },
  cancelled:  { label: 'Đã hủy',      cls: 'text-gray-400' },
};

// Steps shown for an active group (uploading/writing/posting/commenting)
const STEPS: { key: PostStatus; label: string }[] = [
  { key: 'uploading',  label: 'Tải ảnh' },
  { key: 'writing',    label: 'Viết bài' },
  { key: 'posting',    label: 'Đăng bài' },
  { key: 'commenting', label: 'Comment' },
];
const STEP_KEYS = new Set<PostStatus>(['uploading', 'writing', 'posting', 'commenting']);
const DONE_KEYS = new Set<PostStatus>(['success', 'error', 'cancelled']);

function StepIndicator({ currentStatus }: { currentStatus: PostStatus }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStatus);
  return (
    <div className="flex items-center gap-0 mt-1">
      {STEPS.map((s, idx) => {
        const done    = idx < currentIdx;
        const active  = idx === currentIdx;
        return (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
              active  ? 'bg-blue-100 text-blue-600'
              : done  ? 'bg-green-100 text-green-600'
                      : 'text-gray-300'
            }`}>
              {active && <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />}
              {done  && <span className="mr-0.5">✓</span>}
              {s.label}
            </div>
            {idx < STEPS.length - 1 && (
              <span className={`mx-0.5 text-[10px] ${done ? 'text-green-400' : 'text-gray-200'}`}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PostStatusModalProps {
  open: boolean;
  onClose: () => void;
  items: PostStatusItem[];
  onCancel: (url: string) => void;
  onCancelAll: () => void;
}

export function PostStatusModal({ open, onClose, items, onCancel, onCancelAll }: PostStatusModalProps) {
  const hasPending   = items.some((i) => i.status === 'pending');
  const successCount = items.filter((i) => i.status === 'success').length;
  const errorCount   = items.filter((i) => i.status === 'error').length;
  const total        = items.length;

  return (
    <Modal open={open} onClose={onClose} title="Tiến trình đăng bài" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3">

        {/* Summary + Cancel All */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {total > 0 && (
              <>
                Tổng <strong>{total}</strong> nhóm —{' '}
                <span className="text-green-600 font-medium">{successCount} thành công</span>
                {errorCount > 0 && (
                  <>, <span className="text-red-500 font-medium">{errorCount} lỗi</span></>
                )}
              </>
            )}
          </p>
          {hasPending && (
            <Button variant="danger" onClick={onCancelAll} className="text-xs h-7 px-3">
              Hủy tất cả chờ
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: '460px' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-6">#</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200">Nhóm</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-28">Trạng thái</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-16">Giờ</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200">Link bài</th>
                <th className="px-3 py-2 border-b border-gray-200 w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const cfg      = STATUS_CFG[item.status] || { label: item.status, cls: '' };
                const isActive = STEP_KEYS.has(item.status);
                const isDone   = DONE_KEYS.has(item.status);

                return (
                  <tr
                    key={item.url}
                    className={`border-b border-gray-100 last:border-0 transition-colors ${
                      isActive         ? 'bg-blue-50/60'
                      : item.status === 'success'   ? 'bg-green-50/40'
                      : item.status === 'error'     ? 'bg-red-50/30'
                      : item.status === 'cancelled' ? 'opacity-50'
                      : ''
                    }`}
                  >
                    {/* # */}
                    <td className="px-3 py-2.5 text-xs text-gray-400 align-top">{idx + 1}</td>

                    {/* Tên nhóm + step indicator */}
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-medium text-gray-800 text-xs leading-tight truncate max-w-[200px]">
                        {item.name}
                      </p>
                      {isActive && <StepIndicator currentStatus={item.status} />}
                      {!isActive && item.message && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">
                          {item.message}
                        </p>
                      )}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-3 py-2.5 align-top">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.cls}`}>
                        {cfg.spin && <Loader2 className="w-3 h-3 animate-spin" />}
                        {cfg.label}
                      </span>
                    </td>

                    {/* Giờ đăng */}
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap align-top">
                      {item.doneAt || '—'}
                    </td>

                    {/* Link bài viết */}
                    <td className="px-3 py-2.5 align-top">
                      {item.postLink ? (
                        <a
                          href={item.postLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          Xem bài
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Hủy (chỉ pending) */}
                    <td className="px-3 py-2.5 text-center align-top">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => onCancel(item.url)}
                          title="Hủy nhóm này"
                          className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
