const $ = (id) => document.getElementById(id);

const dot        = $('dot');
const statusText = $('statusText');
const errorMsg   = $('errorMsg');
const taskBar    = $('taskBar');
const btnConnect = $('btnConnect');
const btnDisc    = $('btnDisconnect');

function applyStatus(s) {
  if (s.connected) {
    document.body.classList.add('connected');
    dot.className        = s.currentTask ? 'dot yellow' : 'dot green';
    statusText.textContent = s.currentTask ? 'Đang thực hiện task...' : 'Đã kết nối VPS';
  } else {
    document.body.classList.remove('connected');
    dot.className        = s.error ? 'dot red' : 'dot';
    statusText.textContent = s.error || 'Chưa kết nối';
    if (s.error) errorMsg.textContent = s.error;
  }

  if (s.currentTask) {
    taskBar.className   = 'task-bar show';
    taskBar.textContent = `⚙️ Task #${s.currentTask.id}: ${s.currentTask.lastLog || s.currentTask.type}`;
  } else {
    taskBar.className = 'task-bar';
  }
}

// Load saved settings vào form
window.tezo.getSettings().then((s) => {
  if (s.serverUrl) {
    $('serverUrl').value   = s.serverUrl;
    $('serverUrlRO').value = s.serverUrl;
  }
  if (s.username) {
    $('username').value   = s.username;
    $('usernameRO').value = s.username;
  }
});

window.tezo.getStatus().then(applyStatus);
window.tezo.onStatus(applyStatus);
// Log chỉ hiện trên web UI — không xử lý ở đây

btnConnect.addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim();
  const username  = $('username').value.trim();
  const password  = $('password').value;

  if (!serverUrl || !username || !password) {
    errorMsg.textContent = 'Vui lòng điền đủ thông tin.';
    return;
  }
  errorMsg.textContent = '';
  dot.className        = 'dot yellow';
  statusText.textContent = 'Đang kết nối...';
  btnConnect.disabled  = true;

  await window.tezo.saveSettings({ serverUrl, username, password, autoStart: true });
  const res = await window.tezo.startAgent();
  btnConnect.disabled = false;

  if (res?.error) {
    errorMsg.textContent = res.error;
  } else {
    // Cập nhật readonly fields với giá trị vừa nhập
    $('serverUrlRO').value = serverUrl;
    $('usernameRO').value  = username;
  }
});

btnDisc.addEventListener('click', async () => {
  await window.tezo.stopAgent();
  applyStatus({ connected: false, error: null });
});

$('btnMinimize').addEventListener('click', () => {
  window.tezo.minimize();
});
