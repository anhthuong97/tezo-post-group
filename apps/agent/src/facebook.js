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
async function openIdentitySwitcher(wc, onLog) {
  const existingLabels = await wc.executeJavaScript(
    `Array.from(document.querySelectorAll('[role="dialog"]')).map(function(d){return d.getAttribute('aria-label')||'';})`
  );

  const debug = await wc.executeJavaScript(`
    (function() {
      var banner = document.querySelector('[role="banner"]');
      if (!banner) return { ok: false, reason: 'no_banner' };
      var allHasPopup = banner.querySelectorAll('[aria-haspopup="dialog"][role="button"]').length;
      var imgEl = banner.querySelector('[aria-haspopup="dialog"][role="button"] svg image');
      if (!imgEl) {
        var anySvgImg = !!banner.querySelector('svg image');
        return { ok: false, reason: 'no_img_in_haspopup', allHasPopup: allHasPopup, anySvgImg: anySvgImg };
      }
      var btn = imgEl.closest('[aria-haspopup="dialog"]');
      if (!btn) return { ok: false, reason: 'no_btn_from_closest', allHasPopup: allHasPopup };
      var r = btn.getBoundingClientRect();
      return {
        ok: true, allHasPopup: allHasPopup,
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      };
    })()
  `);

  onLog?.('[Avatar] ' + JSON.stringify(debug));
  if (!debug.ok) throw new Error('Không tìm thấy nút avatar: ' + debug.reason);

  // sendInputEvent gửi mouse event thật (reliable hơn .click() với React)
  wc.sendInputEvent({ type: 'mouseDown', x: debug.x, y: debug.y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 80));
  wc.sendInputEvent({ type: 'mouseUp',   x: debug.x, y: debug.y, button: 'left', clickCount: 1 });
  onLog?.('[Avatar] sendInputEvent at ' + debug.x + ',' + debug.y);

  // Chờ dialog mới xuất hiện
  await new Promise(r => setTimeout(r, 1500));

  const dialogCount = await wc.executeJavaScript(
    `document.querySelectorAll('[role="dialog"]').length`
  );
  onLog?.('[Avatar] dialogs sau click: ' + dialogCount);

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

// Chuyển về tư cách cá nhân (chỉ gọi khi ĐÃ BIẾT đang ở page identity, phát hiện qua /me)
// Flow: poll avatar → open dropdown → click first listitem (= personal trong page mode)
async function forcePersonalIdentity(wc, onLog) {
  onLog?.('[ForcePersonal] bắt đầu');
  let avatarReady = false;
  for (let i = 0; i < 16; i++) {
    try {
      avatarReady = await wc.executeJavaScript(
        `!!document.querySelector('[role="banner"] [aria-haspopup="dialog"][role="button"] svg image')`
      );
    } catch {}
    if (avatarReady) break;
    await new Promise(r => setTimeout(r, 500));
  }
  onLog?.('[ForcePersonal] avatarReady=' + avatarReady);
  if (!avatarReady) { onLog?.('[ForcePersonal] không thấy avatar, bỏ qua'); return; }

  let existingLabels;
  try {
    existingLabels = await openIdentitySwitcher(wc, onLog);
  } catch (e) {
    onLog?.('[ForcePersonal] không mở được dropdown: ' + e.message);
    return;
  }

  const switchResult = await wc.executeJavaScript(`
    (function() {
      var before = ${JSON.stringify(existingLabels)};
      var existing = new Set(before);
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
              || dialogs[dialogs.length - 1];
      if (!d) return { status: 'no_dialog' };
      var items = Array.from(d.querySelectorAll('[role="listitem"]'));
      if (!items.length) return { status: 'no_items', html: d.innerHTML.slice(0,200) };
      var el = items[0].querySelector('a[href],[role="button"]');
      if (el) { el.click(); return { status: 'clicked', count: items.length }; }
      items[0].click();
      return { status: 'clicked_item', count: items.length };
    })()
  `);

  onLog?.('[ForcePersonal] ' + JSON.stringify(switchResult));
  if (switchResult?.status?.startsWith('clicked')) {
    onLog?.('Đang chuyển về tư cách cá nhân...');
    await new Promise(r => setTimeout(r, 3000));
    onLog?.('Đã chuyển về tư cách cá nhân');
  }
}

// ─── getIdentities ─────────────────────────────────────────────────────────

async function getIdentities(onLog) {
  onLog?.('[v4] getIdentities start');
  onLog?.('Đang lấy danh sách tư cách...');
  try {
    const { app } = require('electron');
    const fbWin = app.getFbWindow?.();
    if (!fbWin || fbWin.isDestroyed()) throw new Error('Browser chưa mở. Hãy click "Hiện Browser" trước.');
    if (isLoggedOut(fbWin.webContents.getURL())) { onLog?.('Chưa đăng nhập Facebook.'); return []; }

    // Normalize FB URL → slug để so sánh (bỏ domain, bỏ trailing slash, lowercase)
    const normSlug = (href) => {
      if (!href) return '';
      try {
        const str = href.includes('://') ? href : 'https://www.facebook.com' + href;
        const u = new URL(str);
        if (!u.hostname.includes('facebook.com')) return '';
        if (u.pathname === '/profile.php') return 'profile:' + (u.searchParams.get('id') || '');
        var seg = u.pathname.replace(/^\//, '').split('/')[0].split('?')[0].toLowerCase(); return seg || '';
      } catch { return ''; }
    };

    // ── Bước 1: Lấy danh sách pages (để detect personal bằng URL) ───────────
    onLog?.('[Step1] navigate /pages/...');
    const wcPages = await navigateFbWin(
      'https://www.facebook.com/pages/?category=your_pages&ref=bookmarks', onLog
    );

    for (let i = 0; i < 20; i++) {
      const hasCards = await wcPages.executeJavaScript(
        `!!(document.querySelector('[role="main"] a[role="link"]:not([aria-label]) span[dir="auto"]'))`
      );
      if (hasCards) break;
      await new Promise(r => setTimeout(r, 500));
    }

    for (let i = 0; i < 15; i++) {
      try {
        const prevH = await wcPages.executeJavaScript('document.body.scrollHeight');
        await wcPages.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(r => setTimeout(r, 1200));
        const newH = await wcPages.executeJavaScript('document.body.scrollHeight');
        if (newH === prevH) break;
      } catch { break; }
    }

    const pages = await wcPages.executeJavaScript(`
      (function() {
        var NL = String.fromCharCode(10);
        var results = [];
        var seen = new Set();
        var main = document.querySelector('[role="main"]') || document.body;
        var links = Array.from(main.querySelectorAll('a[role="link"]'));
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          if (a.getAttribute('aria-label')) continue;
          var span = a.querySelector('span[dir="auto"]');
          if (!span) continue;
          var raw = (span.innerText || '').trim();
          var nlPos = raw.indexOf(NL);
          var name = nlPos > 0 ? raw.slice(0, nlPos).trim() : raw;
          if (!name || name.length < 2 || seen.has(name)) continue;
          try {
            var u = new URL(a.href);
            if (!u.hostname.includes('facebook.com')) continue;
            var href, cleanUrl;
            if (u.pathname === '/profile.php' && u.searchParams.get('id')) {
              href = '/profile.php?id=' + u.searchParams.get('id');
              cleanUrl = u.origin + href;
            } else if (u.pathname.length > 1) {
              href = u.pathname.replace(/\\/$/, '');
              cleanUrl = u.origin + href;
            } else { continue; }
            seen.add(name);
            results.push({ cleanUrl: cleanUrl, href: href, name: name });
          } catch {}
        }
        return results;
      })()
    `);

    onLog?.(`[Step1] ${pages.length} pages`);
    const pageSlugSet = new Set(pages.map(p => normSlug(p.cleanUrl)).filter(Boolean));
    const pageNameSet = new Set(pages.map(p => p.name.trim().toLowerCase()));
    onLog?.('[Step1] page slugs: ' + JSON.stringify([...pageSlugSet]));

    // ── Bước 2: Mở dropdown, detect personal bằng URL slug ──────────────────
    onLog?.('[Step2] navigate home + open dropdown...');
    const wcHome = await navigateFbWin('https://www.facebook.com/', onLog);

    let avatarReady = false;
    for (let i = 0; i < 16; i++) {
      try {
        avatarReady = await wcHome.executeJavaScript(
          `!!document.querySelector('[role="banner"] [aria-haspopup="dialog"][role="button"] svg image')`
        );
      } catch {}
      if (avatarReady) break;
      await new Promise(r => setTimeout(r, 500));
    }
    onLog?.('[Step2] avatarReady=' + avatarReady);
    if (!avatarReady) throw new Error('Không tìm thấy avatar button');

    let existingLabels;
    try {
      existingLabels = await openIdentitySwitcher(wcHome, onLog);
    } catch (e) {
      throw new Error('Không mở được dropdown: ' + e.message);
    }

    // Lấy data từ dropdown: current identity header + listitems
    const dropdownData = await wcHome.executeJavaScript(`
      (function() {
        var NL = String.fromCharCode(10);
        var before = ${JSON.stringify(existingLabels)};
        var existing = new Set(before);
        var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
                || dialogs[dialogs.length - 1];
        if (!d) return { error: 'no_dialog' };

        function getFirstLine(el) {
          var raw = (el.innerText || '').trim();
          var pos = raw.indexOf(NL);
          return pos > 0 ? raw.slice(0, pos).trim() : raw;
        }

        // Current identity header: a[href] trong dialog nhưng KHÔNG nằm trong listitem
        var allLinks = Array.from(d.querySelectorAll('a[href]'));
        var listitemSet = new Set(Array.from(d.querySelectorAll('[role="listitem"] a[href]')));
        var headerLinks = allLinks.filter(function(a) {
          return !listitemSet.has(a)
            && a.href && a.href.includes('facebook.com/')
            && !a.href.includes('/pages/');
        });
        var current = null;
        if (headerLinks.length) {
          var a = headerLinks[0];
          var nameEl = a.querySelector('[dir="auto"]') || a;
          current = { name: getFirstLine(nameEl), href: a.href };
        }

        // Listitems = các tư cách có thể switch sang
        var items = Array.from(d.querySelectorAll('[role="listitem"]')).map(function(el) {
          var link = el.querySelector('a[href]');
          if (!link || !link.href.includes('facebook.com')) return null;
          var nameEl = link.querySelector('[dir="auto"]') || link;
          return { name: getFirstLine(nameEl), href: link.href };
        }).filter(Boolean);

        return { current: current, items: items };
      })()
    `);

    onLog?.('[Step2] current=' + JSON.stringify(dropdownData.current) + ' items=' + (dropdownData.items?.length));
    if (dropdownData.error) throw new Error('Dropdown: ' + dropdownData.error);

    // Tìm tư cách cá nhân: slug không có trong pageSlugSet
    const all = [
      dropdownData.current ? Object.assign({}, dropdownData.current, { isCurrent: true }) : null,
      ...(dropdownData.items || []).map(x => Object.assign({}, x, { isCurrent: false }))
    ].filter(Boolean);

    let personalItem = all.find(x => {
      const slug = normSlug(x.href);
      return slug && !pageSlugSet.has(slug);
    });

    // Fallback theo tên (khi slug parse lỗi)
    if (!personalItem) {
      personalItem = all.find(x => x.name && !pageNameSet.has(x.name.trim().toLowerCase()));
      if (personalItem) onLog?.('[Step2] fallback by name: ' + personalItem.name);
    }
    if (!personalItem && all.length > 0) {
      personalItem = all[0];
      onLog?.('[Step2] WARN fallback first item: ' + personalItem.name);
    }

    onLog?.('[Step2] personalItem=' + JSON.stringify(personalItem));
    const personalName = personalItem?.name || 'Trang cá nhân';

    if (personalItem && !personalItem.isCurrent) {
      // Đang ở page identity → click vào entry cá nhân trong dropdown
      onLog?.('[Step2] switch về cá nhân: ' + personalName);
      const clickResult = await wcHome.executeJavaScript(`
        (function() {
          var before = ${JSON.stringify(existingLabels)};
          var existing = new Set(before);
          var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
          var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
                  || dialogs[dialogs.length - 1];
          if (!d) return { status: 'no_dialog' };
          var targetHref = ${JSON.stringify(personalItem.href)};
          var target = Array.from(d.querySelectorAll('[role="listitem"]')).find(function(el) {
            var a = el.querySelector('a[href]');
            return a && a.href === targetHref;
          });
          if (!target) return { status: 'not_found', wanted: targetHref };
          var el = target.querySelector('a[href]') || target.querySelector('[role="button"]');
          if (el) { el.click(); return { status: 'clicked' }; }
          target.click();
          return { status: 'clicked_item' };
        })()
      `);
      onLog?.('[Step2] click=' + JSON.stringify(clickResult));
      if (clickResult?.status?.startsWith('clicked')) {
        onLog?.('Đang chuyển về tư cách cá nhân...');
        await new Promise(r => setTimeout(r, 3000));
        onLog?.('Đã chuyển về tư cách cá nhân');
      }
    } else {
      onLog?.('[Step2] đã ở tư cách cá nhân');
      try {
        await wcHome.executeJavaScript(
          `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`
        );
      } catch {}
    }

    onLog?.(`Tên cá nhân: "${personalName}"`);
    const identities = [{ id: 'personal', name: personalName, type: 'personal' }];
    for (const p of pages) {
      const slug = (p.href || '').replace(/^\//, '').replace(/\/$/, '') || 'page';
      identities.push({ id: 'page_' + slug, name: p.name, type: 'page', href: p.href });
    }
    onLog?.('Tư cách: ' + identities.map(x => x.name).join(', '));
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
