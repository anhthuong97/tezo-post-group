const { chromium } = require('playwright-core');
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const SESSION_PATH = path.join(app.getPath('userData'), 'fb-session.json');

let browser       = null;
let playwrightPage = null; // automation page dùng chung — ẩn, không phải fbWindow

async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  return browser;
}

// connectOverCDP không cho phép tạo context mới (Target.createBrowserContext fails).
// Dùng context mặc định của Electron (contexts()[0]) để tạo page mới.
// Page này chia sẻ session/cookie với fbWindow → tự động đã login nếu fbWindow đã login.
async function getOrCreatePage(onLog) {
  onLog?.('[PW] ensureBrowser...');
  const b = await ensureBrowser();
  onLog?.('[PW] connected=' + b.isConnected());

  if (playwrightPage && !playwrightPage.isClosed()) {
    onLog?.('[PW] Dùng lại page hiện có');
    return playwrightPage;
  }

  const contexts = b.contexts();
  onLog?.('[PW] contexts: ' + contexts.length);
  if (!contexts.length) throw new Error('Không có browser context — hãy mở browser trước');

  const ctx = contexts[0]; // Electron default context, đã có session FB
  onLog?.('[PW] Tạo page mới trong Electron context...');
  playwrightPage = await ctx.newPage();
  onLog?.('[PW] page mới OK');
  return playwrightPage;
}

function isLoggedOut(url) {
  return ['/login', '/checkpoint', '/two_step_verification', '/recover'].some(p => url.includes(p));
}

