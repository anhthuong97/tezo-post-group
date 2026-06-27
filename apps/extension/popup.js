const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'tezo_settings';

// ─── Load saved settings ───────────────────────────────────────────────────
chrome.storage.local.get(STORAGE_KEY, (data) => {
  const s = data[STORAGE_KEY] || {};
  if (s.serverUrl) $('serverUrl').value = s.serverUrl;
  if (s.username)  $('username').value  = s.username;
  if (s.username)  $('savedInfo').textContent = `Đã lưu: ${s.username}`;
});

// ─── Save settings on change ───────────────────────────────────────────────
['serverUrl', 'username'].forEach((id) => {
  $(id).addEventListener('change', saveSettings);
});

function saveSettings() {
  const data = {
    serverUrl: $('serverUrl').value.trim().replace(/\/$/, ''),
    username:  $('username').value.trim(),
  };
  chrome.storage.local.set({ [STORAGE_KEY]: data });
}

// ─── Check current tab is Facebook ────────────────────────────────────────
function checkFacebook(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const isFb = url.includes('facebook.com');
    callback(isFb);
  });
}

// ─── Convert Chrome cookie → Playwright format ────────────────────────────
function convertCookie(c) {
  const sameSiteMap = {
    no_restriction: 'None',
    lax:            'Lax',
    strict:         'Strict',
    unspecified:    'None',
  };
  return {
    name:     c.name,
    value:    c.value,
    domain:   c.domain,
    path:     c.path,
    expires:  c.expirationDate ? Math.round(c.expirationDate) : -1,
    httpOnly: c.httpOnly,
    secure:   c.secure,
    sameSite: sameSiteMap[c.sameSite] || 'Lax',
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`;
}

function setLoading(on) {
  const btn = $('btnSend');
  btn.disabled = on;
  btn.textContent = on ? 'Đang gửi...' : 'Gửi session Facebook lên server';
}

// ─── Main: send session ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkFacebook((isFb) => {
    if (!isFb) $('warningNotFb').classList.add('show');
  });
});

$('btnSend').addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim().replace(/\/$/, '');
  const username  = $('username').value.trim();
  const password  = $('password').value;

  if (!serverUrl) { setStatus('Vui lòng nhập URL server.', 'error'); return; }
  if (!username)  { setStatus('Vui lòng nhập tên đăng nhập.', 'error'); return; }
  if (!password)  { setStatus('Vui lòng nhập mật khẩu.', 'error'); return; }

  saveSettings();
  setLoading(true);
  setStatus('Đang đọc cookie Facebook...', 'loading');

  try {
    // Lấy toàn bộ cookie của facebook.com
    const rawCookies = await new Promise((resolve, reject) => {
      chrome.cookies.getAll({ domain: 'facebook.com' }, (cookies) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(cookies);
      });
    });

    if (!rawCookies || rawCookies.length === 0) {
      setStatus('Không tìm thấy cookie Facebook. Hãy đăng nhập Facebook trước.', 'error');
      setLoading(false);
      return;
    }

    const cookies = rawCookies.map(convertCookie);
    setStatus(`Đã đọc ${cookies.length} cookies. Đang gửi lên server...`, 'loading');

    // Gửi lên API
    const res = await fetch(`${serverUrl}/api/post-group/facebook/import-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, cookies }),
    });

    const json = await res.json();

    if (json.success) {
      setStatus(`✓ Thành công! Session của "${json.username}" đã được cập nhật.`, 'success');
    } else {
      setStatus(`Lỗi: ${json.error || 'Không xác định'}`, 'error');
    }
  } catch (err) {
    setStatus(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
});
