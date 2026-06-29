const { chromium } = require('playwright-core');
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const SESSION_PATH = path.join(app.getPath('userData'), 'fb-session.json');
const CHROME_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const VIEWPORT     = { width: 1280, height: 800 };

let browser = null;

async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  return browser;
}

async function getOrCreateContext() {
  const b        = await ensureBrowser();
  const contexts = b.contexts();
  if (contexts.length > 0) {
    const ctx = contexts[0];
    // Đảm bảo các page hiện có dùng đúng viewport + UA
    for (const page of ctx.pages()) {
      await page.setViewportSize(VIEWPORT).catch(() => {});
      await page.setExtraHTTPHeaders({ 'User-Agent': CHROME_UA }).catch(() => {});
    }
    return ctx;
  }
  const opts = {
    userAgent: CHROME_UA,
    viewport:  VIEWPORT,
    locale:    'vi-VN',
    ...(fs.existsSync(SESSION_PATH) ? { storageState: SESSION_PATH } : {}),
  };
  return b.newContext(opts);
}

function isLoggedOut(url) {
  return ['/login', '/checkpoint', '/two_step_verification', '/recover'].some(p => url.includes(p));
}

async function ensureLoggedIn(onNeedLogin) {
  const ctx  = await getOrCreateContext();
  const pages = ctx.pages();
  const page  = pages.length > 0 ? pages[0] : await ctx.newPage();

  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  if (isLoggedOut(page.url())) {
    onNeedLogin(page);
    await page.waitForFunction(
      () => !window.location.href.includes('/login') && !window.location.href.includes('/checkpoint'),
      { timeout: 5 * 60 * 1000 }
    );
    await ctx.storageState({ path: SESSION_PATH });
  }
  return { ctx, page };
}

async function fetchGroups(onLog) {
  onLog('Đang kết nối browser...');
  let ctx, page;
  try {
    ({ ctx, page } = await ensureLoggedIn(() => onLog('Cần đăng nhập Facebook trước!')));
  } catch (err) {
    return { error: 'Không thể kết nối browser: ' + err.message, groups: [] };
  }

  if (isLoggedOut(page.url())) {
    return { error: 'Chưa đăng nhập Facebook trong TeZo Agent.', groups: [] };
  }

  onLog('Đang tải danh sách nhóm...');
  await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  let prevCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/groups/"]').length);
    if (count === prevCount) break;
    prevCount = count;
  }

  const groups = await page.evaluate(() => {
    const NAV_IDS = ['joins', 'feed', 'discover', 'create'];
    const links   = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
    const seen    = new Map();
    for (const a of links) {
      const href  = a.getAttribute('href');
      const match = href && href.match(/\/groups\/([^/?]+)/);
      if (!match) continue;
      const id = match[1];
      if (NAV_IDS.includes(id)) continue;
      const lines = a.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const name  = lines[0] || '';
      if (!name) continue;
      const meta     = lines.slice(1).join(' • ');
      const existing = seen.get(id);
      if (!existing || lines.length > existing.lineCount) {
        seen.set(id, { id, name, meta, url: `https://www.facebook.com/groups/${id}`, lineCount: lines.length });
      }
    }
    return Array.from(seen.values()).map(({ lineCount, ...g }) => g);
  });

  onLog(`Tìm thấy ${groups.length} nhóm.`);
  return { groups };
}

