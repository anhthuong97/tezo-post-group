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

async function getIdentities(onLog) {
  onLog?.('Đang lấy danh sách tư cách...');
  try {
    // Bước 1: Tên cá nhân — navigate /me → redirect → h1 (đã xác nhận chính xác 100%)
    const wcMe = await navigateFbWin('https://www.facebook.com/me', onLog);
    if (isLoggedOut(wcMe.getURL())) {
      onLog?.('Chưa đăng nhập Facebook.');
      return [];
    }

    const personalName = await wcMe.executeJavaScript(`
      (function() {
        var h1 = document.querySelector('h1');
        if (h1) { var t = h1.textContent.trim(); if (t.length > 0 && t.length < 100) return t; }
        return null;
      })()
    `);

    const identities = [{
      id:   'personal',
      name: personalName || 'Trang cá nhân',
      type: 'personal',
    }];
    onLog?.(`Tên cá nhân: "${personalName || '?'}"`);

    // Bước 2: Pages — tất cả page ở trang quản lý (tư cách cá nhân sẽ không xuất hiện ở đây)
    onLog?.('Đang lấy danh sách trang...');
    try {
      const wcPages = await navigateFbWin(
        'https://www.facebook.com/pages/?category=your_pages&ref=bookmarks', onLog
      );

      // Scroll để load hết
      for (let i = 0; i < 5; i++) {
        await wcPages.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(r => setTimeout(r, 1200));
      }

      const fbPages = await wcPages.executeJavaScript(`
        (function() {
          var results = [];
          var seen = {};
          var main = document.querySelector('[role="main"]') || document.body;

          // Whitelist approach: only single-segment paths that aren't system routes
          var SYSTEM = {
            events:1,groups:1,watch:1,marketplace:1,login:1,checkpoint:1,settings:1,
            help:1,messages:1,notifications:1,privacy:1,reels:1,gaming:1,fundraisers:1,
            offers:1,jobs:1,ads:1,search:1,friends:1,discover:1,explore:1,create:1,
            bookmarks:1,pages:1,me:1,home:1,about:1,account:1,recovery:1,security:1,
            stories:1,saved:1,feeds:1,professional_dashboard:1,adsmanager:1,business:1,
            monetization:1,inbox:1,video:1,videos:1,photos:1,live:1,campus:1,news:1,
            trending:1,reel:1,following:1,followers:1,interests:1,marketplace:1
          };

          var links = main.querySelectorAll('a[href]');
          for (var i = 0; i < links.length; i++) {
            var a = links[i];
            if (a.getAttribute('aria-label')) continue; // nav action buttons
            try {
              var u = new URL(a.href);
              if (!u.hostname.includes('facebook.com')) continue;

              var span = a.querySelector('span[dir="auto"]');
              var name = span && span.innerText.trim();
              if (!name || name.length < 2 || seen[name]) continue;

              // profile.php?id= case
              if (u.pathname === '/profile.php') {
                var pid = u.searchParams.get('id');
                if (!pid) continue;
                seen[name] = 1;
                results.push({ id: 'page_profile_' + pid, name: name, href: '/profile.php?id=' + pid, type: 'page' });
                continue;
              }

              // Skip links with query params
              if (u.search) continue;

              // Must be single-segment path: /PageSlug
              var parts = u.pathname.split('/').filter(Boolean);
              if (parts.length !== 1) continue;
              var slug = parts[0];
              if (slug.length < 3) continue;
              if (SYSTEM[slug.toLowerCase()]) continue;

              seen[name] = 1;
              results.push({ id: 'page_' + slug, name: name, href: '/' + slug, type: 'page' });
            } catch {}
          }
          return results;
        })()
      `);

      const existingNames = new Set(identities.map(i => i.name.toLowerCase()));
      const unique = fbPages.filter(p => !existingNames.has(p.name.toLowerCase()));
      identities.push(...unique);
      onLog?.(`Tìm thấy ${unique.length} Page`);
    } catch (e) {
      onLog?.('Không lấy được Page: ' + e.message);
    }

    return identities;
  } catch (err) {
    onLog?.('Lỗi lấy tư cách: ' + err.message);
    return [{ id: 'personal', name: 'Trang cá nhân', type: 'personal' }];
  }
}

// Fetch nhóm cho một tư cách — dùng fbWindow trực tiếp, không cần Playwright hidden window
async function fetchGroupsForIdentity(identityId, identityHref, onLog) {
  onLog(`Đang tải nhóm cho "${identityId}"...`);
  try {
    let groupsUrl = 'https://www.facebook.com/groups/joins/';

    if (identityId !== 'personal' && identityHref) {
      const cleanHref = identityHref.startsWith('/') ? identityHref : '/' + identityHref;
      groupsUrl = `https://www.facebook.com${cleanHref}/groups`;
    }

    const wc = await navigateFbWin(groupsUrl, onLog);

    // Nếu page groups không có gì (không phải page thật), fallback
    const initialCount = await wc.executeJavaScript(
      'document.querySelectorAll(\'a[href*="/groups/"]\').length'
    );
    if (identityId !== 'personal' && initialCount < 3) {
      onLog('Page không có nhóm riêng, dùng nhóm cá nhân...');
      await navigateFbWin('https://www.facebook.com/groups/joins/', onLog);
    }

    // Scroll để load hết
    let prevCount = 0;
    for (let i = 0; i < 8; i++) {
      await wc.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
      await new Promise(r => setTimeout(r, 1500));
      const count = await wc.executeJavaScript(
        'document.querySelectorAll(\'a[href*="/groups/"]\').length'
      );
      if (count === prevCount) break;
      prevCount = count;
    }

    const groups = await wc.executeJavaScript(`
      (function() {
        var NAV = {joins:1, feed:1, discover:1, create:1};
        var links = document.querySelectorAll('a[href*="/groups/"]');
        var seen = {};
        var results = [];
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          var href = a.getAttribute('href') || '';
          var m = href.match(/\\/groups\\/([^\\/?#]+)/);
          if (!m) continue;
          var gid = m[1];
          if (NAV[gid] || seen[gid]) continue;
          var nameEl = a.querySelector('span') || a;
          var name = (nameEl.textContent || '').trim();
          if (!name || name.length < 2) continue;
          var url = href.startsWith('http') ? href : 'https://www.facebook.com' + href;
          seen[gid] = 1;
          results.push({ id: gid, name: name, url: url });
        }
        return results;
      })()
    `);

    onLog(`Tìm thấy ${groups.length} nhóm.`);
    return { groups, error: null };
  } catch (err) {
    onLog('Lỗi tải nhóm: ' + err.message);
    return { error: err.message, groups: [] };
  }
}

