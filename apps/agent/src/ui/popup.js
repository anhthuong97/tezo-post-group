const $ = (id) => document.getElementById(id);

const dot         = $('dot');
const statusText  = $('statusText');
const logBox      = $('logBox');
const taskInfo    = $('taskInfo');
const errorMsg    = $('errorMsg');
const btnConnect  = $('btnConnect');
const btnDisc     = $('btnDisconnect');

function addLog(msg) {
  logBox.textContent += '\n' + msg;
  logBox.scrollTop = logBox.scrollHeight;
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

  if (s.needLogin) {
    addLog('⚠️ Cần đăng nhập Facebook — cửa sổ Chrome đã mở, hãy đăng nhập!');
  }
}

// ─── Load settings ────────────────────────────────────────────────────────
window.tezo.getSettings().then((s) => {
  if (s.serverUrl) $('serverUrl').value = s.serverUrl;
  if (s.username)  $('username').value  = s.username;
});

window.tezo.getStatus().then(applyStatus);

// ─── Live status từ main process ──────────────────────────────────────────
window.tezo.onStatus(applyStatus);

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

$('btnClearSession').addEventListener('click', async () => {
  await window.tezo.clearSession();
  addLog('Đã xóa session Facebook. Lần sau sẽ cần đăng nhập lại.');
});

$('btnMinimize').addEventListener('click', () => {
  window.tezo.minimize();
});
