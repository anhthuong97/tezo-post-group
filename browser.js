const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// One shared Chromium instance; each user gets an isolated browser context.
let sharedBrowser = null;

// Map<userId, { context, page, loggedIn, log, postStatus }>
const userSessions = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFbAuthFile(userId) {
  const dir = path.join(SESSIONS_DIR, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'fb.json');
}

function getUserState(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { context: null, page: null, loggedIn: false, log: [], postStatus: [] });
  }
  return userSessions.get(userId);
}

function log(userId, msg) {
  console.log(`[U${userId}] ${msg}`);
  const s = getUserState(userId);
  s.log.push(`[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`);
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
  return new Promise((r) => setTimeout(r, ms));
}

const UNAUTHENTICATED_PATTERNS = ['/login', '/checkpoint', '/two_step_verification', '/recover', '/captcha'];
function looksLoggedOut(url) {
  try { url = new URL(url).pathname; } catch {}
  return UNAUTHENTICATED_PATTERNS.some((p) => url.includes(p));
}

// ─── Browser / Context ────────────────────────────────────────────────────────

async function ensureSharedBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    const headless = process.env.HEADLESS !== 'false';
    sharedBrowser = await chromium.launch({
      headless,
      args: headless ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    console.log(`[Browser] Khởi động Chromium (headless=${headless})`);
  }
  return sharedBrowser;
}

async function ensurePage(userId) {
  const s = getUserState(userId);

  // Validate existing context
  if (s.context) {
    try { s.context.pages(); } catch { s.context = null; s.page = null; }
  }
  if (s.page?.isClosed()) s.page = null;
  if (s.context && s.page) return s.page;

  const browser = await ensureSharedBrowser();
  const authFile = getFbAuthFile(userId);

  if (!s.context) {
    s.context = await browser.newContext({
      locale: 'vi-VN',
      ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
    });
    if (fs.existsSync(authFile)) log(userId, 'Đã nạp session Facebook đã lưu.');
  }

  s.page = await s.context.newPage();
  return s.page;
}

function destroyUserSession(userId) {
  const s = userSessions.get(userId);
  if (s?.context) {
    s.context.close().catch(() => {});
  }
  userSessions.delete(userId);
}

function logoutFacebook(userId) {
  destroyUserSession(userId);
  const authFile = getFbAuthFile(userId);
  if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
}

// ─── Identity switcher ────────────────────────────────────────────────────────

async function openIdentitySwitcher(page) {
  const btn = page.locator('[aria-label="Trang cá nhân của bạn"]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(1200);
}

// ─── Public API ───────────────────────────────────────────────────────────────

function hasSavedSession(userId) {
  return fs.existsSync(getFbAuthFile(userId));
}

async function openLoginPage(userId) {
  const page = await ensurePage(userId);
  log(userId, 'Đã mở cửa sổ Facebook. Hãy tự đăng nhập bằng tay rồi bấm Xác nhận trong app.');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
}

async function confirmLogin(userId) {
  const page = await ensurePage(userId);
  const url = page.url();
  if (looksLoggedOut(url)) {
    throw new Error(`Có vẻ chưa đăng nhập xong (đang ở: ${url}).`);
  }
  const s = getUserState(userId);
  s.loggedIn = true;
  await s.context.storageState({ path: getFbAuthFile(userId) });
  log(userId, 'Đã xác nhận đăng nhập và lưu session.');
}

async function listGroups(userId) {
  const page = await ensurePage(userId);
  log(userId, 'Đang lấy danh sách group...');
  await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(1500);
  }

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const groups = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
    const seen = new Map();
    for (const a of links) {
      const href = a.getAttribute('href');
      const match = href && href.match(/\/groups\/([^/?]+)/);
      if (!match) continue;
      const id = match[1];
      if (['joins', 'feed', 'discover', 'create'].includes(id)) continue;
      const lines = a.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      const name = lines[0] || '';
      const meta = lines.slice(1).join(' • ');
      if (!name) continue;
      const existing = seen.get(id);
      if (!existing || lines.length > existing.lineCount) {
        seen.set(id, { id, name, meta, url: `https://www.facebook.com/groups/${id}`, lineCount: lines.length });
      }
    }
    return Array.from(seen.values()).map(({ lineCount, ...g }) => g);
  });

  log(userId, `Tìm thấy ${groups.length} group.`);
  return groups;
}

