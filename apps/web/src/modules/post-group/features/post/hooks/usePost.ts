'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { postApi } from '../api/post.api';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';

export type ImgItem =
  | { id: string; type: 'local'; file: File }
  | { id: string; type: 'server'; name: string };

function uid() { return Math.random().toString(36).slice(2, 9); }

const DEFAULT_COMMENT_TPL = 'ĐẶT HÀNG NGAY TẠI LINK: {link bài viết}';

export function usePost() {
  // ── spWebEnabled: không persist, luôn = false khi F5 ─────────────────────
  const [spWebEnabled, setSpWebEnabledState] = useState(false);

  // ── Mode B (normal): localStorage — giữ sau F5 ───────────────────────────
  const [contentB, setContentB]               = useLocalStorage('pg_content', '');
  const [serverImgNamesB, setServerImgNamesB] = useLocalStorage<string[]>('pg_server_imgs', []);
  const [imgListB, setImgListBRaw]            = useState<ImgItem[]>([]);
  const restoredBRef                          = useRef(false);

  // ── Mode A (spweb): useState — reset khi F5, nhớ khi chuyển mode ─────────
  const [contentA, setContentA]   = useState('');
  const [productLink, setProductLink] = useState('');
  const [imgListA, setImgListARaw] = useState<ImgItem[]>([]);

  // ── Comment — riêng theo mode (B: localStorage, A: useState) ─────────────
  const [commentTplB, setCommentTplB] = useLocalStorage('pg_comment_tpl', DEFAULT_COMMENT_TPL);
  const [commentOnB, setCommentOnB]   = useLocalStorage<boolean>('pg_comment_on', false);
  const [commentTplA, setCommentTplA] = useState(DEFAULT_COMMENT_TPL);
  const [commentOnA, setCommentOnA]   = useState(false);
  const firstSwitchToARef             = useRef(true); // reset về true mỗi lần F5

  const commentTemplate    = spWebEnabled ? commentTplA : commentTplB;
  const commentEnabled     = spWebEnabled ? commentOnA  : commentOnB;
  const setCommentTemplate = useCallback((v: string) => {
    if (spWebEnabled) setCommentTplA(v); else setCommentTplB(v);
  }, [spWebEnabled, setCommentTplA, setCommentTplB]);
  const setCommentEnabled  = useCallback((v: boolean) => {
    if (spWebEnabled) setCommentOnA(v); else setCommentOnB(v);
  }, [spWebEnabled, setCommentOnA, setCommentOnB]);

  // Restore Mode B images từ localStorage sau mount
  useEffect(() => {
    if (restoredBRef.current || serverImgNamesB.length === 0) return;
    restoredBRef.current = true;
    setImgListBRaw(serverImgNamesB.map((name) => ({ id: uid(), type: 'server' as const, name })));
  }, [serverImgNamesB]);

  // ── Derived: giá trị hiển thị phụ thuộc vào mode đang active ─────────────
  const content = spWebEnabled ? contentA : contentB;
  const imgList = spWebEnabled ? imgListA : imgListB;

  const setContent = useCallback((v: string) => {
    if (spWebEnabled) setContentA(v);
    else setContentB(v);
  }, [spWebEnabled, setContentA, setContentB]);

  const setSpWebEnabled = useCallback((v: boolean) => {
    if (!v) restoredBRef.current = restoredBRef.current || serverImgNamesB.length === 0;
    if (v && firstSwitchToARef.current) {
      firstSwitchToARef.current = false;
      setCommentOnA(true); // lần đầu bật SP Web → tự bật comment
    }
    setSpWebEnabledState(v);
  }, [serverImgNamesB.length]);

  // imgList setter — ghi vào storage của mode đang active
  const handleImgListChange = useCallback((items: ImgItem[]) => {
    if (spWebEnabled) {
      setImgListARaw(items);
    } else {
      setImgListBRaw(items);
      setServerImgNamesB(
        items.filter((x): x is Extract<ImgItem, { type: 'server' }> => x.type === 'server').map((x) => x.name),
      );
    }
  }, [spWebEnabled, setServerImgNamesB]);

  const addServerImages = useCallback((names: string[]) => {
    const newItems: ImgItem[] = names.map((name) => ({ id: uid(), type: 'server' as const, name }));
    if (spWebEnabled) {
      setImgListARaw((prev) => [...prev, ...newItems]);
    } else {
      setImgListBRaw((prev) => {
        const next = [...prev, ...newItems];
        setServerImgNamesB(
          next.filter((x): x is Extract<ImgItem, { type: 'server' }> => x.type === 'server').map((x) => x.name),
        );
        return next;
      });
    }
  }, [spWebEnabled, setServerImgNamesB]);

  // clearAll: xóa data của mode đang active
  const clearAll = useCallback(() => {
    if (spWebEnabled) {
      setContentA('');
      setProductLink('');
      setImgListARaw([]);
      setCommentTplA(DEFAULT_COMMENT_TPL);
      setCommentOnA(false);
    } else {
      setContentB('');
      setImgListBRaw([]);
      setServerImgNamesB([]);
      restoredBRef.current = true;
    }
  }, [spWebEnabled, setContentB, setServerImgNamesB]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const startPost = useCallback(async (
    groups: Array<{ url: string; name: string }>,
    identity?: string,
  ) => {
    if (!content.trim()) { setError('Vui lòng nhập nội dung.'); return false; }
    if (!groups.length)  { setError('Vui lòng chọn ít nhất 1 nhóm.'); return false; }
    setLoading(true); setError('');
    try {
      const locals = imgList.filter((x): x is Extract<ImgItem, { type: 'local' }> => x.type === 'local');
      const uploadMap: Record<string, string> = {};
      if (locals.length > 0) {
        const res = await postApi.upload(locals.map((x) => x.file));
        if (res.success && res.files) {
          locals.forEach((item, i) => { uploadMap[item.id] = res.files[i]?.name || ''; });
        }
      }
      const orderedImages = imgList
        .map((item) => (item.type === 'server' ? item.name : uploadMap[item.id]))
        .filter(Boolean) as string[];

      let comment: string | undefined;
      if (commentEnabled && commentTemplate?.trim()) {
        const tpl = commentTemplate.trim();
        comment = tpl.includes('{link bài viết}')
          ? tpl
          : spWebEnabled && productLink?.trim() ? `${tpl}\n${productLink.trim()}` : tpl;
      }

      const res = await postApi.start({
        groups, content, images: orderedImages,
        productLink: spWebEnabled ? productLink?.trim() || undefined : undefined,
        comment,
        identity: identity?.trim() || undefined,
      });
      return !!res.success;
    } catch (e: any) { setError(e.message); return false; }
    finally { setLoading(false); }
  }, [content, productLink, spWebEnabled, commentTemplate, commentEnabled, imgList]);

  return {
    content, setContent,
    productLink, setProductLink,
    spWebEnabled, setSpWebEnabled,
    commentTemplate, setCommentTemplate,
    commentEnabled, setCommentEnabled,
    imgList,
    setImgList: handleImgListChange,
    addServerImages,
    clearAll,
    loading, error, setError,
    startPost,
  };
}
