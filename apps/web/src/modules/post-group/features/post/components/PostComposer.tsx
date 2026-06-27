'use client';
import { useState, useRef, useCallback } from 'react';
import { Smile, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { ImagePicker } from './ImagePicker';
import { ProductFetcher } from '../../product/components/ProductFetcher';
import { PreviewModal } from './PreviewModal';
import { AiSuggestModal } from '../../ai/components/AiSuggestModal';
import { EmojiPicker } from '@/shared/components/EmojiPicker';
import type { Group } from '../../groups/types/group.types';
import type { ImgItem } from '../hooks/usePost';

interface PostComposerProps {
  content: string;
  setContent: (v: string) => void;
  productLink: string;
  setProductLink: (v: string) => void;
  spWebEnabled: boolean;
  setSpWebEnabled: (v: boolean) => void;
  commentTemplate: string;
  setCommentTemplate: (v: string) => void;
  commentEnabled: boolean;
  setCommentEnabled: (v: boolean) => void;
  imgList: ImgItem[];
  setImgList: (items: ImgItem[]) => void;
  addServerImages: (names: string[]) => void;
  clearAll: () => void;
  loading: boolean;
  error: string;
  selectedGroups: Group[];
  onStartPost: (groups: Group[]) => Promise<boolean>;
  onPostStarted: () => void;
}

function Toggle({ on, onChange, color = 'blue' }: { on: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-150 ${
        on ? (color === 'green' ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-300'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150 ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export function PostComposer({
  content, setContent,
  productLink, setProductLink,
  spWebEnabled, setSpWebEnabled,
  commentTemplate, setCommentTemplate,
  commentEnabled, setCommentEnabled,
  imgList, setImgList, addServerImages, clearAll,
  loading, error, selectedGroups, onStartPost, onPostStarted,
}: PostComposerProps) {
  const [showPreview, setShowPreview]   = useState(false);
  const [showAiModal, setShowAiModal]   = useState(false);
  const [showEmoji, setShowEmoji]       = useState(false);
  const [posting, setPosting]           = useState(false);
  const [localError, setLocalError]     = useState('');
  const textareaRef                     = useRef<HTMLTextAreaElement>(null);

  const handlePreview = () => {
    if (!content.trim()) { setLocalError('Vui lòng nhập nội dung.'); return; }
    if (!selectedGroups.length) { setLocalError('Vui lòng chọn ít nhất 1 nhóm.'); return; }
    setLocalError('');
    setShowPreview(true);
  };

  const handleConfirmPost = async () => {
    setPosting(true);
    const ok = await onStartPost(selectedGroups);
    setPosting(false);
    if (ok) { setShowPreview(false); onPostStarted(); }
  };

  const handleProductFetched = (fetchedContent: string, fetchedUrl: string) => {
    setContent(fetchedContent);
    setProductLink(fetchedUrl);
  };

  // Chèn emoji vào vị trí con trỏ trong textarea
  const insertEmoji = useCallback((emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) { setContent(content + emoji); return; }
    const start = ta.selectionStart ?? content.length;
    const end   = ta.selectionEnd   ?? content.length;
    const next  = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    setShowEmoji(false);
    // Khôi phục focus + cursor sau emoji
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
    });
  }, [content, setContent]);

  const previewComment = commentEnabled && commentTemplate
    ? commentTemplate.replace('{link bài viết}', productLink?.trim() || '(link SP)')
    : '';

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-4">

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-700 text-sm">Soạn bài đăng</h2>
        {selectedGroups.length > 0 && (
          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
            {selectedGroups.length} nhóm được chọn
          </span>
        )}
      </div>

      {/* ── Đăng SP Web ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Toggle
            on={spWebEnabled}
            onChange={setSpWebEnabled}
          />
          <span className={`text-sm font-semibold ${spWebEnabled ? 'text-blue-600' : 'text-gray-400'}`}>
            Đăng SP Web
          </span>
        </div>
        <div className={!spWebEnabled ? 'opacity-40 pointer-events-none' : ''}>
          <ProductFetcher onFetched={handleProductFetched} onImagesReady={addServerImages} />
        </div>
      </div>

      {/* ── Nội dung + Emoji + AI ── */}
      <div className="card p-4 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Nội dung bài đăng</label>
            {/* Nút emoji */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-yellow-500"
                title="Chèn emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showEmoji && (
                <EmojiPicker
                  onSelect={insertEmoji}
                  onClose={() => setShowEmoji(false)}
                />
              )}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập nội dung bài đăng..."
            rows={8}
            className="textarea w-full"
          />
        </div>

        {/* Nút AI — ngay dưới textarea */}
        <button
          type="button"
          onClick={() => setShowAiModal(true)}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border-2 border-dashed border-purple-300 text-purple-600 text-sm font-medium hover:bg-purple-50 hover:border-purple-400 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Gợi ý nội dung bằng AI
        </button>

        <div>
          <label className="label">Ảnh / Video</label>
          <ImagePicker items={imgList} onChange={setImgList} />
        </div>
      </div>

      {/* ── Comment sau khi đăng ── */}
      <div className="card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="label mb-0 text-sm font-semibold text-gray-700">Comment sau khi đăng</label>
          <Toggle on={commentEnabled} onChange={setCommentEnabled} color="green" />
        </div>
        <div className={!commentEnabled ? 'opacity-40 pointer-events-none' : ''}>
          <textarea
            value={commentTemplate}
            onChange={(e) => setCommentTemplate(e.target.value)}
            placeholder="Nội dung comment... dùng {link bài viết} để chèn link sản phẩm"
            rows={3}
            className="textarea w-full text-sm"
          />
          {commentTemplate && (
            <p className="text-xs text-gray-400 mt-1">
              Preview: <em>{previewComment || commentTemplate}</em>
            </p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            Dùng <code className="bg-gray-100 px-1 rounded">{'{link bài viết}'}</code> để chèn link SP vào comment.
          </p>
        </div>
      </div>

      {(error || localError) && (
        <p className="text-red-500 text-xs px-1">{error || localError}</p>
      )}

      <Button variant="primary" loading={loading} onClick={handlePreview} className="w-full h-11 text-base font-semibold">
        Xem trước & Đăng {selectedGroups.length > 0 ? `(${selectedGroups.length} nhóm)` : ''}
      </Button>

      <PreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        content={content}
        onContentChange={setContent}
        imgList={imgList}
        onImgListChange={setImgList}
        commentPreview={commentEnabled ? previewComment : ''}
        selectedGroups={selectedGroups}
        onConfirmPost={handleConfirmPost}
        posting={posting}
      />

      <AiSuggestModal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        content={content}
        onSelect={setContent}
      />
    </div>
  );
}
