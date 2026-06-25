const helpBtn = document.getElementById('helpBtn');
const helpModalOverlay = document.getElementById('helpModalOverlay');
const closeHelpModalBtn = document.getElementById('closeHelpModalBtn');

helpBtn.addEventListener('click', () => {
  helpModalOverlay.hidden = false;
});

closeHelpModalBtn.addEventListener('click', () => {
  helpModalOverlay.hidden = true;
});

// Gemini API Key — entered once via a small modal, saved on this machine
// forever. The header button never shows it. The modal shows only a
// partial mask (e.g. "ABC***ABCD") when opened, as a readable confirmation
// that *a* key is saved — not the real value. Clicking into the field
// clears that preview and switches to a real password input for entering
// a new key, so the partial mask itself can never be mistaken for new input.
const GEMINI_KEY_STORAGE = 'post-group:geminiApiKey';
const geminiApiKeyBtn = document.getElementById('geminiApiKeyBtn');
const geminiApiKeyModalOverlay = document.getElementById('geminiApiKeyModalOverlay');
const geminiApiKeyModalInput = document.getElementById('geminiApiKeyModalInput');
const closeGeminiKeyModalBtn = document.getElementById('closeGeminiKeyModalBtn');
const saveGeminiKeyBtn = document.getElementById('saveGeminiKeyBtn');

geminiApiKeyBtn.textContent = '🔑 API Key';

function getGeminiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
}

function maskGeminiKeyPreview(key) {
  if (!key || key.length <= 7) return '*'.repeat(key.length || 8);
  return key.slice(0, 3) + '***' + key.slice(-4);
}

let geminiKeyFieldDirty = false;

geminiApiKeyBtn.addEventListener('click', () => {
  const key = getGeminiKey();
  geminiKeyFieldDirty = false;
  geminiApiKeyModalInput.type = 'text';
  geminiApiKeyModalInput.value = key ? maskGeminiKeyPreview(key) : '';
  geminiApiKeyModalInput.placeholder = key ? '' : 'Dán Gemini API Key vào đây...';
  geminiApiKeyModalOverlay.hidden = false;
});

geminiApiKeyModalInput.addEventListener('focus', () => {
  geminiApiKeyModalInput.type = 'password';
  geminiApiKeyModalInput.value = '';
  geminiApiKeyModalInput.placeholder = 'Nhập API Key mới...';
});

geminiApiKeyModalInput.addEventListener('input', () => {
  geminiKeyFieldDirty = true;
});

closeGeminiKeyModalBtn.addEventListener('click', () => {
  geminiApiKeyModalOverlay.hidden = true;
});

saveGeminiKeyBtn.addEventListener('click', () => {
  // Only overwrite the saved key if the user actually typed something —
  // the partial-mask preview shown on open must never count as "new input".
  if (geminiKeyFieldDirty) {
    const typed = geminiApiKeyModalInput.value.trim();
    if (typed) localStorage.setItem(GEMINI_KEY_STORAGE, typed);
  }
  geminiApiKeyModalOverlay.hidden = true;
});

geminiApiKeyModalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveGeminiKeyBtn.click();
});