async function openGroupUrl(userId, url) {
  const page = await ensurePage(userId);
  log(userId, `Mở group: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function listIdentities(userId) {
  const page = await ensurePage(userId);
  log(userId, 'Đang lấy danh sách danh tính...');
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await openIdentitySwitcher(page);

  const result = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return { current: null, switchable: [] };
    const items = Array.from(dialog.querySelectorAll('[role="button"], a[role="link"]'));
    const current = items[0] ? items[0].innerText.replace(/\s+/g, ' ').trim() : null;
    const switchable = [];
    for (const el of items) {
      const m = (el.getAttribute('aria-label') || '').match(/^Chuyển sang (.+)$/);
      if (m) switchable.push(m[1].trim());
    }
    return { current, switchable };
  });

  await page.keyboard.press('Escape');
  log(userId, `Danh tính: ${result.current || '?'} | Chuyển được: ${result.switchable.join(', ') || 'không có'}`);
  return result;
}

async function switchIdentity(userId, targetName) {
  const page = await ensurePage(userId);
  log(userId, `Chuyển danh tính sang: ${targetName}...`);
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await openIdentitySwitcher(page);

  const btn = page.getByRole('button', { name: `Chuyển sang ${targetName}` }).first();
  if ((await btn.count()) === 0) {
    await page.keyboard.press('Escape');
    log(userId, `Đang dùng danh tính "${targetName}" rồi hoặc không tìm thấy.`);
    return;
  }
  await btn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(3000);
  log(userId, `Đã chuyển sang: ${targetName}.`);
}

function cancelGroup(userId, url) {
  const s = getUserState(userId);
  const item = s.postStatus.find((g) => g.url === url);
  if (item && ['pending', 'processing'].includes(item.status)) {
    item.status = 'cancelled';
    log(userId, `Đã hủy group: ${item.name}`);
  }
}

function cancelAllPending(userId) {
  const s = getUserState(userId);
  let count = 0;
  for (const item of s.postStatus) {
    if (['pending', 'processing'].includes(item.status)) {
      item.status = 'cancelled';
      count++;
    }
  }
  if (count > 0) log(userId, `Đã hủy ${count} group còn lại.`);
}

// ─── Post helpers ─────────────────────────────────────────────────────────────

async function getPostLink(page, postHeadline, userId) {
  try {
    const text = (postHeadline || '').slice(0, 25);
    const isPostHref = (href) =>
      href && (href.includes('/posts/') || href.includes('/permalink/') || href.includes('story_fbid'));

    // Wait up to 8s for the post to appear in the feed
    try {
      await page.waitForFunction(
        (t) => {
          const divs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
          return Array.from(divs).some((d) => d.textContent.includes(t));
        },
        text,
        { timeout: 8000 }
      );
    } catch { /* not found by text — try fallback */ }

    await page.waitForTimeout(1000);

    const result = await page.evaluate(({ t }) => {
      const isPostHref = (href) =>
        href && (href.includes('/posts/') || href.includes('/permalink/') || href.includes('story_fbid'));

      const storyDivs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
      let target = null;
      for (const sd of storyDivs) {
        if (sd.textContent.includes(t)) { target = sd; break; }
      }
      if (!target && storyDivs.length > 0) target = storyDivs[0];

      const nearbyHrefs = [];
      if (target) {
        let el = target;
        for (let i = 0; i < 35; i++) {
          el = el.parentElement;
          if (!el) break;
          for (const a of el.querySelectorAll('a[href]')) {
            const h = a.href;
            if (h && h.includes('facebook.com') && !h.includes('/groups/joins') && nearbyHrefs.length < 10)
              nearbyHrefs.push(h.split('?')[0]);
            if (isPostHref(h)) return { link: h.split('?')[0], method: 'story' };
          }
        }
      }

      for (const a of document.querySelectorAll('a[href]')) {
        if (isPostHref(a.href) && a.href.includes('facebook.com')) {
          return { link: a.href.split('?')[0], method: 'page' };
        }
      }
      return { link: null, storyCount: storyDivs.length, nearbyHrefs };
    }, { t: text });

    if (userId) log(userId, `  getPostLink: ${JSON.stringify(result)}`);
    return result.link || null;
  } catch (err) {
    if (userId) log(userId, `  getPostLink lỗi: ${err.message}`);
    return null;
  }
}

async function commentOnPost(page, commentText, postHeadline) {
  try {
    await page.waitForTimeout(3000);
    const searchText = (postHeadline || '').slice(0, 30);
    let commentBox;

    if (searchText) {
      const handle = await page.evaluateHandle((text) => {
        const storyDivs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
        let target = null;
        for (const sd of storyDivs) {
          if (sd.textContent.includes(text)) { target = sd; break; }
        }
        if (!target) return null;
        let el = target;
        for (let i = 0; i < 30; i++) {
          el = el.parentElement;
          if (!el) break;
          const box = el.querySelector('[role="textbox"][data-lexical-editor="true"]');
          if (box) return box;
        }
        return null;
      }, searchText);

      if (await handle.evaluate((el) => el !== null)) {
        commentBox = handle.asElement();
      }
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
  } catch (err) {
    console.error(`commentOnPost error: ${err.message}`);
  }
}

// ─── Main post function ───────────────────────────────────────────────────────

async function postToGroups(userId, { groups, content, imagePaths, productLink }) {
  const page = await ensurePage(userId);
  const s = getUserState(userId);

  s.postStatus = groups.map((g) => ({ url: g.url, name: g.name, status: 'pending', message: '' }));

  for (let i = 0; i < groups.length; i++) {
    if (s.postStatus[i].status === 'cancelled') {
      log(userId, `Bỏ qua group đã hủy: ${groups[i].name}`);
      continue;
    }

    s.postStatus[i].status = 'processing';

    try {
      log(userId, `Mở group: ${groups[i].url}`);
      await page.goto(groups[i].url, { waitUntil: 'domcontentloaded' });
      await randomDelay(2500, 5000);

      if (s.postStatus[i].status === 'cancelled') continue;

      const composerTrigger = page.getByRole('button', { name: /viết gì|write something/i }).first();
      await composerTrigger.waitFor({ state: 'visible', timeout: 20000 });
      await composerTrigger.click();
      await randomDelay(1000, 2000);

      const dialogHeader = page.getByRole('dialog').last();
      await dialogHeader.waitFor({ state: 'visible', timeout: 15000 });

      if (imagePaths?.length > 0) {
        log(userId, `  Gắn ${imagePaths.length} ảnh...`);
        const photoBtn = page.locator('[aria-label="Ảnh/video"]:visible').last();
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 15000 }),
          photoBtn.click(),
        ]);
        await fileChooser.setFiles(imagePaths);
        log(userId, '  Chờ ảnh tải xong...');
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await randomDelay(2000, 4000);
      }

      if (content) {
        const textbox = page.getByRole('textbox').last();
        await textbox.click();
        await page.keyboard.type(content, { delay: 30 + Math.floor(Math.random() * 40) });
        await randomDelay(1000, 2000);
      }

      if (s.postStatus[i].status === 'cancelled') continue;

      const postBtn = page.getByRole('button', { name: /^đăng$|^post$/i }).last();
      await postBtn.waitFor({ state: 'visible', timeout: 15000 });

      // Intercept GraphQL response to capture post ID before clicking
      let capturedPostId = null;
      const responseHandler = async (response) => {
        if (capturedPostId) return;
        if (!response.url().includes('graphql')) return;
        try {
          const text = await response.text();
          // Match story_id, post_id, or node_id patterns
          const m = text.match(/"story_id"\s*:\s*"(\d+)"/) ||
                    text.match(/"post_id"\s*:\s*"(\d+)"/) ||
                    text.match(/"id"\s*:\s*"(\d{15,})"/) ;
          if (m) capturedPostId = m[1];
        } catch {}
      };
      page.on('response', responseHandler);

      await postBtn.click();
      await dialogHeader.waitFor({ state: 'hidden', timeout: 20000 });

      // Wait a moment for GraphQL response to arrive
      await page.waitForTimeout(2000);
      page.off('response', responseHandler);

      log(userId, `✓ Đã đăng vào group ${i + 1}/${groups.length}`);

      const postHeadline = (content || '').split('\n')[0].trim();
      const groupId = (groups[i].url.match(/groups\/(\d+)/) || [])[1];

      let capturedLink = null;
      if (capturedPostId && groupId) {
        capturedLink = `https://www.facebook.com/groups/${groupId}/posts/${capturedPostId}/`;
        log(userId, `  Link bài: ${capturedLink}`);
      } else {
        // Fallback to DOM scraping
        capturedLink = await getPostLink(page, postHeadline, userId);
      }
      if (capturedLink) s.postStatus[i].postLink = capturedLink;

      if (productLink) {
        s.postStatus[i].status = 'commenting';
        log(userId, '  Đang viết comment link...');
        await commentOnPost(page, `ĐẶT HÀNG NGAY TẠI LINK: ${productLink}`, postHeadline);
      }

      s.postStatus[i].status = 'success';
      s.postStatus[i].doneAt = new Date().toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
      });

      await randomDelay(4000, 7000);
    } catch (err) {
      log(userId, `✗ Lỗi ở group ${groups[i].url}: ${err.message}`);
      if (s.postStatus[i].status !== 'cancelled') {
        s.postStatus[i].status = 'error';
        s.postStatus[i].message = err.message;
      }
    }

    if (i < groups.length - 1) {
      const waitMs = 15000 + Math.random() * 30000;
      log(userId, `Nghỉ ${Math.round(waitMs / 1000)}s trước group tiếp theo...`);
      await randomDelay(waitMs, waitMs);
    }
  }

  log(userId, 'Hoàn tất đăng bài.');
}

module.exports = {
  getUserState,
  destroyUserSession,
  hasSavedSession,
  openLoginPage,
  confirmLogin,
  listGroups,
  openGroupUrl,
  postToGroups,
  cancelGroup,
  cancelAllPending,
  listIdentities,
  switchIdentity,
  logoutFacebook,
};
