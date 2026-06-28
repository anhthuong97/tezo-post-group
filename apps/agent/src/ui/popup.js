const $ = (id) => document.getElementById(id);

const dot          = $('dot');
const statusText   = $('statusText');
const logBox       = $('logBox');
const taskInfo     = $('taskInfo');
const errorMsg     = $('errorMsg');
const btnConnect   = $('btnConnect');
const btnDisc      = $('btnDisconnect');
const fbDot        = $('fbDot');
const fbStatusText = $('fbStatusText');

function addLog(msg) {
  logBox.textContent += '\n' + msg;
  logBox.scrollTop = logBox.scrollHeight;
}

function setFbStatus(loggedIn) {
  if (loggedIn) {
    fbDot.className = 'dot-sm ok';
    fbStatusText.textContent = 'Đã đăng nhập Facebook';
    $('btnLoginFb').textContent = 'Đăng nhập lại';
  } else {
    fbDot.className = 'dot-sm no';
    fbStatusText.textContent = 'Chưa đăng nhập';
    $('btnLoginFb').textContent = 'Đăng nhập Facebook';
  }
}

function applyStatus(s) {
  if (s.connected) {
    dot.className = 'dot green';
    statusText.textContent = 'Đã kết nối VPS';
    btnConnect.style.display = 'none';
    btnDisc.style.display    = '';
    errorMsg.textContent     = '';
  } else {
    dot.className = 'dot red';
    statusText.textContent = s.error || 'Chưa kết nối';
    btnConnect.style.display = '';
    btnDisc.style.display    = 'none';
    if (s.error) errorMsg.textContent = s.error;
  }

  if (s.currentTask) {
    dot.className = 'dot yellow';
    taskInfo.className = 'task-info show';
    taskInfo.textContent = `⚙️ Đang chạy task #${s.currentTask.id}: ${s.currentTask.lastLog || '...'}`;
    if (s.currentTask.lastLog) addLog(s.currentTask.lastLog);
  } else {
    taskInfo.className = 'task-info';
  }

  if (s.fbLoggedIn !== undefined) setFbStatus(s.fbLoggedIn);

  if (s.needLogin) {
    setFbStatus(false);
    addLog('⚠️ Cần đăng nhập Facebook — nhấn nút "Đăng nhập Facebook" bên dưới!');
  }
}

// ─── Load settings ────────────────────────────────────────────────────────
window.tezo.getSettings().then((s) => {
  if (s.serverUrl) $('serverUrl').value = s.serverUrl;
  if (s.username)  $('username').value  = s.username;
});

window.tezo.getStatus().then(applyStatus);

// ─── Live updates từ main process ─────────────────────────────────────────
window.tezo.onStatus(applyStatus);
window.tezo.onLog((msg) => addLog(msg));

// ─── Buttons ──────────────────────────────────────────────────────────────
btnConnect.addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim();
  const username  = $('username').value.trim();
  const password  = $('password').value;

  if (!serverUrl || !username || !password) {
    errorMsg.textContent = 'Vui lòng điền đủ thông tin.';
    return;
  }
  errorMsg.textContent = '';
  dot.className = 'dot yellow';
  statusText.textContent = 'Đang kết nối...';
  btnConnect.disabled = true;

  await window.tezo.saveSettings({ serverUrl, username, password, autoStart: true });
  const res = await window.tezo.startAgent();
  btnConnect.disabled = false;
  if (res?.error) errorMsg.textContent = res.error;
});

btnDisc.addEventListener('click', async () => {
  await window.tezo.stopAgent();
  applyStatus({ connected: false, error: null });
  addLog('Đã ngắt kết nối.');
});

$('btnLoginFb').addEventListener('click', async () => {
  const btn = $('btnLoginFb');
  btn.disabled = true;
  fbDot.className = 'dot-sm yellow';
  fbStatusText.textContent = 'Đang mở trình duyệt...';

  const res = await window.tezo.loginFacebook();
  btn.disabled = false;
  if (res?.ok) {
    setFbStatus(true);
  } else {
    fbDot.className = 'dot-sm no';
    fbStatusText.textContent = res?.error || 'Lỗi đăng nhập';
    btn.textContent = 'Đăng nhập Facebook';
  }
});

$('btnClearSession').addEventListener('click', async () => {
  await window.tezo.clearSession();
  setFbStatus(false);
  addLog('Đã xóa session Facebook. Vui lòng đăng nhập lại.');
});

$('btnMinimize').addEventListener('click', () => {
  window.tezo.minimize();
});