async function ensureLoggedIn(onNeedLogin, onLog) {
  const page = await getOrCreatePage(onLog);

  onLog?.('[PW] navigate facebook.com để check login...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  onLog?.('[PW] URL: ' + page.url());

  if (isLoggedOut(page.url())) {
    onLog?.('[PW] Chưa login FB — yêu cầu đăng nhập thủ công');
    onNeedLogin(page);
    await page.waitForFunction(
      () => !window.location.href.includes('/login') && !window.location.href.includes('/checkpoint'),
      { timeout: 5 * 60 * 1000 }
    );
    onLog?.('[PW] Đăng nhập thành công');
  } else {
    onLog?.('[PW] Đã login FB OK');
  }
  return { ctx: null, page };
}

async function fetchGroups(onLog) {
  onLog('Đang kết nối browser...');
  let ctx, page;
  try {
    ({ ctx, page } = await ensureLoggedIn(() => onLog('Cần đăng nhập Facebook trước!'), onLog));
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

// Download ảnh từ VPS về thư mục temp
async function downloadImages(imageNames, serverUrl, onLog) {
  if (!imageNames || imageNames.length === 0) return [];
  const os      = require('os');
  const https   = require('https');
  const http    = require('http');
  const tmpDir  = path.join(os.tmpdir(), 'tezo_imgs');
  fs.mkdirSync(tmpDir, { recursive: true });
  const paths = [];
  for (const name of imageNames) {
    const dest = path.join(tmpDir, name);
    const url  = `${serverUrl}/uploads/${name}`;
    try {
      await new Promise((resolve, reject) => {
        const out    = fs.createWriteStream(dest);
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          res.pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        }).on('error', reject);
      });
      paths.push(dest);
      onLog(`  Đã tải ảnh: ${name}`);
    } catch (e) {
      onLog(`  Bỏ qua ảnh ${name}: ${e.message}`);
    }
  }
  return paths;
}

// Lấy link bài viết sau khi đăng
async function getPostLink(page, postHeadline, onLog) {
  try {
    const text = (postHeadline || '').slice(0, 25);
    if (text) {
      await page.waitForFunction(
        (t) => Array.from(document.querySelectorAll('[data-ad-rendering-role="story_message"]'))
          .some((d) => d.textContent.includes(t)),
        text, { timeout: 8000 }
      ).catch(() => {});
    }
    await page.waitForTimeout(1000);
    const result = await page.evaluate(({ t }) => {
      const isPost = (href) => href && (href.includes('/posts/') || href.includes('/permalink/') || href.includes('story_fbid'));
      const divs   = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
      let target   = null;
      for (const d of divs) { if (d.textContent.includes(t)) { target = d; break; } }
      if (!target && divs.length > 0) target = divs[0];
      if (target) {
        let el = target;
        for (let i = 0; i < 35; i++) {
          el = el.parentElement; if (!el) break;
          for (const a of el.querySelectorAll('a[href]')) {
            if (isPost(a.href) && a.href.includes('facebook.com'))
              return { link: a.href.split('?')[0] };
          }
        }
      }
      for (const a of document.querySelectorAll('a[href]')) {
        if (isPost(a.href) && a.href.includes('facebook.com'))
          return { link: a.href.split('?')[0] };
      }
      return { link: null };
    }, { t: text });
    if (result.link) onLog(`  Link bài: ${result.link}`);
    return result.link || null;
  } catch (e) {
    onLog(`  getPostLink lỗi: ${e.message}`);
    return null;
  }
}

// Comment vào bài vừa đăng
async function commentOnPost(page, commentText, postHeadline, onLog) {
  try {
    await page.waitForTimeout(3000);
    const searchText = (postHeadline || '').slice(0, 30);
    let commentBox;
    if (searchText) {
      const handle = await page.evaluateHandle((text) => {
        const divs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
        let target = null;
        for (const d of divs) { if (d.textContent.includes(text)) { target = d; break; } }
        if (!target) return null;
        let el = target;
        for (let i = 0; i < 30; i++) {
          el = el.parentElement; if (!el) break;
          const box = el.querySelector('[role="textbox"][data-lexical-editor="true"]');
          if (box) return box;
        }
        return null;
      }, searchText);
      if (await handle.evaluate((el) => el !== null)) commentBox = handle.asElement();
    }
    if (!commentBox) {
      commentBox = page.locator('[role="textbox"][data-lexical-editor="true"]').first();
    }
    await commentBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await commentBox.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(commentText, { delay: 20 + Math.floor(Math.random() * 30) });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    onLog('  Đã comment.');
  } catch (e) {
    onLog(`  commentOnPost lỗi: ${e.message}`);
  }
}

async function postToGroup(page, groupUrl, content, imagePaths, onLog, onStep) {
  const step = onStep || (() => {});
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

    // Upload ảnh
    if (imagePaths && imagePaths.length > 0) {
      step(groupUrl, 'uploading', 'Đang tải ảnh lên...');
      onLog(`  Gắn ${imagePaths.length} ảnh...`);
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 15000 }),
          dialog.locator('[aria-label="Ảnh/video"]').click(),
        ]);
        await fileChooser.setFiles(imagePaths);
        onLog('  Chờ ảnh tải xong...');
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
      } catch (e) {
        onLog(`  Upload ảnh thất bại: ${e.message}`);
      }
    }

    if (content) {
      step(groupUrl, 'writing', 'Đang viết nội dung...');
      const textbox = page.getByRole('textbox').last();
      await textbox.click();
      await page.waitForTimeout(300);
      const head = content.slice(0, Math.min(10, content.length));
      const tail  = content.slice(head.length);
      await page.keyboard.type(head, { delay: 80 });
      if (tail) await page.keyboard.type(tail, { delay: 20 });
      await page.waitForTimeout(800);
    }

    step(groupUrl, 'posting', 'Đang đăng bài...');

    let capturedPostId = null;
    const responseHandler = async (response) => {
      if (capturedPostId) return;
      if (!response.url().includes('graphql')) return;
      try {
        const text = await response.text();
        const m = text.match(/"story_id"\s*:\s*"(\d+)"/)
                || text.match(/"post_id"\s*:\s*"(\d+)"/)
                || text.match(/"id"\s*:\s*"(\d{15,})"/);
        if (m) capturedPostId = m[1];
      } catch {}
    };
    page.on('response', responseHandler);

    await page.waitForFunction(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return false;
      return Array.from(d.querySelectorAll('[role="button"]'))
        .some(b => b.textContent.trim() === 'Đăng' && b.getAttribute('aria-disabled') !== 'true');
    }, { timeout: 15000 }).catch(() => {});

    try {
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return;
        const btns = Array.from(d.querySelectorAll('[role="button"]'));
        const postBtn = btns.find(b =>
          b.textContent.trim() === 'Đăng' && b.getAttribute('aria-disabled') !== 'true'
        );
        if (postBtn) postBtn.click();
      });
      await page.waitForFunction(() => {
        return !Array.from(document.querySelectorAll('[role="dialog"]'))
          .some(d => d.getAttribute('aria-label') === 'Tạo bài viết');
      }, { timeout: 30000 });
      await page.waitForTimeout(2000);
    } finally {
      page.off('response', responseHandler);
    }

    onLog(`✓ Đã đăng vào: ${groupUrl}`);
    const groupId = (groupUrl.match(/groups\/(\d+)/) || [])[1];
    let postLink  = null;
    if (capturedPostId && groupId) {
      postLink = `https://www.facebook.com/groups/${groupId}/posts/${capturedPostId}/`;
      onLog(`  Link bài (graphql): ${postLink}`);
    } else {
      postLink = await getPostLink(page, (content || '').split('\n')[0].trim(), onLog);
    }

    return { success: true, url: groupUrl, postLink };
  } catch (err) {
    onLog(`✗ Lỗi tại ${groupUrl}: ${err.message}`);
    step(groupUrl, 'error', err.message);
    return { success: false, url: groupUrl, error: err.message };
  }
}

