const $ = (id) => document.getElementById(id);

const dot           = $('dot');
const statusText    = $('statusText');
const errorMsg      = $('errorMsg');
const taskBar       = $('taskBar');
const btnConnect    = $('btnConnect');
const btnDisc       = $('btnDisconnect');
const browserDot    = $('browserDot');
const browserStatus = $('browserStatus');
const btnOpen       = $('btnOpenBrowser');
const btnClose      = $('btnCloseBrowser');

function applyStatus(s) {
  if (s.connected) {
    document.body.classList.add('connected');
    dot.className      = s.currentTask ? 'dot yellow' : 'dot green';
    statusText.textContent = s.currentTask ? 'Đang thực hiện task...' : 'Đã kết nối VPS';
  } else {
    document.body.classList.remove('connected');
    dot.className      = s.error ? 'dot red' : 'dot';
    statusText.textContent = s.error || 'Chưa kết nối';
    if (s.error) errorMsg.textContent = s.error;
  }

  if (s.currentTask) {
    taskBar.className   = 'task-bar show';
    taskBar.textContent = `⚙️ Task #${s.currentTask.id}: ${s.currentTask.lastLog || s.currentTask.type}`;
  } else {
    taskBar.className = 'task-bar';
  }

  if (typeof s.browserOpen === 'boolean') applyBrowserStatus(s.browserOpen);
}

function applyBrowserStatus(open) {
  if (open) {
    browserDot.className      = 'dot green';
    browserStatus.textContent = 'Đã mở';
    btnOpen.style.display     = 'none';
    btnClose.style.display    = '';
  } else {
    browserDot.className      = 'dot';
    browserStatus.textContent = 'Chưa mở';
    btnOpen.style.display     = '';
    btnClose.style.display    = 'none';
  }
}

// Init browser status hidden state
btnClose.style.display = 'none';

// Load saved settings
window.tezo.getSettings().then((s) => {
  if (s.serverUrl) { $('serverUrl').value = s.serverUrl; $('serverUrlRO').value = s.serverUrl; }
  if (s.username)  { $('username').value  = s.username;  $('usernameRO').value  = s.username; }
});

window.tezo.getStatus().then(applyStatus);
window.tezo.getBrowserStatus().then(({ open }) => applyBrowserStatus(open));

window.tezo.onStatus(applyStatus);
window.tezo.onBrowserStatus(({ open }) => applyBrowserStatus(open));

btnConnect.addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim();
  const username  = $('username').value.trim();
  const password  = $('password').value;

  if (!serverUrl || !username || !password) {
    errorMsg.textContent = 'Vui lòng điền đủ thông tin.';
    return;
  }
  errorMsg.textContent   = '';
  dot.className          = 'dot yellow';
  statusText.textContent = 'Đang kết nối...';
  btnConnect.disabled    = true;

  await window.tezo.saveSettings({ serverUrl, username, password, autoStart: true });
  const res = await window.tezo.startAgent();
  btnConnect.disabled = false;

  if (res?.error) {
    errorMsg.textContent = res.error;
  } else {
    $('serverUrlRO').value = serverUrl;
    $('usernameRO').value  = username;
  }
});

btnDisc.addEventListener('click', async () => {
  await window.tezo.stopAgent();
  applyStatus({ connected: false, error: null });
});

btnOpen.addEventListener('click', () => window.tezo.openBrowser());
btnClose.addEventListener('click', () => window.tezo.closeBrowser());

$('btnMinimize').addEventListener('click', () => window.tezo.minimize());