async function postToGroup(page, groupUrl, content, onLog) {
  try {
    onLog(`Đang mở nhóm: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const composerTrigger = page.getByRole('button', { name: /viết gì|write something/i }).first();
    await composerTrigger.waitFor({ state: 'visible', timeout: 20000 });
    await composerTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    const textbox = page.getByRole('textbox').last();
    await textbox.click();
    await page.keyboard.type(content, { delay: 30 + Math.floor(Math.random() * 40) });
    await page.waitForTimeout(1000);

    const postBtn = page.getByRole('button', { name: /^đăng$|^post$/i }).last();
    await postBtn.waitFor({ state: 'visible', timeout: 15000 });
    await postBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 30000 });
    await page.waitForTimeout(1000);

    onLog(`✓ Đã đăng vào: ${groupUrl}`);
    return { success: true, url: groupUrl };
  } catch (err) {
    onLog(`✗ Lỗi tại ${groupUrl}: ${err.message}`);
    return { success: false, url: groupUrl, error: err.message };
  }
}

async function runPostTask(task, onLog, onNeedLogin) {
  const { groups, content, delayMin = 15, delayMax = 45 } = task.payload;
  const results = [];

  let ctx, page;
  try {
    ({ ctx, page } = await ensureLoggedIn(onNeedLogin));
  } catch (err) {
    return { error: 'Không thể đăng nhập Facebook: ' + err.message, results: [] };
  }

  for (let i = 0; i < groups.length; i++) {
    const g      = groups[i];
    const result = await postToGroup(page, g.url || g, content, onLog);
    results.push(result);

    if (i < groups.length - 1) {
      const delaySec = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
      onLog(`Chờ ${delaySec}s trước nhóm tiếp theo...`);
      await page.waitForTimeout(delaySec * 1000);
    }
  }

  return { results };
}

function clearSession() {
  if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
  browser = null;
}

// Disconnect Playwright khỏi CDP — lần connect tiếp sẽ load session mới
async function resetContext() {
  if (browser) {
    try { browser.disconnect(); } catch {}
    browser = null;
  }
}

// loginFacebook: dùng doLogin (Electron fbWindow) nếu được truyền vào
async function loginFacebook(onLog, onShowBrowser, onHideBrowser, doLogin) {
  if (doLogin) {
    return await doLogin(onLog);
  }
  // Fallback Playwright-based (không khuyến khích)
  onLog('Đang kết nối Facebook...');
  try {
    const ctx   = await getOrCreateContext();
    const pages = ctx.pages();
    const page  = pages.length > 0 ? pages[0] : await ctx.newPage();
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!isLoggedOut(page.url())) {
      onLog('Đã đăng nhập Facebook rồi!');
      return { ok: true, alreadyLoggedIn: true };
    }
    onShowBrowser?.();
    onLog('Vui lòng đăng nhập Facebook trong cửa sổ vừa mở...');
    await page.waitForFunction(
      () => !window.location.href.includes('/login') && !window.location.href.includes('/checkpoint'),
      { timeout: 5 * 60 * 1000 }
    );
    await ctx.storageState({ path: SESSION_PATH });
    onHideBrowser?.();
    onLog('Đăng nhập Facebook thành công!');
    return { ok: true };
  } catch (err) {
    onHideBrowser?.();
    onLog('Lỗi đăng nhập: ' + err.message);
    return { error: err.message };
  }
}

// Helper: điều hướng fbWindow và trả về webContents (không dùng hidden window)
async function navigateFbWin(url, onLog) {
  const { app } = require('electron');
  let win = app.getFbWindow?.();
  if (!win || win.isDestroyed()) {
    win = app.createFbWindow?.();
    if (!win) throw new Error('Browser chưa mở. Hãy click "Hiện Browser" trước.');
  }
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Navigation timeout: ' + url)), 30000);
    win.webContents.once('did-finish-load', () => { clearTimeout(t); resolve(); });
    win.webContents.loadURL(url);
  });
  // Chờ JS chạy xong
  await new Promise(r => setTimeout(r, 2000));
  return win.webContents;
}

// ─── Helpers cho identity switcher (port từ master cũ) ───────────────────────

// Mở avatar dropdown ở góc phải, trả về labels của dialogs đã tồn tại trước khi click
async function openIdentitySwitcher(wc) {
  const existingLabels = await wc.executeJavaScript(
    `Array.from(document.querySelectorAll('[role="dialog"]')).map(function(d){return d.getAttribute('aria-label')||'';})`
  );

  const clicked = await wc.executeJavaScript(`
    (function() {
      var banner = document.querySelector('[role="banner"]');
      if (!banner) return false;
      // Ưu tiên nút có svg image (avatar tròn), lấy cái cuối cùng
      var all = Array.from(banner.querySelectorAll('[aria-haspopup]'));
      var btn = null;
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].querySelector('svg image, img[src]')) { btn = all[i]; break; }
      }
      if (!btn) {
        btn = banner.querySelector('[aria-haspopup="dialog"]');
      }
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);

  if (!clicked) throw new Error('Không tìm thấy nút avatar');

  // Chờ dialog mới xuất hiện
  await new Promise(r => setTimeout(r, 1200));
  return existingLabels;
}