async function runPostTask(task, onLog, onNeedLogin) {
  const { groups, content, images, productLink, comment, delayMin = 15, delayMax = 45 } = task.payload;
  const onStep       = task._onStep      || (() => {});
  const isCancelled  = task._isCancelled || (() => false);
  const results = [];

  // Init all groups as pending
  for (const g of groups) onStep(g.url || g, 'pending', 'Đang chờ...');

  let ctx, page;
  try {
    ({ ctx, page } = await ensureLoggedIn(onNeedLogin));
  } catch (err) {
    return { error: 'Không thể đăng nhập Facebook: ' + err.message, results: [] };
  }

  const serverUrl   = task._serverUrl || '';
  const imagePaths  = serverUrl && images?.length
    ? await downloadImages(images, serverUrl, onLog)
    : [];

  for (let i = 0; i < groups.length; i++) {
    const g    = groups[i];
    const gUrl = g.url || g;

    // Check cancel trước khi bắt đầu nhóm này
    if (await isCancelled(gUrl)) {
      onLog(`Bỏ qua nhóm đã hủy: ${g.name || gUrl}`);
      results.push({ success: false, url: gUrl, error: 'Cancelled' });
      continue;
    }

    const result = await postToGroup(page, gUrl, content, imagePaths, onLog, onStep);
    results.push(result);

    // Comment sau khi đăng
    if (result.success && comment) {
      const postHeadline = (content || '').split('\n')[0].trim();
      const commentText  = comment.replace('{link bài viết}', result.postLink || productLink || '');
      onStep(gUrl, 'commenting', 'Đang viết comment...');
      onLog('  Đang viết comment...');
      await commentOnPost(page, commentText, postHeadline, onLog);
      onStep(gUrl, 'success', 'Đăng thành công!', result.postLink || undefined);
    } else if (result.success) {
      onStep(gUrl, 'success', 'Đăng thành công!', result.postLink || undefined);
    }

    if (i < groups.length - 1) {
      const delaySec = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
      onLog(`Chờ ${delaySec}s trước nhóm tiếp theo...`);
      await page.waitForTimeout(delaySec * 1000);
    }
  }

  return { results };
}

