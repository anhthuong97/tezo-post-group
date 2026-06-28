const { chromium } = require('playwright-core');
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const SESSION_PATH = path.join(app.getPath('userData'), 'fb-session.json');

let browser = null;

async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  return browser;
}

async function getOrCreateContext() {
  const b        = await ensureBrowser();
  const contexts = b.contexts();
  if (contexts.length > 0) return contexts[0];
  const opts = fs.existsSync(SESSION_PATH)
    ? { storageState: SESSION_PATH, locale: 'vi-VN' }
    : { locale: 'vi-VN' };
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

async function loginFacebook(onLog) {
  onLog('Đang mở Facebook để đăng nhập...');
  try {
    const ctx   = await getOrCreateContext();
    const pages = ctx.pages();
    const page  = pages.length > 0 ? pages[0] : await ctx.newPage();
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!isLoggedOut(page.url())) {
      onLog('Đã đăng nhập Facebook rồi!');
      return { ok: true, alreadyLoggedIn: true };
    }
    onLog('Vui lòng đăng nhập Facebook trên cửa sổ vừa mở...');
    await page.waitForFunction(
      () => !window.location.href.includes('/login') && !window.location.href.includes('/checkpoint'),
      { timeout: 5 * 60 * 1000 }
    );
    await ctx.storageState({ path: SESSION_PATH });
    onLog('Đăng nhập Facebook thành công!');
    return { ok: true };
  } catch (err) {
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
    await page.waitForTimeout(1500);

    if (isLoggedOut(page.url())) return [];

    // Lấy tên trang cá nhân từ nav
    const personalName = await page.evaluate(() => {
      const nav = document.querySelector('[role="navigation"]') || document.body;
      const allLinks = Array.from(nav.querySelectorAll('a[href]'));
      for (const a of allLinks) {
        const href = a.getAttribute('href') || '';
        if (href === '/me/' || href === 'https://www.facebook.com/me' || href.includes('/profile.php')) {
          const span = a.querySelector('span');
          if (span?.textContent?.trim()) return span.textContent.trim();
        }
      }
      // Fallback: look for any span with a name-like value near profile area
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        const text = s.textContent?.trim();
        if (text && text.length > 1 && text.length < 40 && /[A-ZÀ-Ỹa-zà-ỹ]/.test(text)) {
          const parent = s.closest('a');
          if (parent?.getAttribute('aria-label')?.toLowerCase().includes('profile')) return text;
        }
      }
      return null;
    });

    const identities = [{ id: 'personal', name: personalName || 'Trang cá nhân', type: 'personal' }];

    // Lấy danh sách Page từ bookmarks
    try {
      await page.goto('https://www.facebook.com/bookmarks/pages', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const fbPages = await page.evaluate(() => {
        const results = [];
        const seen    = new Set();
        const SKIP    = ['/bookmarks', '/groups', '/home', '/friends', '/video', '/watch',
                         '/gaming', '/marketplace', '/ads', '/notifications', '/search',
                         '/events', '/messages', '/me', '/settings', '/help', '/privacy',
                         '/about', '/create', '/pages/creation', '/login', '/checkpoint'];

        const links = Array.from(document.querySelectorAll('a[href][role="link"], a[href]'));
        for (const el of links) {
          const href = el.getAttribute('href') || '';
          if (!href || href === '/') continue;
          if (SKIP.some(s => href.startsWith(s))) continue;

          const spans = el.querySelectorAll('span');
          let name = '';
          for (const s of spans) {
            const t = s.textContent?.trim();
            if (t && t.length > 1 && t.length < 100) { name = t; break; }
          }
          if (!name) continue;

          const profileMatch = href.match(/profile\.php\?id=(\d+)/);
          const slugMatch    = href.match(/^\/([^/?#]+)/);
          const id           = profileMatch ? profileMatch[1] : (slugMatch ? slugMatch[1] : null);
          if (!id || seen.has(id)) continue;
          seen.add(id);

          results.push({ id: `page_${id}`, name, href, type: 'page' });
          if (results.length >= 30) break;
        }
        return results;
      });

      identities.push(...fbPages);
      onLog?.(`Tìm thấy ${fbPages.length} Page`);
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
