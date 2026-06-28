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

async function loginFacebook(onLog, onShowBrowser, onHideBrowser) {
  onLog('Đang kết nối Facebook...');
  try {
    const ctx   = await getOrCreateContext();
    const pages = ctx.pages();
    const page  = pages.length > 0 ? pages[0] : await ctx.newPage();

    // Navigate trong khi window còn ẩn — tránh conflict với Electron
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (!isLoggedOut(page.url())) {
      onLog('Đã đăng nhập Facebook rồi!');
      return { ok: true, alreadyLoggedIn: true };
    }

    // Page đã load xong rồi mới show window → không abort navigation
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

async function getIdentities(onLog) {
  onLog?.('Đang lấy danh sách tư cách...');
  try {
    const ctx   = await getOrCreateContext();
    const pages = ctx.pages();
    const page  = pages.length > 0 ? pages[0] : await ctx.newPage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    if (isLoggedOut(page.url())) return [];

    // Mở profile switcher để lấy đúng tên + danh sách pages
    // Click vào nút account menu (avatar góc trên phải)
    const identities = [];
    try {
      // Tìm nút account menu — thử nhiều selector vì FB thay đổi liên tục
      const menuSelectors = [
        '[aria-label="Account"]',
        '[data-testid="royal_mega_menu"]',
        'div[aria-haspopup="menu"] img[alt]',
      ];
      let menuBtn = null;
      for (const sel of menuSelectors) {
        menuBtn = await page.$(sel);
        if (menuBtn) break;
      }
      if (menuBtn) {
        await menuBtn.click();
        await page.waitForTimeout(1500);
      }

      // Đọc danh sách tư cách từ dropdown
      const items = await page.evaluate(() => {
        const results = [];
        // FB hiển thị profile switcher trong một menu popup
        // Tìm các item có aria-label hoặc role=menuitem
        const menus = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] a'));
        for (const el of menus) {
          const text = el.textContent?.trim();
          const href = el.getAttribute('href') || '';
          if (!text || text.length < 2 || text.length > 80) continue;
          // Loại bỏ các menu item không phải profile/page
          const SKIP_TEXT = ['Đăng xuất', 'Cài đặt', 'Trợ giúp', 'Hiển thị thêm',
                             'Log out', 'Settings', 'Help', 'Give feedback',
                             'See more', 'Xem thêm'];
          if (SKIP_TEXT.some(s => text.includes(s))) continue;
          results.push({ text, href });
        }
        return results;
      });
      onLog?.(`Menu items: ${items.map(i => i.text).join(', ')}`);
    } catch (e) {
      onLog?.('Không mở được menu: ' + e.message);
    }

    // Đóng menu nếu đang mở (nhấn Escape)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);

    // --- Lấy tên cá nhân từ nav ---
    const personalName = await page.evaluate(() => {
      // Tìm link đến profile cá nhân trong nav
      const allAs = Array.from(document.querySelectorAll('a[href]'));
      for (const a of allAs) {
        const href = a.getAttribute('href') || '';
        // Link profile cá nhân thường chứa tên slug hoặc profile.php?id
        if (!href.includes('facebook.com') && !href.startsWith('/')) continue;
        const imgEl = a.querySelector('image, img[alt]');
        const spanEl = a.querySelector('span');
        // Nav profile thường là link có cả ảnh + text tên
        if (imgEl && spanEl) {
          const name = spanEl.textContent?.trim();
          if (name && name.length > 1 && name.length < 60 &&
              /[A-ZÀ-Ỹa-zà-ỹ0-9]/.test(name)) {
            return name;
          }
        }
      }
      // Fallback: meta tag
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle?.content) return ogTitle.content;
      return null;
    });

    identities.push({
      id: 'personal',
      name: personalName || 'Trang cá nhân',
      type: 'personal',
    });

    // --- Lấy Pages từ trang quản lý ---
    try {
      await page.goto('https://www.facebook.com/pages/?category=your_pages', {
        waitUntil: 'domcontentloaded', timeout: 20000,
      });
      await page.waitForTimeout(2500);

      const fbPages = await page.evaluate(() => {
        const results = [];
        const seen    = new Set();

        // Pages you manage hiện dưới dạng cards với link đến page
        // Tìm tất cả link có href là tên page (không phải nav)
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const el of links) {
          const href = el.getAttribute('href') || '';
          // Page href: /PageName/ hoặc https://www.facebook.com/PageName/
          const m = href.match(/(?:https?:\/\/(?:www\.)?facebook\.com)?\/([A-Za-z0-9._%-]{3,80})\/?(?:\?.*)?$/);
          if (!m) continue;
          const slug = m[1];

          // Bỏ các slug hệ thống
          const SYSTEM = new Set(['pages', 'groups', 'messages', 'ads', 'watch', 'gaming',
            'marketplace', 'events', 'friends', 'bookmarks', 'explore', 'search',
            'home', 'me', 'settings', 'help', 'login', 'checkpoint', 'your_pages',
            'liked_pages', 'invitations', 'create', 'notifications', 'saved',
            'memories', 'reels', 'video', 'profile.php']);
          if (SYSTEM.has(slug)) continue;
          if (seen.has(slug)) continue;

          // Lấy text của link — là tên page
          const spans = el.querySelectorAll('span');
          let name = '';
          for (const s of spans) {
            const t = s.textContent?.trim();
            if (t && t.length > 1 && t.length < 100 && !/^\d+$/.test(t)) {
              name = t; break;
            }
          }
          if (!name) name = el.getAttribute('aria-label')?.trim() || '';
          if (!name || name.length < 2) continue;

          seen.add(slug);
          results.push({ id: `page_${slug}`, name, href: `/${slug}`, type: 'page' });
          if (results.length >= 30) break;
        }
        return results;
      });

      // Loại bỏ trùng tên với identities đã có
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

// Fetch nhóm cho một tư cách cụ thể
async function fetchGroupsForIdentity(identityId, identityHref, onLog) {
  onLog(`Đang tải nhóm cho "${identityId}"...`);
  try {
    const ctx   = await getOrCreateContext();
    const pages = ctx.pages();
    const page  = pages.length > 0 ? pages[0] : await ctx.newPage();

    if (isLoggedOut(page.url())) {
      return { error: 'Chưa đăng nhập Facebook.', groups: [] };
    }

    let groupsUrl = 'https://www.facebook.com/groups/joins/';

    if (identityId !== 'personal' && identityHref) {
      // Với Page: thử navigate đến trang groups của page
      const cleanHref = identityHref.startsWith('/') ? identityHref : '/' + identityHref;
      const pageGroupsUrl = `https://www.facebook.com${cleanHref}/groups`;
      try {
        await page.goto(pageGroupsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
        // Nếu trang không tìm thấy hoặc không có groups, fallback về personal
        const found = await page.evaluate(() => document.querySelectorAll('a[href*="/groups/"]').length);
        if (found < 3) groupsUrl = 'https://www.facebook.com/groups/joins/';
        else groupsUrl = null; // đang ở đúng trang rồi
      } catch {
        groupsUrl = 'https://www.facebook.com/groups/joins/';
      }
    }

    if (groupsUrl) {
      await page.goto(groupsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(1500);

    // Scroll để load thêm
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
        if (!href) continue;
        const m = href.match(/\/groups\/([^/?#]+)/);
        if (!m) continue;
        const gid = m[1];
        if (NAV_IDS.includes(gid) || gid === 'joins' || /^\d{5,}$/.test(gid) === false && !/^[a-zA-Z]/.test(gid)) continue;
        if (seen.has(gid)) continue;
        const nameEl = a.querySelector('span') || a;
        const name   = nameEl.textContent?.trim();
        if (!name || name.length < 2) continue;
        const url = href.startsWith('http') ? href : 'https://www.facebook.com' + href;
        seen.set(gid, { id: gid, name, url });
      }
      return Array.from(seen.values());
    });

    onLog(`Tìm thấy ${groups.length} nhóm.`);
    return { groups, error: null };
  } catch (err) {
    onLog('Lỗi tải nhóm: ' + err.message);
    return { error: err.message, groups: [] };
  }
}

module.exports = { ensureLoggedIn, fetchGroups, fetchGroupsForIdentity, getIdentities, runPostTask, clearSession, loginFacebook, SESSION_PATH };
