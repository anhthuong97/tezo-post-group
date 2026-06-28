const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path   = require('path');
const agent  = require('./agent');
const { getSettings, saveSettings } = require('./store');
const { clearSession, loginFacebook } = require('./facebook');

// Bật CDP để Playwright kết nối vào Chromium của Electron
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');

// Dùng Chrome user agent — tránh Facebook nhận ra Electron và trả về giao diện mobile
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

let tray      = null;
let popup     = null;
let hidden    = null; // window ẩn để giữ Chromium sống
let lastStatus = { connected: false };

// ─── IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('get-settings',  () => getSettings());
ipcMain.handle('get-status',    () => agent.getStatus());
ipcMain.handle('clear-session', () => { clearSession(); });

ipcMain.handle('save-settings', (_, data) => {
  saveSettings(data);
});

ipcMain.handle('start-agent', async () => {
  const s = getSettings();
  if (!s.serverUrl || !s.username || !s.password) return { error: 'Chưa đủ thông tin cài đặt.' };
  agent.start(s, (status) => {
    lastStatus = status;
    updateTrayTooltip(status);
    popup?.webContents.send('status-update', status);
  });
  return { ok: true };
});

ipcMain.handle('stop-agent', () => {
  agent.stop();
});

ipcMain.handle('minimize', () => {
  if (popup && !popup.isDestroyed()) popup.hide();
});

ipcMain.handle('show-browser', () => {
  showBrowser();
});

function showBrowser() {
  if (hidden && !hidden.isDestroyed()) {
    hidden.show();
    hidden.focus();
  }
}

function hideBrowser() {
  if (hidden && !hidden.isDestroyed()) {
    hidden.hide();
  }
}

// Export để agent.js dùng khi xử lý task login_facebook
app.showBrowser = showBrowser;
app.hideBrowser = hideBrowser;

ipcMain.handle('login-facebook', async () => {
  const onLog = (msg) => popup?.webContents.send('log-message', msg);
  const result = await loginFacebook(onLog, showBrowser, hideBrowser);
  if (result.ok) {
    agent.triggerAfterLogin(onLog).catch(() => {});
  }
  return result;
});

// ─── Tray ─────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const s = lastStatus;
  return Menu.buildFromTemplate([
    {
      label: s.connected ? '🟢 Đã kết nối VPS' : '🔴 Chưa kết nối',
      enabled: false,
    },
    s.currentTask
      ? { label: `⚙️ Đang chạy task #${s.currentTask.id}`, enabled: false }
      : { label: 'Chờ task...', enabled: false },
    { type: 'separator' },
    { label: '⚙️ Cài đặt', click: openPopup },
    { type: 'separator' },
    { label: '❌ Thoát', click: () => { agent.stop(); app.quit(); } },
  ]);
}

function updateTrayTooltip(status) {
  if (!tray) return;
  tray.setToolTip(status.connected ? 'TeZo Agent — Đã kết nối' : 'TeZo Agent — Chưa kết nối');
  tray.setContextMenu(buildTrayMenu());
}

function openPopup() {
  if (popup && !popup.isDestroyed()) {
    popup.focus();
    return;
  }
  popup = new BrowserWindow({
    width: 380,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'TeZo Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popup.loadFile(path.join(__dirname, 'ui/popup.html'));
  popup.setMenu(null);
  popup.on('closed', () => { popup = null; });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Window ẩn để giữ CDP / Chromium luôn sẵn sàng
  hidden = new BrowserWindow({ show: false, width: 1200, height: 800, title: 'TeZo Agent Browser' });
  hidden.loadURL('about:blank');

  // Tray icon
  const iconPath = path.join(__dirname, '../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('TeZo Agent');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', openPopup);

  // Auto-start nếu có cài đặt
  const s = getSettings();
  if (s.serverUrl && s.username && s.password && s.autoStart) {
    agent.start(s, (status) => {
      lastStatus = status;
      updateTrayTooltip(status);
      popup?.webContents.send('status-update', status);
    });
  } else {
    openPopup();
  }
});

app.on('window-all-closed', (e) => e.preventDefault()); // giữ app chạy khi đóng popup
app.on('before-quit', () => { agent.stop(); });