const openLoginBtn = document.getElementById('openLoginBtn');
const confirmLoginBtn = document.getElementById('confirmLoginBtn');
const loginStatus = document.getElementById('loginStatus');
const loginBody = document.getElementById('loginBody');
const toggleLoginBtn = document.getElementById('toggleLoginBtn');
const loginDoneBadge = document.getElementById('loginDoneBadge');
const groupList = document.getElementById('groupList');
const groupSearch = document.getElementById('groupSearch');
const selectedCount = document.getElementById('selectedCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const postBtn = document.getElementById('postBtn');
const logBox = document.getElementById('logBox');
const toggleLogBtn = document.getElementById('toggleLogBtn');
const appDevlog = document.getElementById('appDevlog');
const showDevLogBtn = document.getElementById('showDevLogBtn');
const devlogResizer = document.getElementById('devlogResizer');
const appSidebar = document.getElementById('appSidebar');
const sidebarResizer = document.getElementById('sidebarResizer');

// Lets the user drag each layer's width instead of it being fixed.
// `direction` is +1 when the panel sits to the left of its resizer
// (dragging right grows it) and -1 when the panel sits to the right
// (dragging right shrinks it).
function makeResizable(resizerEl, panelEl, { min, max, direction, storageKey }) {
  const saved = Number(localStorage.getItem(storageKey));
  if (saved) panelEl.style.flexBasis = `${saved}px`;

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e) {
    const delta = (e.clientX - startX) * direction;
    const width = Math.max(min, Math.min(max, startWidth + delta));
    panelEl.style.flexBasis = `${width}px`;
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    resizerEl.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(storageKey, parseInt(panelEl.style.flexBasis, 10));
  }

  resizerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panelEl.getBoundingClientRect().width;
    resizerEl.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

makeResizable(sidebarResizer, appSidebar, {
  min: 260,
  max: 640,
  direction: 1,
  storageKey: 'post-group:sidebarWidth',
});
makeResizable(devlogResizer, appDevlog, {
  min: 240,
  max: 640,
  direction: -1,
  storageKey: 'post-group:devlogWidth',
});

toggleLoginBtn.addEventListener('click', () => {
  loginBody.hidden = !loginBody.hidden;
  toggleLoginBtn.textContent = loginBody.hidden ? 'Hiện' : 'Ẩn';
});

// Generic full-screen lock used while the app itself is busy (not while
// waiting on the user to type something in the Facebook window) — blocks
// interaction and shows a simulated percentage so it never looks stuck.
const lockOverlay = document.getElementById('lockOverlay');
const lockMessage = document.getElementById('lockMessage');
const lockProgressBar = document.getElementById('lockProgressBar');
const lockPercent = document.getElementById('lockPercent');

let lockProgressTimer;
let lockProgressValue = 0;

function setLockProgress(percent) {
  lockProgressValue = percent;
  const rounded = Math.min(99, Math.round(percent));
  lockProgressBar.style.width = rounded + '%';
  lockPercent.textContent = rounded + '%';
}

function showLockOverlay(message) {
  lockMessage.textContent = message;
  lockOverlay.hidden = false;
  lockProgressValue = 0;
  setLockProgress(0);
  clearInterval(lockProgressTimer);
  // Eases toward 92% over time and parks there — never claims 100% until
  // hideLockOverlay() is actually called, regardless of how long this takes.
  lockProgressTimer = setInterval(() => {
    setLockProgress(lockProgressValue + (92 - lockProgressValue) * 0.08);
  }, 200);
}

function hideLockOverlay() {
  clearInterval(lockProgressTimer);
  setLockProgress(100);
  setTimeout(() => {
    lockOverlay.hidden = true;
  }, 200);
}

// "Ẩn" hides the whole dev panel (not just the log text inside it), freeing
// up that column entirely. A small tab on the screen edge brings it back.
toggleLogBtn.addEventListener('click', () => {
  appDevlog.hidden = true;
  devlogResizer.hidden = true;
  showDevLogBtn.hidden = false;
});

showDevLogBtn.addEventListener('click', () => {
  appDevlog.hidden = false;
  devlogResizer.hidden = false;
  showDevLogBtn.hidden = true;
});

let pollInterval;

function startLogPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    const res = await fetch('/api/log');
    const data = await res.json();
    logBox.textContent = data.log.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }, 1500);
}

openLoginBtn.addEventListener('click', async () => {
  openLoginBtn.disabled = true;
  loginStatus.textContent = 'Đang mở cửa sổ Facebook...';
  showLockOverlay('Đang mở cửa sổ Facebook...');
  startLogPolling();

  try {
    const res = await fetch('/api/open-login', { method: 'POST' });
    const data = await res.json();
    hideLockOverlay();
    if (!data.success) {
      loginStatus.textContent = 'Lỗi: ' + data.error;
      openLoginBtn.disabled = false;
      return;
    }
    loginStatus.textContent =
      'Hãy tự đăng nhập trong cửa sổ vừa mở. App sẽ tự phát hiện và tiếp tục, không cần bấm gì thêm.';
    confirmLoginBtn.hidden = false;
    pollUntilLoggedIn();
  } catch (err) {
    hideLockOverlay();
    loginStatus.textContent = 'Lỗi: ' + err.message;
    openLoginBtn.disabled = false;
  }
});

confirmLoginBtn.addEventListener('click', async () => {
  stopLoginPolling();
  confirmLoginBtn.disabled = true;
  const ok = await confirmLoginAndLoadGroups();
  if (!ok) confirmLoginBtn.disabled = false;
  else confirmLoginBtn.hidden = true;
});

// Groups are cached so a normal page refresh doesn't have to re-scrape
// Facebook's (slow) groups list every time — only an explicit re-login or
// the "Reload Group" button does that.
const GROUPS_CACHE_KEY = 'post-group:groups';

function getCachedGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function applyGroupsToUI(groups) {
  renderGroups(groups);
  loginStatus.textContent = `Tìm thấy ${groups.length} group.`;
  loginBody.hidden = true;
  toggleLoginBtn.textContent = 'Hiện';
  loginDoneBadge.hidden = false;
  // Fire-and-forget: don't block the group list on this, just keep the
  // identity dropdown current whenever groups get (re)loaded.
  loadIdentities();
}

const identitySection = document.getElementById('identitySection');
const identitySelect = document.getElementById('identitySelect');
const reloadIdentitiesBtn = document.getElementById('reloadIdentitiesBtn');
const identityStatus = document.getElementById('identityStatus');

async function loadIdentities() {
  try {
    const res = await fetch('/api/identities');
    const data = await res.json();
    if (!data.success) {
      identityStatus.textContent = 'Lỗi lấy danh tính: ' + data.error;
      return;
    }
    const names = [data.current, ...data.switchable].filter(Boolean);
    identitySelect.innerHTML = names
      .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
      .join('');
    identitySelect.value = data.current || names[0] || '';
    identityStatus.textContent = data.current ? `Đang đăng với tư cách: ${data.current}` : '';
    identitySection.hidden = false;
  } catch (err) {
    identityStatus.textContent = 'Lỗi: ' + err.message;
  }
}