// Đọc tên tư cách hiện tại từ dialog dropdown (port từ getCurrentIdentityName master cũ)
async function getCurrentIdentityName(wc, existingLabels) {
  return wc.executeJavaScript(`
    (function() {
      var before = ${JSON.stringify(existingLabels)};
      var existing = new Set(before);
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
              || dialogs[dialogs.length - 1];
      if (!d) return null;

      // Cách 1: link /me/ trong dialog
      var meLinks = Array.from(d.querySelectorAll('a[href*="/me/"]'));
      for (var i = 0; i < meLinks.length; i++) {
        var a = meLinks[i];
        if (a.closest('[aria-hidden="true"]')) continue;
        var sp = a.querySelector('span[dir="auto"]');
        if (sp && sp.innerText.trim()) return sp.innerText.trim();
      }

      // Cách 2: link profile (loại path hệ thống)
      var bad = /\\/(checkpoint|login|security|settings|help|support|groups|events|pages|watch|marketplace|messages|notifications|privacy|pin)\\b/i;
      var links = Array.from(d.querySelectorAll('a[href]'));
      for (var j = 0; j < links.length; j++) {
        var a2 = links[j];
        if (a2.closest('[aria-hidden="true"]')) continue;
        if (a2.closest('[role="listitem"]')) continue;
        try {
          var u = new URL(a2.href);
          if (!u.hostname.includes('facebook.com')) continue;
          if (u.pathname === '/' || u.pathname === '') continue;
          if (bad.test(u.pathname)) continue;
          var sp2 = a2.querySelector('span[dir="auto"]');
          if (sp2 && sp2.innerText.trim()) return sp2.innerText.trim();
        } catch {}
      }
      return null;
    })()
  `);
}

// ─── getIdentities ─────────────────────────────────────────────────────────