// Chuyển về tư cách cá nhân qua avatar dropdown
// Tìm item theo tên cá nhân — vị trí có thể là 1st (đang ở cá nhân) hoặc 2nd (đang ở page)
async function switchToPersonal(personalName, onLog) {
  const wc = await navigateFbWin('https://www.facebook.com/', onLog);
  await new Promise(r => setTimeout(r, 1500));

  // Click avatar button in banner
  await wc.executeJavaScript(`
    (function() {
      var banner = document.querySelector('[role="banner"]');
      if (!banner) return false;
      var candidates = Array.from(banner.querySelectorAll('[aria-haspopup]'));
      for (var i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].querySelector('svg image, img[src]')) {
          candidates[i].click(); return true;
        }
      }
      return false;
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));

  // Tìm listitem theo tên cá nhân, fallback theo thứ tự:
  // - Đang ở cá nhân: personal ở vị trí 1 → click vị trí 1
  // - Đang ở page: personal ở vị trí 2 → click vị trí 2
  const clicked = await wc.executeJavaScript(`
    (function() {
      var targetName = ${JSON.stringify(personalName || '')};
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      if (!dialogs.length) return false;
      var d = dialogs[dialogs.length - 1];
      var items = Array.from(d.querySelectorAll('[role="listitem"]'))
        .filter(function(item) { return !!item.querySelector('svg image, img[src]'); });
      if (!items.length) return false;

      // Ưu tiên: tìm theo tên
      if (targetName) {
        for (var i = 0; i < items.length; i++) {
          if ((items[i].innerText || '').includes(targetName)) {
            var el = items[i].querySelector('a, [role="button"]');
            if (el) { el.click(); return true; }
          }
        }
      }

      // Fallback: vị trí 2 (đang ở page → personal là item thứ 2)
      // nếu chỉ có 1 item thì click item đó
      var idx = items.length >= 2 ? 1 : 0;
      var el2 = items[idx].querySelector('a, [role="button"]');
      if (el2) { el2.click(); return true; }
      return false;
    })()
  `);

  if (clicked) {
    onLog?.('Đang chuyển về tư cách cá nhân...');
    await new Promise(r => setTimeout(r, 3000));
  }
  return clicked;
}

// Chuyển sang tư cách page: về cá nhân trước → vào trang page → click "Chuyển ngay"
// personalName cần thiết để tìm đúng item trong dropdown
async function switchIdentityOnBrowser(identityId, identityName, identityHref, personalName, onLog) {
  if (identityId === 'personal') {
    onLog?.('Đang chuyển về tư cách cá nhân...');
    await switchToPersonal(personalName, onLog);
    return { ok: true };
  }

  // 1. Về tư cách cá nhân trước
  onLog?.('Chuyển về tư cách cá nhân trước...');
  await switchToPersonal(personalName, onLog);

  // 2. Mở trang page
  const cleanHref = (identityHref || '').startsWith('/') ? identityHref : '/' + identityHref;
  const pageUrl   = `https://www.facebook.com${cleanHref}`;
  onLog?.(`Mở trang: ${pageUrl}`);
  const wc = await navigateFbWin(pageUrl, onLog);
  await new Promise(r => setTimeout(r, 2000));

  // 3. Ghi nhận dialogs hiện có
  const dialogsBefore = await wc.executeJavaScript(`
    Array.from(document.querySelectorAll('[role="dialog"]')).map(function(d) { return d.getAttribute('aria-label') || ''; })
  `);

  // 4. Tìm và click nút "Chuyển ngay" (trong card có data-visualcompletion="css-img" + span[dir="auto"])
  const clicked = await wc.executeJavaScript(`
    (function() {
      var main = document.querySelector('[role="main"]');
      if (!main) return false;
      var buttons = main.querySelectorAll('[role="button"]');
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
        btn.click(); return true;
      }
      return false;
    })()
  `);

  if (!clicked) {
    onLog?.('Không tìm thấy nút "Chuyển ngay" trên trang.');
    return { error: 'Không tìm thấy nút chuyển tư cách' };
  }

  onLog?.('Đang xác nhận...');
  await new Promise(r => setTimeout(r, 1500));

  // 5. Confirm trong modal mới
  await wc.executeJavaScript(`
    (function() {
      var before = ${JSON.stringify(dialogsBefore)};
      var beforeSet = new Set(before);
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      var modal = dialogs.find(function(d) { return !beforeSet.has(d.getAttribute('aria-label') || ''); })
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
  return { ok: true };
}

module.exports = {
  ensureLoggedIn, fetchGroups, fetchGroupsForIdentity, getIdentities,
  runPostTask, clearSession, resetContext, loginFacebook, SESSION_PATH,
  switchToPersonal, switchIdentityOnBrowser,
};
