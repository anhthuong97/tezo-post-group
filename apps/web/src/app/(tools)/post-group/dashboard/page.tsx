'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/modules/post-group/features/auth/api/auth.api';

import { LoginSection } from '@/modules/post-group/features/facebook/components/LoginSection';
import { GroupList } from '@/modules/post-group/features/groups/components/GroupList';
import { PostComposer } from '@/modules/post-group/features/post/components/PostComposer';
import { PostStatusModal } from '@/modules/post-group/features/post/components/PostStatusModal';
import { PostProgressDock } from '@/modules/post-group/features/post/components/PostProgressDock';
import { ApiKeyModal } from '@/modules/post-group/features/settings/components/ApiKeyModal';
import { UserManageModal } from '@/modules/post-group/features/auth/components/UserManageModal';
import { DevLog } from '@/shared/components/DevLog';
import { Button } from '@/shared/components/Button';

import { useFacebookLogin } from '@/modules/post-group/features/facebook/hooks/useFacebookLogin';
import { useGroups } from '@/modules/post-group/features/groups/hooks/useGroups';
import { usePost } from '@/modules/post-group/features/post/hooks/usePost';
import { usePostStatus } from '@/modules/post-group/features/post/hooks/usePostStatus';
import { usePolling } from '@/shared/hooks/usePolling';

export default function DashboardPage() {
  const router = useRouter();
  const [username, setUsername]         = useState('');
  const [apiKeyOpen, setApiKeyOpen]     = useState(false);
  const [statusOpen, setStatusOpen]     = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);

  useEffect(() => {
    authApi.me()
      .then((res) => { if (res.loggedIn) setUsername(res.username); })
      .catch(() => router.replace('/post-group/login'));
  }, [router]);

  const handleLogout = async () => {
    await authApi.logout();
    router.replace('/post-group/login');
  };

  const fb     = useFacebookLogin(() => {});
  const groups = useGroups();
  const post   = usePost();
  const ps     = usePostStatus();

  usePolling(ps.pollLogs, 3000, fb.mode === 'logged-in');
  useEffect(() => { fb.checkSession(); }, []);

  const initDoneRef = useRef(false);
  useEffect(() => {
    if (fb.mode !== 'logged-in') { initDoneRef.current = false; return; }
    if (initDoneRef.current) return;

    const identityCached = !!fb.currentIdentity;
    const groupsCurrent  = groups.groupsIdentity === fb.currentIdentity && groups.groups.length > 0;

    if (identityCached && groupsCurrent) { initDoneRef.current = true; return; }
    initDoneRef.current = true;

    if (!identityCached) {
      fb.loadIdentities().then((name) => { if (name) groups.loadGroups(name); });
    } else {
      groups.loadGroups(fb.currentIdentity);
    }
  }, [fb.mode, fb.currentIdentity]);

  const handlePostStarted = () => {
    setStatusOpen(true);
    ps.pollStatus();
  };

  const handleSwitchIdentity = async (name: string) => {
    if (name === fb.currentIdentity) return;
    groups.clearGroups();
    await fb.switchIdentity(name);
    groups.loadGroups(name);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">

      {/* ── Header ── */}
      <header className="shrink-0 bg-[#1877f2] text-white px-5 py-2.5 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">T</div>
          <div>
            <h1 className="font-bold text-base leading-tight">FB Auto Poster</h1>
            <p className="text-[10px] text-blue-200">tezo.vn © 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setUserMgmtOpen(true)}
            className="text-xs text-blue-100 hover:text-white px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors">
            Tài khoản
          </button>
          <button onClick={() => setApiKeyOpen(true)}
            className="text-xs text-blue-100 hover:text-white px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors">
            API Key
          </button>
          <div className="w-px h-4 bg-blue-400" />
          <span className="text-xs text-blue-100">{username}</span>
          <Button variant="ghost" onClick={handleLogout}
            className="text-white hover:bg-white/10 text-xs px-2.5 py-1 h-7">
            Đăng xuất
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex flex-col w-[380px] shrink-0 border-r border-gray-200 bg-white overflow-hidden">
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <LoginSection
              mode={fb.mode}
              loading={fb.loading}
              error={fb.error}
              identityLoading={fb.identityLoading}
              identityFailed={fb.identityFailed}
              identitySwitching={fb.identitySwitching}
              currentIdentity={fb.currentIdentity}
              switchable={fb.switchable}
              onOpen={fb.openLogin}
              onLogout={async () => { await fb.logoutFacebook(); groups.clearGroups(); }}
              onSwitchIdentity={handleSwitchIdentity}
              onReloadIdentity={fb.loadIdentities}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <GroupList
              groups={groups.groups}
              selected={groups.selected}
              search={groups.search}
              onSearch={groups.setSearch}
              onToggle={groups.toggle}
              onSelectAll={groups.selectAll}
              onDeselectAll={groups.deselectAll}
              onLoad={() => groups.loadGroups(fb.currentIdentity)}
              loading={groups.loading}
              error={groups.error}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <PostComposer
            content={post.content}
            setContent={post.setContent}
            productLink={post.productLink}
            setProductLink={post.setProductLink}
            spWebEnabled={post.spWebEnabled}
            setSpWebEnabled={post.setSpWebEnabled}
            commentTemplate={post.commentTemplate}
            setCommentTemplate={post.setCommentTemplate}
            commentEnabled={post.commentEnabled}
            setCommentEnabled={post.setCommentEnabled}
            imgList={post.imgList}
            setImgList={post.setImgList}
            addServerImages={post.addServerImages}
            clearAll={post.clearAll}
            loading={post.loading}
            error={post.error}
            selectedGroups={groups.selectedList}
            onStartPost={(groups) => post.startPost(groups, fb.currentIdentity)}
            onPostStarted={handlePostStarted}
          />
        </div>
      </div>

      <PostStatusModal open={statusOpen} onClose={() => setStatusOpen(false)}
        items={ps.status} onCancel={ps.cancel} onCancelAll={ps.cancelAll} />

      {!statusOpen && (
        <PostProgressDock items={ps.status} onOpen={() => setStatusOpen(true)} />
      )}

      <ApiKeyModal open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
      <UserManageModal open={userMgmtOpen} onClose={() => setUserMgmtOpen(false)} />
      <DevLog logs={ps.logs} />
    </div>
  );
}
