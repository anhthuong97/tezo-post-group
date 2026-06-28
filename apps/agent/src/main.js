const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session } = require('electron');
const path   = require('path');
const fs     = require('fs');
const agent  = require('./agent');
const { getSettings, saveSettings } = require('./store');
const { clearSession, SESSION_PATH, resetContext } = require('./facebook');

// Bật CDP để Playwright kết nối vào Chromium của Electron
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');

// Chrome user agent — tránh Facebook nhận ra Electron
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

let tray     = null;
let popup    = null;
let hidden   = null; // window ẩn giữ CDP/Chromium — KHÔNG bao giờ show
let fbWindow = null; // window riêng, full-size, cho user tương tác Facebook

// ─── Facebook window ───────────────────────────────────────────────────────

function createFbWindow() {
  if (fbWindow && !fbWindow.isDestroyed()) {
    fbWindow.show();
    fbWindow.focus();
    return fbWindow;
  }
  fbWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    title: 'Facebook — TeZo Agent',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  fbWindow.maximize();
  fbWindow.loadURL('https://www.facebook.com');
  fbWindow.on('closed', () => { fbWindow = null; });
  return fbWindow;
}

function showBrowser() {
  createFbWindow();
}

function hideBrowser() {
  // Không ẩn fbWindow — user có thể đang tương tác
}

// Đăng nhập Facebook qua fbWindow full-size, detect xong thì lưu cookies
async function doLogin(onLog) {
  return new Promise((resolve) => {
    const win = createFbWindow();
    win.show();
    win.focus();

    let resolved = false;

    const finish = async (result) => {
      if (resolved) return;
      resolved = true;
      win.webContents.removeAllListeners('did-navigate');
      win.webContents.removeAllListeners('did-navigate-in-page');

      if (result.ok) {
        try {
          const cookies = await session.defaultSession.cookies.get({ domain: '.facebook.com' });
          const state = {
            cookies: cookies.map(c => ({
              name:     c.name,
              value:    c.value,
              domain:   c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
              path:     c.path || '/',
              expires:  c.expirationDate ?? -1,
              httpOnly: c.httpOnly || false,
              secure:   c.secure || false,
              sameSite: c.sameSite === 'strict' ? 'Strict'
                      : c.sameSite === 'lax'    ? 'Lax' : 'None',
            })),
            origins: [],
          };
          fs.writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));
          onLog?.('Đã lưu phiên đăng nhập.');
        } catch (e) {
          onLog?.('Lưu session thất bại: ' + e.message);
        }
        // Reset Playwright context để load session mới
        await resetContext();
      }
      resolve(result);
    };

    const isLoggedIn = (url) => {
      if (!url || !url.includes('facebook.com')) return false;
      try {
        const { pathname } = new URL(url);
        return !pathname.startsWith('/login')
            && !pathname.startsWith('/checkpoint')
            && !pathname.startsWith('/r.php');
      } catch { return false; }
    };

    const checkNow = () => {
      const url = win.webContents.getURL();
      if (isLoggedIn(url)) {
        onLog?.('Đã đăng nhập Facebook rồi!');
        finish({ ok: true, alreadyLoggedIn: true });
        return true;
      }
      return false;
    };

    if (!checkNow()) {
      onLog?.('Vui lòng đăng nhập Facebook trong cửa sổ vừa mở...');
      win.webContents.on('did-navigate', (_, url) => {
        if (isLoggedIn(url)) {
          onLog?.('Đăng nhập thành công!');
          setTimeout(() => finish({ ok: true }), 1200);
        }
      });
      win.webContents.on('did-navigate-in-page', (_, url) => {
        if (isLoggedIn(url)) setTimeout(() => finish({ ok: true }), 1200);
      });
    }

    setTimeout(() => finish({ error: 'Timeout 5 phút — chưa đăng nhập' }), 5 * 60 * 1000);
  });
}

app.showBrowser   = showBrowser;
app.hideBrowser   = hideBrowser;
app.doLogin       = doLogin;
app.getFbWindow   = () => (fbWindow && !fbWindow.isDestroyed() ? fbWindow : null);
app.createFbWindow = createFbWindow;

// ─── IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => getSettings());
ipcMain.handle('get-status',   () => agent.getStatus());

ipcMain.handle('save-settings', (_, data) => {
  saveSettings(data);
});

ipcMain.handle('start-agent', async () => {
  const s = getSettings();
  if (!s.serverUrl || !s.username || !s.password) return { error: 'Chưa đủ thông tin cài đặt.' };
  agent.start(s, (status) => {
    updateTrayTooltip(status);
    popup?.webContents.send('status-update', status);
  });
  return { ok: true };
});

ipcMain.handle('stop-agent', () => agent.stop());

ipcMain.handle('minimize', () => {
  if (popup && !popup.isDestroyed()) popup.hide();
});

// ─── Tray ─────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const s = agent.getStatus();
  return Menu.buildFromTemplate([
    { label: s.connected ? '🟢 Đã kết nối VPS' : '🔴 Chưa kết nối', enabled: false },
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
    popup.show();
    popup.focus();
    return;
  }
  popup = new BrowserWindow({
    width: 380,
    height: 400,
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
  // Hidden window: giữ Chromium/CDP sống — user KHÔNG bao giờ thấy
  hidden = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    title: '_tezo_hidden',
    webPreferences: { nodeIntegration: false, contextIsolation: false },
  });
  hidden.loadURL('about:blank');

  const iconPath = path.join(__dirname, '../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('TeZo Agent');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', openPopup);

  const s = getSettings();
  if (s.serverUrl && s.username && s.password && s.autoStart) {
    agent.start(s, (status) => {
      updateTrayTooltip(status);
      popup?.webContents.send('status-update', status);
    });
  } else {
    openPopup();
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { agent.stop(); });