function clearSession() {
  if (fs.existsSync(SESSION_PATH)) { try { fs.unlinkSync(SESSION_PATH); } catch {} }
  playwrightPage = null;
  browser        = null;
}

async function resetContext() {
  if (playwrightPage && !playwrightPage.isClosed()) {
    try { await playwrightPage.close(); } catch {}
  }
  playwrightPage = null;
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

// Playwright equivalent của navigateFbWin — chạy ngầm, không mở fbWindow.
// Lấy/tạo Playwright page rồi navigate tới URL, trả về page với shim
// executeJavaScript + sendInputEvent để code gốc không cần sửa.
async function navigatePW(url, onLog) {
  onLog?.('[PW] navigatePW → ' + url);
  const page = await getOrCreatePage(onLog);

  onLog?.('[PW] goto...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  onLog?.('[PW] done → ' + page.url());
  await page.waitForTimeout(2000);

  // Shim: page.executeJavaScript(str) → page.evaluate(str)
  if (!page.executeJavaScript) {
    page.executeJavaScript = (script) => page.evaluate(script);
  }
  // Shim: page.sendInputEvent({ type, x, y }) → page.mouse.click(x, y)
  if (!page.sendInputEvent) {
    page._pwMousePending = null;
    page.sendInputEvent = (evt) => {
      if (evt.type === 'mouseDown') {
        page._pwMousePending = { x: evt.x, y: evt.y };
      } else if (evt.type === 'mouseUp' && page._pwMousePending) {
        const { x, y } = page._pwMousePending;
        page._pwMousePending = null;
        page.mouse.click(x, y).catch(() => {});
      }
    };
  }

  return page;
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
  onLog?.('[v7] getIdentities start');
  onLog?.('Đang lấy danh sách tư cách...');
  try {
    const scrapePages = async () => {
      const wc = await navigatePW(
        'https://www.facebook.com/pages/?category=your_pages&ref=bookmarks', onLog
      );
      for (let i = 0; i < 20; i++) {
        const ok = await wc.executeJavaScript(
          `!!(document.querySelector('[role="main"] a[role="link"]:not([aria-label]) span[dir="auto"]'))`
        );
        if (ok) break;
        await new Promise(r => setTimeout(r, 500));
      }
      for (let i = 0; i < 15; i++) {
        try {
          const prevH = await wc.executeJavaScript('document.body.scrollHeight');
          await wc.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
          await new Promise(r => setTimeout(r, 1200));
          const newH = await wc.executeJavaScript('document.body.scrollHeight');
          if (newH === prevH) break;
        } catch { break; }
      }
      const NLS = String.fromCharCode(10);
      return wc.executeJavaScript(`
        (function() {
          var NL = String.fromCharCode(10);
          var results = [], seen = new Set();
          var main = document.querySelector('[role="main"]') || document.body;
          var links = Array.from(main.querySelectorAll('a[role="link"]'));
          for (var i = 0; i < links.length; i++) {
            var a = links[i];
            if (a.getAttribute('aria-label')) continue;
            var span = a.querySelector('span[dir="auto"]');
            if (!span) continue;
            var raw = (span.innerText || '').trim();
            var nl = raw.indexOf(NL); var name = nl > 0 ? raw.slice(0, nl).trim() : raw;
            if (!name || name.length < 2 || seen.has(name)) continue;
            try {
              var u = new URL(a.href);
              if (!u.hostname.includes('facebook.com')) continue;
              var href;
              if (u.pathname === '/profile.php' && u.searchParams.get('id')) {
                href = '/profile.php?id=' + u.searchParams.get('id');
              } else if (u.pathname.length > 1) {
                href = u.pathname.replace(/\\/$/, '').split('?')[0];
              } else { continue; }
              seen.add(name);
              results.push({ name: name, href: href });
            } catch {}
          }
          return results;
        })()
      `);
    };

    // ── Bước 1: Lấy page names (để nhận diện personal từ dropdown) ──────────
    onLog?.('[Step1] lấy pages từ /pages/...');
    const pagesForCompare = await scrapePages();
    const pageNameSet = new Set(pagesForCompare.map(p => (p.name || '').trim().toLowerCase()));
    onLog?.('[Step1] ' + pagesForCompare.length + ' pages: ' + pagesForCompare.map(p=>p.name).join(', '));

    // ── Bước 2: Mở dropdown, đọc tư cách ────────────────────────────────────
    // Cấu trúc dropdown (từ DOM thực):
    //   [role="dialog"]
    //     └── a[href="/me/"]                ← current identity header (link sang profile)
    //     └── [role="listitem"] + [role="button"] (NO a[href])  ← identity switch buttons
    //     └── [role="listitem"] + a[href]                        ← menu items (MBS, Cài đặt...)
    // → Phân biệt identity vs menu: listitem CÓ [role="button"] mà KHÔNG CÓ a[href]
    onLog?.('[Step2] navigate home + mở dropdown...');
    const wcHome = await navigatePW('https://www.facebook.com/', onLog);

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
    try { existingLabels = await openIdentitySwitcher(wcHome, onLog); }
    catch (e) { throw new Error('Không mở được dropdown: ' + e.message); }

    // Đọc dropdown: current header + identity switch buttons
    const dropdownData = await wcHome.executeJavaScript(`
      (function() {
        var NL = String.fromCharCode(10);
        function firstName(el) {
          if (!el) return '';
          var spans = Array.from(el.querySelectorAll('span[dir="auto"]'));
          for (var i = 0; i < spans.length; i++) {
            var t = (spans[i].innerText || '').trim();
            if (t && t.length > 1) {
              var pos = t.indexOf(NL); return pos > 0 ? t.slice(0,pos).trim() : t;
            }
          }
          var t = (el.innerText || '').trim();
          var pos = t.indexOf(NL); return pos > 0 ? t.slice(0,pos).trim() : t;
        }

        var before = ${JSON.stringify(existingLabels)};
        var existing = new Set(before);
        var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
                || dialogs[dialogs.length - 1];
        if (!d) return { error: 'no_dialog' };

        // Current identity = a[href] trong dialog có pathname "/me" hoặc "/me/"
        var allAnchors = Array.from(d.querySelectorAll('a[href]'));
        var currentLink = allAnchors.find(function(a) {
          try {
            var p = new URL(a.href).pathname;
            if (p.charAt(p.length-1) === '/') p = p.slice(0,-1);
            return p === '/me';
          } catch { return false; }
        });
        var current = currentLink
          ? { name: firstName(currentLink) }
          : null;

        // Identity switch buttons nằm trong [role="list"] ĐẦU TIÊN trong dialog.
        // List thứ 2 chứa menu items (Cài đặt, Trợ giúp...) — cũng dùng [role="button"]
        // nên KHÔNG được query toàn dialog, chỉ lấy từ list[0].
        var identityList = d.querySelector('[role="list"]');
        var listitems = identityList ? Array.from(identityList.querySelectorAll('[role="listitem"]')) : [];
        var switchBtns = [];
        for (var i = 0; i < listitems.length; i++) {
          var li = listitems[i];
          if (li.querySelector('a[href]')) continue;       // link item → skip
          var btn = li.querySelector('[role="button"]');
          if (!btn) continue;
          var name = firstName(btn);
          if (name && name.length > 1) switchBtns.push({ name: name });
        }

        return { current: current, switchBtns: switchBtns };
      })()
    `);

    onLog?.('[Step2] current=' + JSON.stringify(dropdownData.current) + ' switchBtns=' + JSON.stringify(dropdownData.switchBtns));
    if (dropdownData.error) throw new Error('Dropdown: ' + dropdownData.error);

    // Tìm personal trong identity switch buttons (tên không có trong pages)
    const switchBtns = dropdownData.switchBtns || [];
    let personalName = null;
    let needsSwitch = false;
    let switchToName = null;

    const personalBtn = switchBtns.find(x => x.name && !pageNameSet.has(x.name.trim().toLowerCase()));
    if (personalBtn) {
      // Tìm thấy personal trong switch buttons → đang ở page identity → cần switch
      personalName = personalBtn.name;
      needsSwitch = true;
      switchToName = personalBtn.name;
      onLog?.('[Step2] personal ở switch button: ' + personalName + ' → cần switch');
    } else {
      // Không có switch button nào ngoài pages → đang ở personal identity
      personalName = dropdownData.current?.name || 'Trang cá nhân';
      onLog?.('[Step2] đã ở tư cách cá nhân: ' + personalName);
    }

    // ── Bước 3: Switch về personal nếu cần ──────────────────────────────────
    if (needsSwitch && switchToName) {
      onLog?.('[Step3] switch về: ' + switchToName);
      const clickResult = await wcHome.executeJavaScript(`
        (function() {
          var targetName = ${JSON.stringify(switchToName)};
          var NL = String.fromCharCode(10);
          function firstName(el) {
            if (!el) return '';
            var spans = Array.from(el.querySelectorAll('span[dir="auto"]'));
            for (var i = 0; i < spans.length; i++) {
              var t = (spans[i].innerText || '').trim();
              if (t && t.length > 1) {
                var pos = t.indexOf(NL); return pos > 0 ? t.slice(0,pos).trim() : t;
              }
            }
            return (el.innerText || '').trim().split(NL)[0].trim();
          }
          var before = ${JSON.stringify(existingLabels)};
          var existing = new Set(before);
          var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
          var d = dialogs.find(function(x){ return !existing.has(x.getAttribute('aria-label')||''); })
                  || dialogs[dialogs.length - 1];
          if (!d) return { status: 'no_dialog' };
          var identityList = d.querySelector('[role="list"]');
          var listitems = identityList ? Array.from(identityList.querySelectorAll('[role="listitem"]')) : [];
          for (var i = 0; i < listitems.length; i++) {
            var li = listitems[i];
            if (li.querySelector('a[href]')) continue;
            var btn = li.querySelector('[role="button"]');
            if (!btn) continue;
            if (firstName(btn) === targetName) {
              btn.click();
              return { status: 'clicked', name: targetName };
            }
          }
          return { status: 'not_found', target: targetName };
        })()
      `);
      onLog?.('[Step3] click=' + JSON.stringify(clickResult));
      if (clickResult?.status === 'clicked') {
        onLog?.('Đang chuyển về tư cách cá nhân...');
        await new Promise(r => setTimeout(r, 3000));
        onLog?.('Đã chuyển về tư cách cá nhân');
      }
    } else if (!needsSwitch) {
      try {
        await wcHome.executeJavaScript(
          `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`
        );
      } catch {}
    }

    onLog?.(`Tên cá nhân: "${personalName}"`);

    // ── Bước 4: Lấy pages đầy đủ (đang ở tư cách cá nhân) ──────────────────
    onLog?.('[Step4] lấy pages đầy đủ...');
    const pages = needsSwitch ? await scrapePages() : pagesForCompare;
    onLog?.('[Step4] ' + pages.length + ' pages');

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
    const wc = await navigatePW('https://www.facebook.com/groups/joins/', onLog);
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
  const wc = await navigatePW('https://www.facebook.com/', onLog);
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
  const wc = await navigatePW(pageUrl, onLog);
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
  navigatePW('https://www.facebook.com/', onLog).catch(() => {});

  return { ok: true };
}

module.exports = {
  ensureLoggedIn, fetchGroups, fetchGroupsForIdentity, getIdentities,
  runPostTask, clearSession, resetContext, loginFacebook, SESSION_PATH,
  switchToPersonal, switchIdentityOnBrowser,
};