reloadIdentitiesBtn.addEventListener('click', () => loadIdentities());

identitySelect.addEventListener('change', async () => {
  const target = identitySelect.value;
  // Locks the group section for the whole switch+reload operation —
  // loadGroupsWithLock() below takes over the same lock with its own
  // message, so there's no flicker in between.
  showGroupSectionLock(`Đang chuyển sang đăng với tên: ${target}...`);
  try {
    await fetch('/api/identities/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: target }),
    });
    identityStatus.textContent = `Đang đăng với tư cách: ${target}`;
    // Switching identity changes which groups are visible — always refetch fresh.
    await loadGroupsWithLock();
  } catch (err) {
    hideGroupSectionLock();
    identityStatus.textContent = 'Lỗi chuyển danh tính: ' + err.message;
  }
});

function useCachedGroupsIfAny() {
  const cached = getCachedGroups();
  if (!cached) return false;
  applyGroupsToUI(cached);
  return true;
}

const groupSectionLock = document.getElementById('groupSectionLock');
const groupSectionLockMessage = document.getElementById('groupSectionLockMessage');

function showGroupSectionLock(message) {
  groupSectionLockMessage.textContent = message;
  groupSectionLock.hidden = false;
}

function hideGroupSectionLock() {
  groupSectionLock.hidden = true;
}

async function loadGroupsWithLock() {
  showGroupSectionLock('Đang tải danh sách group...');
  try {
    const groupsRes = await fetch('/api/groups');
    const groupsData = await groupsRes.json();
    if (!groupsData.success) {
      hideGroupSectionLock();
      loginStatus.textContent = 'Lỗi lấy group: ' + groupsData.error;
      return false;
    }

    localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(groupsData.groups));
    applyGroupsToUI(groupsData.groups);
    hideGroupSectionLock();
    return true;
  } catch (err) {
    hideGroupSectionLock();
    loginStatus.textContent = 'Lỗi: ' + err.message;
    return false;
  }
}

async function confirmLoginQuietly() {
  showLockOverlay('Đang kiểm tra đăng nhập...');
  try {
    const res = await fetch('/api/confirm-login', { method: 'POST' });
    const data = await res.json();
    hideLockOverlay();
    if (!data.success) {
      loginStatus.textContent = 'Lỗi: ' + data.error;
      return false;
    }
    return true;
  } catch (err) {
    hideLockOverlay();
    loginStatus.textContent = 'Lỗi: ' + err.message;
    return false;
  }
}

// Used whenever the user explicitly (re-)logs in — manual confirm click or
// poll-detected success — so it always re-scrapes fresh groups, since this
// might be a different Facebook account than whatever was cached before.
async function confirmLoginAndLoadGroups() {
  const ok = await confirmLoginQuietly();
  if (!ok) return false;
  return loadGroupsWithLock();
}

// Polls quietly (no lock screen — the user is busy typing in the Facebook
// window, not waiting on our app) until login is detected, then takes over
// automatically: no "Tôi đã đăng nhập xong" click required.
let loginPollInterval;

function pollUntilLoggedIn() {
  if (loginPollInterval) return;
  loginPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/confirm-login', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        stopLoginPolling();
        confirmLoginBtn.hidden = true;
        await loadGroupsWithLock();
      }
    } catch {
      // Transient network hiccup — keep polling.
    }
  }, 2000);
}

function stopLoginPolling() {
  clearInterval(loginPollInterval);
  loginPollInterval = undefined;
}

// On page load, if a session was already saved from a previous run, skip
// straight to the group list instead of making the user click through login again.
(async () => {
  const res = await fetch('/api/has-session');
  const { hasSession } = await res.json();
  if (!hasSession) return;

  openLoginBtn.disabled = true;
  loginStatus.textContent = 'Phát hiện session đã lưu, đang tự kiểm tra đăng nhập...';
  startLogPolling();
  showLockOverlay('Đang mở trình duyệt và kiểm tra session...');

  const openRes = await fetch('/api/open-login', { method: 'POST' });
  const openData = await openRes.json();
  if (!openData.success) {
    hideLockOverlay();
    loginStatus.textContent = 'Lỗi: ' + openData.error;
    openLoginBtn.disabled = false;
    return;
  }

  // Resuming a saved session — just confirm login, then prefer the cached
  // groups list over re-scraping Facebook again on every page refresh.
  const ok = await confirmLoginQuietly();
  if (!ok) {
    loginStatus.textContent +=
      ' Session cũ có thể đã hết hiệu lực — hãy tự đăng nhập lại trong cửa sổ vừa mở, app sẽ tự tiếp tục.';
    openLoginBtn.disabled = false;
    confirmLoginBtn.hidden = false;
    pollUntilLoggedIn();
    return;
  }

  if (!useCachedGroupsIfAny()) {
    await loadGroupsWithLock();
  }
})();

const COMBINING_MARKS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeForSearch(str) {
  return str.normalize('NFD').replace(COMBINING_MARKS_REGEX, '').toLowerCase();
}