async function getIdentities(onLog) {
  onLog?.('Đang lấy danh sách tư cách...');
  try {
    // Bước 1: Tên cá nhân — /me → h1 (xác nhận chính xác)
    const wcMe = await navigateFbWin('https://www.facebook.com/me', onLog);
    if (isLoggedOut(wcMe.getURL())) { onLog?.('Chưa đăng nhập Facebook.'); return []; }

    let personalName = null;
    for (let attempt = 0; attempt < 20 && !personalName; attempt++) {
      personalName = await wcMe.executeJavaScript(`
        (function() {
          var h1 = document.querySelector('h1');
          if (!h1) return null;
          var t = (h1.innerText || '').replace(/ /g, ' ').trim().split('\\n')[0].trim();
          return (t && t.length >= 2 && t.length < 100) ? t : null;
        })()
      `);
      if (!personalName) await new Promise(r => setTimeout(r, 500));
    }
    onLog?.(`Tên cá nhân: "${personalName}"`);

    const identities = [{ id: 'personal', name: personalName || 'Trang cá nhân', type: 'personal' }];

    // Bước 2: Pages từ pages manager
    try {
      onLog?.('Đang tải danh sách trang...');
      const wcPages = await navigateFbWin(
        'https://www.facebook.com/pages/?category=your_pages&ref=bookmarks', onLog
      );

      // Chờ page cards render (tối đa 10s)
      for (let i = 0; i < 20; i++) {
        const hasCards = await wcPages.executeJavaScript(
          `!!(document.querySelector('[role="main"] a[role="link"]:not([aria-label]) span[dir="auto"]'))`
        );
        if (hasCards) break;
        await new Promise(r => setTimeout(r, 500));
      }

      // Scroll để load thêm pages (tối đa 15 lần)
      for (let i = 0; i < 15; i++) {
        const prevH = await wcPages.executeJavaScript('document.body.scrollHeight');
        await wcPages.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(r => setTimeout(r, 1200));
        const newH = await wcPages.executeJavaScript('document.body.scrollHeight');
        if (newH === prevH) break;
      }

      // Scraping: tên page nằm trong a[role="link"] (không có aria-label) > span[dir="auto"]
      const pages = await wcPages.executeJavaScript(`
        (function() {
          var results = [];
          var seen = new Set();
          var main = document.querySelector('[role="main"]') || document.body;
          var links = Array.from(main.querySelectorAll('a[role="link"]'));
          for (var i = 0; i < links.length; i++) {
            var a = links[i];
            if (a.getAttribute('aria-label')) continue;
            var span = a.querySelector('span[dir="auto"]');
            if (!span) continue;
            var name = span.innerText.trim();
            if (!name || name.length < 2 || seen.has(name)) continue;
            try {
              var u = new URL(a.href);
              if (!u.hostname.includes('facebook.com')) continue;
              var href, cleanUrl;
              if (u.pathname === '/profile.php' && u.searchParams.get('id')) {
                href = '/profile.php?id=' + u.searchParams.get('id');
                cleanUrl = u.origin + href;
              } else if (u.pathname.length > 1 && !u.search) {
                href = u.pathname.replace(/\\/$/, '');
                cleanUrl = u.origin + href;
              } else {
                continue;
              }
              seen.add(name);
              results.push({ cleanUrl: cleanUrl, href: href, name: name });
            } catch {}
          }
          return results;
        })()
      `);

      onLog?.(`Tìm thấy ${pages.length} trang`);
      for (const p of pages) {
        const slug = p.href.replace(/^\//, '').replace(/\/$/, '') || 'page';
        identities.push({ id: 'page_' + slug, name: p.name, type: 'page', href: p.href });
      }
    } catch (e) {
      onLog?.('Lỗi tải trang: ' + e.message);
    }

    return identities;
  } catch (err) {
    onLog?.('Lỗi lấy tư cách: ' + err.message);
    return [{ id: 'personal', name: 'Trang cá nhân', type: 'personal' }];
  }
}

// ─── fetchGroupsForIdentity ─────────────────────────────────────────────────
// Browser đã ở đúng tư cách trước khi gọi hàm này.
// Port từ listGroups master cũ: luôn dùng groups/joins/, scroll 10 lần, innerText cho name+meta

async function fetchGroupsForIdentity(identityId, identityHref, onLog) {
  onLog?.(`Đang tải nhóm...`);
  try {
    const wc = await navigateFbWin('https://www.facebook.com/groups/joins/', onLog);
    await new Promise(r => setTimeout(r, 1500));

    // Scroll đến khi không có item mới (tối đa 10 lần) — giống master cũ
    let prevCount = 0;
    for (let i = 0; i < 10; i++) {
      await wc.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
      await new Promise(r => setTimeout(r, 1500));
      const count = await wc.executeJavaScript(
        `document.querySelectorAll('a[href*="/groups/"]').length`
      );
      if (count === prevCount) break;
      prevCount = count;
    }

    // Scraping — port từ master cũ: dùng innerText (name + meta), map by group id
    const groups = await wc.executeJavaScript(`
      (function() {
        var NAV_IDS = {joins:1, feed:1, discover:1, create:1};
        var links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        var seen = new Map();
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          var href = a.getAttribute('href') || '';
          var m = href.match(/\\/groups\\/([^\\/?#]+)/);
          if (!m) continue;
          var id = m[1];
          if (NAV_IDS[id]) continue;
          var lines = (a.innerText || '').split('\\n').map(function(s){return s.trim();}).filter(Boolean);
          var name = lines[0] || '';
          if (!name) continue;
          var meta = lines.slice(1).join(' • ');
          var existing = seen.get(id);
          if (!existing || lines.length > existing.lineCount) {
            seen.set(id, {
              id: id,
              name: name,
              meta: meta,
              url: 'https://www.facebook.com/groups/' + id,
              lineCount: lines.length,
            });
          }
        }
        return Array.from(seen.values()).map(function(g){
          return { id: g.id, name: g.name, meta: g.meta, url: g.url };
        });
      })()
    `);

    onLog?.(`Tìm thấy ${groups.length} nhóm.`);
    return { groups, error: null };
  } catch (err) {
    onLog?.('Lỗi tải nhóm: ' + err.message);
    return { error: err.message, groups: [] };
  }
}

// ─── switchToPersonal ───────────────────────────────────────────────────────
// Port từ switchToPersonal master cũ:
// Mở dropdown → kiểm tra nếu đã personal thì thoát sớm → click listitem đầu tiên có avatar

async function switchToPersonal(personalName, currentIdentityId, onLog) {
  const wc = await navigateFbWin('https://www.facebook.com/', onLog);
  await new Promise(r => setTimeout(r, 1500));

  let existingLabels;
  try {
    existingLabels = await openIdentitySwitcher(wc);
  } catch (e) {
    onLog?.('Không mở được dropdown avatar: ' + e.message);
    return false;
  }

  // Nếu đã ở tư cách cá nhân → đóng dropdown và return
  if (currentIdentityId === 'personal') {
    onLog?.('Đã ở tư cách cá nhân.');
    await wc.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    );
    return true;
  }

  // Click listitem đầu tiên có avatar (svg image / img) — port từ master cũ
  const clicked = await wc.executeJavaScript(`
    (function() {
      var before = ${JSON.stringify(existingLabels)};
      var existing = new Set(before);
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
              || dialogs[dialogs.length - 1];
      if (!d) return false;
      var items = Array.from(d.querySelectorAll('[role="listitem"]'));
      for (var i = 0; i < items.length; i++) {
        if (!items[i].querySelector('svg image, img[src]')) continue;
        var el = items[i].querySelector('a, [role="button"]');
        if (el) { el.click(); return true; }
      }
      return false;
    })()
  `);

  if (clicked) {
    onLog?.('Đang chuyển về tư cách cá nhân...');
    await new Promise(r => setTimeout(r, 3000));
  }
  return clicked;
}

