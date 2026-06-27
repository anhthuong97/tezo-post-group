'use client';
import { useState, useCallback } from 'react';
import { groupsApi } from '../api/groups.api';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import type { Group } from '../types/group.types';

export function useGroups() {
  const [groups, setGroups]             = useLocalStorage<Group[]>('pg_groups', []);
  // identity mà danh sách groups này thuộc về
  const [groupsIdentity, setGroupsIdentity] = useLocalStorage<string>('pg_groups_identity', '');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // identity: tư cách đang đăng nhập lúc load — lưu để so sánh cache
  const loadGroups = useCallback(async (identity: string, onDone?: () => void) => {
    setLoading(true); setError('');
    try {
      const res = await groupsApi.list();
      if (res.success) {
        setGroups(res.groups || []);
        setGroupsIdentity(identity);
        onDone?.();
      } else {
        setError(res.error || 'Không tải được danh sách nhóm');
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [setGroups, setGroupsIdentity]);

  const toggle = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const visible = groups.filter((g) =>
      !search || g.name.toLowerCase().includes(search.toLowerCase()),
    );
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((g) => next.add(g.url));
      return next;
    });
  }, [groups, search]);

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const clearGroups = useCallback(() => {
    setGroups([]);
    setGroupsIdentity('');
    setSelected(new Set());
    setError('');
  }, [setGroups, setGroupsIdentity]);

  const filtered = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const selectedList = groups.filter((g) => selected.has(g.url));

  return {
    groups, groupsIdentity, filtered, selected, selectedList, search, setSearch,
    loading, error,
    loadGroups, clearGroups, toggle, selectAll, deselectAll,
  };
}