function renderGroups(groups) {
  groupList.innerHTML = '';
  for (const g of groups) {
    const label = document.createElement('label');
    label.dataset.search = normalizeForSearch(g.name);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = g.url;
    checkbox.className = 'group-checkbox';
    label.appendChild(checkbox);

    const nameLink = document.createElement('a');
    nameLink.href = g.url;
    nameLink.className = 'group-name-link';
    nameLink.textContent = ' ' + g.name;
    nameLink.title = 'Mở group này trong trình duyệt tự động của app';
    nameLink.addEventListener('click', (e) => {
      e.preventDefault();
      openGroupInAutomationBrowser(g.url);
    });
    label.appendChild(nameLink);

    if (g.meta) {
      const meta = document.createElement('span');
      meta.className = 'group-meta';
      meta.textContent = g.meta;
      label.appendChild(meta);
    }

    groupList.appendChild(label);
  }
  updateSelectedCount();
}

async function openGroupInAutomationBrowser(url) {
  try {
    const res = await fetch('/api/open-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.success) alert('Không mở được group: ' + data.error);
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

function updateSelectedCount() {
  const count = groupList.querySelectorAll('.group-checkbox:checked').length;
  selectedCount.textContent = `Đã chọn ${count} group`;
}

groupList.addEventListener('change', (e) => {
  if (e.target.classList.contains('group-checkbox')) updateSelectedCount();
});

groupSearch.addEventListener('input', () => {
  const term = normalizeForSearch(groupSearch.value.trim());
  for (const label of groupList.querySelectorAll('label')) {
    label.style.display = !term || label.dataset.search.includes(term) ? '' : 'none';
  }
});

function setCheckedForVisible(checked) {
  for (const label of groupList.querySelectorAll('label')) {
    if (label.style.display === 'none') continue;
    label.querySelector('.group-checkbox').checked = checked;
  }
  updateSelectedCount();
}

selectAllBtn.addEventListener('click', () => setCheckedForVisible(true));
deselectAllBtn.addEventListener('click', () => setCheckedForVisible(false));

const reloadGroupsBtn = document.getElementById('reloadGroupsBtn');
reloadGroupsBtn.addEventListener('click', () => loadGroupsWithLock());

const postModalOverlay = document.getElementById('postModalOverlay');
const postStatusTableBody = document.querySelector('#postStatusTable tbody');
const postSummary = document.getElementById('postSummary');
const closePostModalBtn = document.getElementById('closePostModalBtn');
const minimizePostModalBtn = document.getElementById('minimizePostModalBtn');
const cancelAllPostBtn = document.getElementById('cancelAllPostBtn');
const postProgressDock = document.getElementById('postProgressDock');
const progressDockText = document.getElementById('progressDockText');
const progressDockStats = document.getElementById('progressDockStats');

async function cancelGroupPost(url) {
  await fetch('/api/post/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

cancelAllPostBtn.addEventListener('click', async () => {
  await fetch('/api/post/cancel-all', { method: 'POST' });
});

minimizePostModalBtn.addEventListener('click', () => {
  postModalOverlay.hidden = true;
  postProgressDock.classList.remove('hidden');
});

postProgressDock.addEventListener('click', () => {
  postProgressDock.classList.add('hidden');
  postModalOverlay.hidden = false;
});

let postStatusPollInterval;

const STATUS_LABELS = {
  pending: '⏳ Đang chờ',
  processing: '🔵 Đang đăng...',
  commenting: '🔵 Đang viết comment...',
  success: '✅ Thành công',
  error: '❌ Lỗi',
  cancelled: '🚫 Đã hủy',
};

function renderPostStatusTable(selectedGroups) {
  postStatusTableBody.innerHTML = '';
  for (const g of selectedGroups) {
    const tr = document.createElement('tr');
    tr.dataset.url = g.url;
    const nameTd = document.createElement('td');
    nameTd.textContent = g.name;
    const statusTd = document.createElement('td');
    statusTd.className = 'status-pending';
    statusTd.textContent = STATUS_LABELS.pending;
    const linkTd = document.createElement('td');
    linkTd.className = 'post-link-cell';
    const actionTd = document.createElement('td');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost-btn cancel-group-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelGroupPost(g.url));
    actionTd.appendChild(cancelBtn);
    tr.append(nameTd, statusTd, linkTd, actionTd);
    postStatusTableBody.appendChild(tr);
  }
  cancelAllPostBtn.disabled = false;
  postSummary.textContent = `Đã đăng 0/${selectedGroups.length} group. Failed: 0. Cancel: 0.`;
}

function startPostStatusPolling() {
  if (postStatusPollInterval) return;
  postStatusPollInterval = setInterval(async () => {
    const res = await fetch('/api/post-status');
    const { postStatus } = await res.json();
    let success = 0;
    let error = 0;
    let cancelled = 0;
    let pending = 0;
    for (const item of postStatus) {
      const row = postStatusTableBody.querySelector(`tr[data-url="${CSS.escape(item.url)}"]`);
      if (row) {
        const statusTd = row.children[1];
        statusTd.className = `status-${item.status}`;
        if (item.status === 'error' && item.message) {
          statusTd.textContent = `${STATUS_LABELS.error}: ${item.message}`;
        } else if (item.status === 'success' && item.doneAt) {
          statusTd.textContent = `✅ Thành công lúc ${item.doneAt}`;
        } else {
          statusTd.textContent = STATUS_LABELS[item.status] ?? item.status;
        }

        // Fill in post link when available
        const linkTd = row.children[2];
        if (item.postLink && !linkTd.querySelector('a')) {
          const a = document.createElement('a');
          a.href = item.postLink;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'post-link-btn';
          a.textContent = '🔗 Xem bài';
          linkTd.appendChild(a);
        }

        // Highlight the row the loop is actively working on right now.
        row.classList.toggle('row-active', item.status === 'processing');

        // Can still cancel a group that hasn't started or is mid-flight, but
        // not one that's already finished/cancelled.
        const cancelBtn = row.querySelector('.cancel-group-btn');
        if (cancelBtn) cancelBtn.disabled = item.status !== 'pending' && item.status !== 'processing' && item.status !== 'commenting';
      }
      if (item.status === 'success') success++;
      else if (item.status === 'error') error++;
      else if (item.status === 'cancelled') cancelled++;
      else pending++;
    }

    const summaryText = `Đã đăng ${success}/${postStatus.length} group. Failed: ${error}. Cancel: ${cancelled}.`;
    postSummary.textContent = summaryText;
    cancelAllPostBtn.disabled = pending === 0;

    // Keep the corner overview current even while the full modal is minimized.
    progressDockText.textContent = pending > 0 ? 'Đang đăng bài...' : 'Đã đăng xong';
    progressDockStats.textContent = summaryText;
  }, 1500);
}

function stopPostStatusPolling() {
  clearInterval(postStatusPollInterval);
  postStatusPollInterval = undefined;
}

closePostModalBtn.addEventListener('click', () => {
  postModalOverlay.hidden = true;
  postProgressDock.classList.add('hidden');
  stopPostStatusPolling();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const imagesInput = document.getElementById('images');
const imagesPickerBtn = document.getElementById('imagesPickerBtn');
const imagesPickerStatus = document.getElementById('imagesPickerStatus');
const clearImagesBtn = document.getElementById('clearImagesBtn');
const filePreview = document.getElementById('filePreview');
const contentInput = document.getElementById('content');

const CONTENT_STORAGE_KEY = 'post-group:content';
contentInput.value = localStorage.getItem(CONTENT_STORAGE_KEY) || '';
contentInput.addEventListener('input', () => {
  localStorage.setItem(CONTENT_STORAGE_KEY, contentInput.value);
});

// AI gợi ý nội dung — asks Gemini for 5 reworded variations of the current
// content (same core message), lets the user pick one and apply it.
const aiSuggestBtn = document.getElementById('aiSuggestBtn');
const aiSuggestModalOverlay = document.getElementById('aiSuggestModalOverlay');
const reloadAiSuggestBtn = document.getElementById('reloadAiSuggestBtn');
const closeAiSuggestModalBtn = document.getElementById('closeAiSuggestModalBtn');
const aiSuggestStatus = document.getElementById('aiSuggestStatus');
const aiSuggestList = document.getElementById('aiSuggestList');
const applyAiSuggestBtn = document.getElementById('applyAiSuggestBtn');

let lastAiSuggestions = [];

async function fetchAiSuggestions() {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    aiSuggestStatus.textContent = 'Chưa có Gemini API Key — nhập ở góc trên bên phải header trước.';
    aiSuggestList.innerHTML = '';
    return;
  }
  const content = contentInput.value.trim();
  if (!content) {
    aiSuggestStatus.textContent = 'Chưa có nội dung trong ô Nội dung để AI gợi ý.';
    aiSuggestList.innerHTML = '';
    return;
  }

  aiSuggestStatus.textContent = 'Đang tạo gợi ý...';
  aiSuggestList.innerHTML = '';
  reloadAiSuggestBtn.disabled = true;
  try {
    const res = await fetch('/api/ai-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, apiKey }),
    });
    const data = await res.json();
    if (!data.success) {
      aiSuggestStatus.textContent = 'Lỗi: ' + data.error;
      return;
    }
    lastAiSuggestions = data.suggestions;
    aiSuggestStatus.textContent = 'Chọn 1 phiên bản rồi bấm "OK - Áp dụng":';
    aiSuggestList.innerHTML = data.suggestions
      .map(
        (text, idx) => `
        <label class="ai-suggest-item">
          <input type="radio" name="aiSuggestChoice" value="${idx}" />
          <span class="ai-suggest-text">${escapeHtml(text)}</span>
        </label>`
      )
      .join('');
  } catch (err) {
    aiSuggestStatus.textContent = 'Lỗi: ' + err.message;
  } finally {
    reloadAiSuggestBtn.disabled = false;
  }
}

aiSuggestBtn.addEventListener('click', () => {
  aiSuggestModalOverlay.hidden = false;
  fetchAiSuggestions();
});

reloadAiSuggestBtn.addEventListener('click', () => fetchAiSuggestions());

closeAiSuggestModalBtn.addEventListener('click', () => {
  aiSuggestModalOverlay.hidden = true;
});

applyAiSuggestBtn.addEventListener('click', () => {
  const checked = aiSuggestList.querySelector('input[name="aiSuggestChoice"]:checked');
  if (!checked) {
    alert('Hãy chọn 1 nội dung trước.');
    return;
  }
  const text = lastAiSuggestions[Number(checked.value)];
  contentInput.value = text;
  contentInput.dispatchEvent(new Event('input'));
  aiSuggestModalOverlay.hidden = true;
});

// Highlights links and #hashtags by syncing an overlay div behind a
// transparent textarea — the textarea keeps real text/caret/selection.
const contentHighlight = document.getElementById('contentHighlight');

function formatHighlightedText(value) {
  const escaped = escapeHtml(value || ' ');
  const linked = escaped.replace(
    /((?:https?:\/\/|www\.)[^\s<]+)/gi,
    '<span class="rich-token-link">$1</span>'
  );
  const tagged = linked.replace(
    /(^|[\s(])(#([\p{L}\p{N}_]+))/gu,
    '$1<span class="rich-token-tag">$2</span>'
  );
  return tagged.replace(/\n$/g, '\n ');
}

function syncContentHighlight() {
  contentHighlight.innerHTML = formatHighlightedText(contentInput.value);
  contentHighlight.scrollTop = contentInput.scrollTop;
  contentHighlight.scrollLeft = contentInput.scrollLeft;
}

contentInput.addEventListener('input', syncContentHighlight);
contentInput.addEventListener('scroll', () => {
  contentHighlight.scrollTop = contentInput.scrollTop;
  contentHighlight.scrollLeft = contentInput.scrollLeft;
});
syncContentHighlight();

const emojiToggleBtn = document.getElementById('emojiToggleBtn');
const emojiPicker = document.getElementById('emojiPicker');
const emojiPickerHost = document.getElementById('emojiPickerHost');

emojiToggleBtn.addEventListener('click', () => {
  emojiPicker.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (
    !emojiPicker.classList.contains('hidden') &&
    !emojiPicker.contains(e.target) &&
    e.target !== emojiToggleBtn
  ) {
    emojiPicker.classList.add('hidden');
  }
});

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const nextCaret = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(nextCaret, nextCaret);
  textarea.dispatchEvent(new Event('input'));
}

// Loads emoji-mart from a CDN on demand, same approach as meta-page-poster.
async function initEmojiPicker() {
  try {
    const { Picker } = await import('https://cdn.jsdelivr.net/npm/emoji-mart@5.6.0/+esm');
    const picker = new Picker({
      data: async () => {
        const response = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data');
        return response.json();
      },
      theme: 'light',
      previewPosition: 'none',
      skinTonePosition: 'search',
      navPosition: 'top',
      searchPosition: 'sticky',
      onEmojiSelect: (emoji) => {
        insertTextAtCursor(contentInput, emoji?.native || '');
        emojiPicker.classList.add('hidden');
      },
    });
    emojiPickerHost.innerHTML = '';
    emojiPickerHost.appendChild(picker);
  } catch {
    emojiPickerHost.innerHTML =
      '<div class="hint">Không tải được thư viện emoji lúc này. Bạn vẫn có thể dán emoji trực tiếp.</div>';
  }
}

initEmojiPicker();

imagesPickerBtn.addEventListener('click', () => imagesInput.click());

// Kept in our own array (not relying on imagesInput.files) so individual
// images can be removed and reordered — a native FileList can't be edited in place.
let selectedImages = [];
let dragImageIndex = null;

function reorderImages(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const [moved] = selectedImages.splice(fromIndex, 1);
  selectedImages.splice(toIndex, 0, moved);
  renderFilePreview();
  persistSelectedImages().catch((err) => console.error('Không lưu được ảnh:', err));
}

// Images are persisted in IndexedDB (not localStorage) since File/Blob data
// doesn't fit in localStorage's string-only, ~5MB quota.
const IMAGES_DB_NAME = 'post-group';
const IMAGES_STORE = 'selectedImages';

function openImagesDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGES_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IMAGES_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistSelectedImages() {
  const db = await openImagesDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, 'readwrite');
    const store = tx.objectStore(IMAGES_STORE);
    store.clear();
    for (const file of selectedImages) {
      store.add({ name: file.name, type: file.type, blob: file });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function restoreSelectedImages() {
  const db = await openImagesDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, 'readonly');
    const req = tx.objectStore(IMAGES_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  selectedImages = records.map((r) => new File([r.blob], r.name, { type: r.type }));
  renderFilePreview();
}

restoreSelectedImages().catch((err) => console.error('Không khôi phục được ảnh đã lưu:', err));

imagesInput.addEventListener('change', () => {
  selectedImages = [...selectedImages, ...imagesInput.files];
  imagesInput.value = '';
  renderFilePreview();
  persistSelectedImages().catch((err) => console.error('Không lưu được ảnh:', err));
});

clearImagesBtn.addEventListener('click', () => {
  selectedImages = [];
  renderFilePreview();
  persistSelectedImages().catch((err) => console.error('Không lưu được ảnh:', err));
});

function removeImageAt(index) {
  selectedImages.splice(index, 1);
  renderFilePreview();
  persistSelectedImages().catch((err) => console.error('Không lưu được ảnh:', err));
}

function renderFilePreview() {
  filePreview.innerHTML = '';
  imagesPickerStatus.textContent =
    selectedImages.length > 0 ? `Đã chọn ${selectedImages.length} ảnh.` : 'Chưa chọn ảnh nào.';

  for (const [index, file] of selectedImages.entries()) {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = index;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'file-remove-btn';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', () => removeImageAt(index));
    const text = document.createElement('span');
    text.className = 'file-name';
    text.textContent = `${index + 1}. ${file.name} (${formatBytes(file.size)})`;
    li.append(removeBtn, text);
    filePreview.appendChild(li);
  }
  if (!previewModalOverlay.hidden) refreshPreview();
}

filePreview.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li[data-index]');
  if (!li) return;
  dragImageIndex = Number(li.dataset.index);
  li.classList.add('dragging');
});
filePreview.addEventListener('dragend', (e) => {
  e.target.closest('li[data-index]')?.classList.remove('dragging');
});
filePreview.addEventListener('dragover', (e) => {
  if (e.target.closest('li[data-index]')) e.preventDefault();
});
filePreview.addEventListener('drop', (e) => {
  const li = e.target.closest('li[data-index]');
  if (!li || dragImageIndex === null) return;
  e.preventDefault();
  reorderImages(dragImageIndex, Number(li.dataset.index));
  dragImageIndex = null;
});

const previewBtn = document.getElementById('previewBtn');
const previewModalOverlay = document.getElementById('previewModalOverlay');
const previewContent = document.getElementById('previewContent');
const previewGallery = document.getElementById('previewGallery');
const previewGroups = document.getElementById('previewGroups');
const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');

let previewObjectUrls = [];

function revokePreviewUrls() {
  for (const url of previewObjectUrls) URL.revokeObjectURL(url);
  previewObjectUrls = [];
}

// Mimics meta-page-poster's review gallery: first 2 images as a collage,
// the rest in a horizontally scrollable strip, each numbered by post order.
function renderPreviewGallery(files) {
  if (files.length === 0) return '';

  const items = files.map((file) => {
    const url = URL.createObjectURL(file);
    previewObjectUrls.push(url);
    return { file, url };
  });
  const collageItems = items.slice(0, 2);
  const stripItems = items.slice(2);

  const collageHtml = collageItems
    .map(
      ({ file, url }, index) => `
        <div class="preview-item" draggable="true" data-media-index="${index}">
          <span class="preview-badge">${index + 1}</span>
          <button class="preview-remove-btn" type="button" data-remove-image-index="${index}">x</button>
          <img class="preview-thumb" src="${url}" alt="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}">
        </div>
      `
    )
    .join('');

  const stripHtml =
    stripItems.length > 0
      ? `
        <div class="preview-label">Ảnh còn lại. Kéo thả để đổi thứ tự đăng</div>
        <div class="preview-strip">
          ${stripItems
            .map(
              ({ file, url }, index) => `
                <div class="preview-strip-item" draggable="true" data-media-index="${index + 2}">
                  <span class="preview-badge">${index + 3}</span>
                  <button class="preview-remove-btn" type="button" data-remove-image-index="${index + 2}">x</button>
                  <img class="preview-thumb" src="${url}" alt="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}">
                </div>
              `
            )
            .join('')}
        </div>
      `
      : '';

  return `
    <div class="preview-collage${collageItems.length === 1 ? ' single' : ''}">${collageHtml}</div>
    ${stripHtml}
  `;
}

function refreshPreview() {
  const selectedGroupNames = Array.from(document.querySelectorAll('.group-checkbox:checked')).map((c) =>
    c.closest('label').querySelector('.group-name-link').textContent.trim()
  );
  const content = contentInput.value;

  revokePreviewUrls();
  previewContent.innerText = content.trim() || '(Chưa có nội dung)';
  previewGallery.innerHTML = renderPreviewGallery(selectedImages);
  if (selectedGroupNames.length > 0) {
    previewGroups.innerHTML = `
      <div>Sẽ đăng vào ${selectedGroupNames.length} group:</div>
      <ul class="preview-groups-list">
        ${selectedGroupNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}
      </ul>
    `;
  } else {
    previewGroups.textContent = 'Chưa chọn group nào.';
  }
}

previewBtn.addEventListener('click', () => {
  refreshPreview();
  previewModalOverlay.hidden = false;
});

previewGallery.addEventListener('click', (e) => {
  const index = e.target.dataset.removeImageIndex;
  if (index === undefined) return;
  removeImageAt(Number(index));
});

previewGallery.addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-media-index]');
  if (!item) return;
  dragImageIndex = Number(item.dataset.mediaIndex);
  item.classList.add('dragging');
});
previewGallery.addEventListener('dragend', (e) => {
  e.target.closest('[data-media-index]')?.classList.remove('dragging');
});
previewGallery.addEventListener('dragover', (e) => {
  if (e.target.closest('[data-media-index]')) e.preventDefault();
});
previewGallery.addEventListener('drop', (e) => {
  const item = e.target.closest('[data-media-index]');
  if (!item || dragImageIndex === null) return;
  e.preventDefault();
  reorderImages(dragImageIndex, Number(item.dataset.mediaIndex));
  dragImageIndex = null;
});

const previewPostBtn = document.getElementById('previewPostBtn');

closePreviewModalBtn.addEventListener('click', () => {
  contentInput.value = previewContent.innerText;
  contentInput.dispatchEvent(new Event('input'));
  previewModalOverlay.hidden = true;
  revokePreviewUrls();
});

previewPostBtn.addEventListener('click', () => {
  contentInput.value = previewContent.innerText;
  contentInput.dispatchEvent(new Event('input'));
  previewModalOverlay.hidden = true;
  revokePreviewUrls();
  postBtn.click();
});

// Toggle "Đăng SP" — show/hide product URL field
const toggleSpMode = document.getElementById('toggleSpMode');
const spProductField = document.getElementById('spProductField');
const spProductUrl = document.getElementById('spProductUrl');
const fetchProductBtn = document.getElementById('fetchProductBtn');
const fetchProductStatus = document.getElementById('fetchProductStatus');

const toastEl = document.getElementById('toast');
const toastMsgEl = document.getElementById('toastMsg');
let toastTimer = null;
function showToast(msg, type = 'success') {
  toastMsgEl.textContent = msg;
  toastEl.className = `toast toast-${type}`;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

toggleSpMode.addEventListener('change', () => {
  spProductField.hidden = !toggleSpMode.checked;
  if (toggleSpMode.checked) {
    contentInput.value = '';
    contentInput.dispatchEvent(new Event('input'));
    selectedImages = [];
    renderFilePreview();
    persistSelectedImages().catch(console.error);
    spProductUrl.focus();
  }
});

fetchProductBtn.addEventListener('click', async () => {
  const url = spProductUrl.value.trim();
  if (!url) {
    fetchProductStatus.textContent = 'Vui lòng nhập link sản phẩm.';
    return;
  }

  fetchProductBtn.disabled = true;
  fetchProductStatus.textContent = '';

  try {
    const res = await fetch('/api/fetch-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast('Lỗi: ' + data.error, 'error');
      return;
    }

    // Clear content và images trước khi fill mới
    contentInput.value = data.content;
    contentInput.dispatchEvent(new Event('input'));
    selectedImages = [];

    // Load images from server paths into selectedImages
    if (data.imagePaths && data.imagePaths.length > 0) {
      fetchProductStatus.textContent = `Đang tải ${data.imagePaths.length} ảnh...`;
      for (const imgPath of data.imagePaths) {
        try {
          const imgRes = await fetch(imgPath);
          const blob = await imgRes.blob();
          const filename = imgPath.split('/').pop();
          selectedImages.push(new File([blob], filename, { type: blob.type || 'image/jpeg' }));
        } catch (err) {
          console.error('Lỗi load ảnh:', imgPath, err);
        }
      }
      renderFilePreview();
      persistSelectedImages().catch(console.error);
      fetchProductStatus.textContent = '';
      showToast(`Đã lấy xong! Nội dung và ${selectedImages.length} ảnh đã sẵn sàng.`);
    } else {
      renderFilePreview();
      persistSelectedImages().catch(console.error);
      fetchProductStatus.textContent = '';
      showToast('Đã lấy nội dung sản phẩm (không có ảnh).');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  } finally {
    fetchProductBtn.disabled = false;
  }
});

spProductUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchProductBtn.click();
});

postBtn.addEventListener('click', async () => {
  const selectedGroups = Array.from(document.querySelectorAll('.group-checkbox:checked')).map((c) => ({
    url: c.value,
    name: c.closest('label').querySelector('.group-name-link').textContent.trim(),
  }));
  if (selectedGroups.length === 0) {
    alert('Hãy chọn ít nhất 1 group.');
    return;
  }

  const content = contentInput.value;
  if (!content.trim() && selectedImages.length === 0) {
    alert('Cần có nội dung hoặc ít nhất 1 ảnh để đăng.');
    return;
  }

  const formData = new FormData();
  formData.append('groups', JSON.stringify(selectedGroups));
  formData.append('content', content);
  if (toggleSpMode.checked && spProductUrl.value.trim()) {
    formData.append('productLink', spProductUrl.value.trim());
  }
  for (const file of selectedImages) {
    formData.append('images', file);
  }

  postBtn.disabled = true;
  startLogPolling();
  renderPostStatusTable(selectedGroups);
  postProgressDock.classList.add('hidden');
  postModalOverlay.hidden = false;
  startPostStatusPolling();

  try {
    const res = await fetch('/api/post', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) alert(data.error);
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    postBtn.disabled = false;
  }
});