// ─── switchIdentityOnBrowser ────────────────────────────────────────────────
// Port từ doSwitch master cũ:
// Về cá nhân trước → navigate page URL → tìm "Chuyển ngay" → confirm dialog

async function switchIdentityOnBrowser(identityId, identityName, identityHref, personalName, currentIdentityId, onLog) {
  if (identityId === 'personal') {
    return await switchToPersonal(personalName, currentIdentityId, onLog)
      ? { ok: true }
      : { error: 'Không thể chuyển về tư cách cá nhân' };
  }

  // 1. Về cá nhân trước nếu chưa ở đó
  if (currentIdentityId !== 'personal') {
    onLog?.('Chuyển về tư cách cá nhân trước...');
    await switchToPersonal(personalName, currentIdentityId, onLog);
  }

  // 2. Navigate vào trang page
  const cleanHref = (identityHref || '').startsWith('/') ? identityHref : '/' + identityHref;
  const pageUrl   = `https://www.facebook.com${cleanHref}`;
  onLog?.(`Mở trang: ${pageUrl}`);
  const wc = await navigateFbWin(pageUrl, onLog);
  await new Promise(r => setTimeout(r, 2000));

  // 3. Ghi nhận dialogs trước khi click
  const dialogsBefore = await wc.executeJavaScript(
    `Array.from(document.querySelectorAll('[role="dialog"]')).map(function(d){return d.getAttribute('aria-label')||'';})`
  );

  // 4. Tìm nút "Chuyển ngay" trong [role="main"]
  // Card đặc trưng: [data-visualcompletion="css-img"] + span[dir="auto"] trong ancestor ≤5 cấp
  const clicked = await wc.executeJavaScript(`
    (function() {
      var main = document.querySelector('[role="main"]');
      if (!main) return false;
      var buttons = Array.from(main.querySelectorAll('[role="button"]'));
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (!btn.innerText || !btn.innerText.trim()) continue;
        var el = btn;
        var found = false;
        for (var j = 0; j < 5; j++) {
          el = el.parentElement;
          if (!el || el === document.body) break;
          if (el.querySelector('[data-visualcompletion="css-img"]') && el.querySelector('span[dir="auto"]')) {
            found = true; break;
          }
        }
        if (!found) continue;
        btn.click();
        return true;
      }
      return false;
    })()
  `);

  if (!clicked) {
    onLog?.('Không tìm thấy nút "Chuyển ngay".');
    return { error: 'Không tìm thấy nút chuyển tư cách' };
  }

  onLog?.('Đang xác nhận chuyển tư cách...');
  await new Promise(r => setTimeout(r, 1500));

  // 5. Click nút confirm trong modal mới
  await wc.executeJavaScript(`
    (function() {
      var before = ${JSON.stringify(dialogsBefore)};
      var beforeSet = new Set(before);
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      var modal = dialogs.find(function(d){ return !beforeSet.has(d.getAttribute('aria-label')||''); })
                  || dialogs[dialogs.length - 1];
      if (!modal) return false;
      var btns = Array.from(modal.querySelectorAll('[role="button"]'));
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].innerText && btns[i].innerText.trim()) { btns[i].click(); return true; }
      }
      return false;
    })()
  `);

  await new Promise(r => setTimeout(r, 4000));
  onLog?.(`Đã chuyển sang: ${identityName}`);

  // Về trang chủ sau khi chuyển (giống master cũ)
  navigateFbWin('https://www.facebook.com/', onLog).catch(() => {});

  return { ok: true };
}

module.exports = {
  ensureLoggedIn, fetchGroups, fetchGroupsForIdentity, getIdentities,
  runPostTask, clearSession, resetContext, loginFacebook, SESSION_PATH,
  switchToPersonal, switchIdentityOnBrowser,
};
