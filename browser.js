const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');

let browser, context, page;

const state = {
  loggedIn: false,
  log: [],
  postStatus: [],
};

function log(msg) {
  console.log(msg);
  state.log.push(`[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`);
}

async function ensureBrowser() {
  // `browser` being truthy only means we launched one before — if the user
  // closed that window (or it crashed), it's still set but disconnected, so
  // we'd otherwise hand back a dead `page` that fails on the next goto().
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: false });
    const hasSavedSession = fs.existsSync(AUTH_FILE);
    context = await browser.newContext({
      locale: 'vi-VN',
      ...(hasSavedSession ? { storageState: AUTH_FILE } : {}),
    });
    page = await context.newPage();
    if (hasSavedSession) {
      log('Đã nạp lại session đăng nhập đã lưu trước đó.');
    }
  } else if (!page || page.isClosed()) {
    // Browser is still alive but the tab itself was closed — open a new one.
    page = await context.newPage();
  }
  return page;
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNAUTHENTICATED_URL_PATTERNS = ['/login', '/checkpoint', '/two_step_verification', '/recover', '/captcha'];

function looksLoggedOut(urlStr) {
  let pathname;
  try {
    pathname = new URL(urlStr).pathname;
  } catch {
    pathname = urlStr;
  }
  return UNAUTHENTICATED_URL_PATTERNS.some((p) => pathname.includes(p));
}

function hasSavedSession() {
  return fs.existsSync(AUTH_FILE);
}

async function openLoginPage() {
  const page = await ensureBrowser();
  log('Đã mở cửa sổ Facebook. Hãy tự đăng nhập bằng tay (nhập email/password, mã 2FA, xử lý captcha nếu có) như bình thường, KHÔNG cần làm gì trong app này lúc này.');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
}

async function confirmLogin() {
  const page = await ensureBrowser();
  const url = page.url();
  if (looksLoggedOut(url)) {
    throw new Error(`Có vẻ bạn chưa đăng nhập xong (đang ở: ${url}). Hãy hoàn tất đăng nhập trong cửa sổ trình duyệt rồi bấm lại.`);
  }
  state.loggedIn = true;
  await context.storageState({ path: AUTH_FILE });
  log('Đã xác nhận đăng nhập thành công và lưu session.');
}

async function listGroups() {
  const page = await ensureBrowser();
  log('Đang lấy danh sách group...');
  await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 2000);
    // Facebook renders the group name immediately but loads the "last
    // active" caption for newly-scrolled-in rows via a separate request —
    // 800ms wasn't enough for that to land, which is why only the rows
    // visible before any scrolling (already fully loaded) had it.
    await page.waitForTimeout(1500);
  }

  // Let any still-in-flight requests for those captions settle before reading the DOM.
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
      // innerText (unlike textContent) inserts line breaks between visually
      // stacked lines, so the group name and the "last active" caption below
      // it come back as separate lines instead of one merged string.
      const lines = a.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      const name = lines[0] || '';
      const meta = lines.slice(1).join(' • ');
      if (!name) continue;
      // A group's row can have several links (avatar, name, member count...).
      // Keep whichever candidate has the most lines of text — that's the one
      // that actually includes the "last active" caption, not a partial link.
      const existing = seen.get(id);
      if (!existing || lines.length > existing.lineCount) {
        seen.set(id, { id, name, meta, url: `https://www.facebook.com/groups/${id}`, lineCount: lines.length });
      }
    }
    return Array.from(seen.values()).map(({ lineCount, ...g }) => g);
  });

  log(`Tìm thấy ${groups.length} group.`);
  return groups;
}

async function openGroupUrl(url) {
  const page = await ensureBrowser();
  log(`Mở group trong trình duyệt tự động: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

// The top-right avatar button opens Facebook's account switcher: its first
// item is whichever identity (personal profile or a Page) is currently
// active, and every other identity you can switch to shows up with an
// aria-label of "Chuyển sang <name>".
async function openIdentitySwitcher(page) {
  const avatarBtn = page.locator('[aria-label="Trang cá nhân của bạn"]').first();
  await avatarBtn.waitFor({ state: 'visible', timeout: 15000 });
  await avatarBtn.click();
  await page.waitForTimeout(1200);
}

async function listIdentities() {
  const page = await ensureBrowser();
  log('Đang lấy danh sách danh tính (trang cá nhân / Trang) có thể đăng bài...');
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
      const ariaLabel = el.getAttribute('aria-label') || '';
      const m = ariaLabel.match(/^Chuyển sang (.+)$/);
      if (m) switchable.push(m[1].trim());
    }
    return { current, switchable };
  });

  await page.keyboard.press('Escape');
  log(`Danh tính hiện tại: ${result.current || '(không xác định)'}. Có thể chuyển sang: ${result.switchable.join(', ') || '(không có)'}.`);
  return result;
}

async function switchIdentity(targetName) {
  const page = await ensureBrowser();
  log(`Đang chuyển danh tính đăng bài sang: ${targetName}...`);
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await openIdentitySwitcher(page);

  const switchBtn = page.getByRole('button', { name: `Chuyển sang ${targetName}` }).first();
  if ((await switchBtn.count()) === 0) {
    await page.keyboard.press('Escape');
    log(`Đang dùng danh tính "${targetName}" rồi, hoặc không tìm thấy lựa chọn để chuyển.`);
    return;
  }
  await switchBtn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(3000);
  log(`Đã chuyển sang đăng với tên: ${targetName}.`);
}

function cancelGroup(url) {
  const item = state.postStatus.find((g) => g.url === url);
  if (item && (item.status === 'pending' || item.status === 'processing')) {
    item.status = 'cancelled';
    log(`Đã hủy group: ${item.name}`);
  }
}

function cancelAllPending() {
  let count = 0;
  for (const item of state.postStatus) {
    if (item.status === 'pending' || item.status === 'processing') {
      item.status = 'cancelled';
      count++;
    }
  }
  if (count > 0) log(`Đã hủy ${count} group còn lại.`);
}

async function getPostLink(page, postHeadline) {
  try {
    await page.waitForTimeout(1500);
    const searchText = (postHeadline || '').slice(0, 30);
    const link = await page.evaluate((text) => {
      const storyDivs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
      let target = null;
      for (const sd of storyDivs) {
        if (sd.textContent.includes(text)) { target = sd; break; }
      }
      if (!target) return null;
      let el = target;
      for (let i = 0; i < 25; i++) {
        el = el.parentElement;
        if (!el) break;
        for (const a of el.querySelectorAll('a[href*="/posts/"]')) {
          if (a.href.includes('/posts/')) return a.href.split('?')[0];
        }
      }
      return null;
    }, searchText);
    if (link) log(`  Link bài: ${link}`);
    return link || null;
  } catch (err) {
    log(`  Không lấy được link bài: ${err.message}`);
    return null;
  }
}

async function commentOnPost(page, commentText, postHeadline) {
  try {
    log('  Đang tìm bài vừa đăng để comment...');
    await page.waitForTimeout(3000);

    const searchText = (postHeadline || '').slice(0, 30);
    let commentBox;

    if (searchText) {
      // Find the post via data-ad-rendering-role="story_message" (Facebook's post text container),
      // then walk up the DOM until we reach a container that also holds the comment textbox.
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

      const found = await handle.evaluate((el) => el !== null);
      if (found) {
        commentBox = handle.asElement();
        log(`  Tìm thấy ô comment của bài: "${searchText}..."`);
      }
    }

    // Fallback: first comment box on page (newest post is at top)
    if (!commentBox) {
      log('  Dùng ô comment đầu tiên trên trang...');
      commentBox = page.locator('[role="textbox"][data-lexical-editor="true"]').first();
    }

    await commentBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await commentBox.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(commentText, { delay: 20 + Math.floor(Math.random() * 30) });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    log(`  ✓ Đã comment: ${commentText}`);
  } catch (err) {
    log(`  Không comment được: ${err.message}`);
  }
}

async function postToGroups({ groups, content, imagePaths, productLink }) {
  const page = await ensureBrowser();

  state.postStatus = groups.map((g) => ({ url: g.url, name: g.name, status: 'pending', message: '' }));

  for (let i = 0; i < groups.length; i++) {
    const groupUrl = groups[i].url;

    // Cancelled before its turn even started (single cancel or "cancel all") — skip outright.
    if (state.postStatus[i].status === 'cancelled') {
      log(`Bỏ qua group đã hủy: ${groups[i].name}`);
      continue;
    }

    // Marks the group the loop is actively working on right now, so the UI
    // can highlight it — distinct from "pending" (hasn't started yet).
    state.postStatus[i].status = 'processing';

    try {
      log(`Mở group: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
      await randomDelay(2500, 5000);

      // Re-check between major steps so cancelling mid-flight (but before the
      // final "Đăng" click) still takes effect instead of posting anyway.
      if (state.postStatus[i].status === 'cancelled') {
        log(`Đã hủy giữa lúc xử lý, bỏ qua group: ${groups[i].name}`);
        continue;
      }

      const composerTrigger = page.getByRole('button', { name: /viết gì|write something/i }).first();
      await composerTrigger.waitFor({ state: 'visible', timeout: 20000 });
      await composerTrigger.click();
      await randomDelay(1000, 2000);

      // The element with role="dialog" only wraps the modal header in this FB layout —
      // the textbox/toolbar/post button are siblings, not descendants — so we query the
      // page directly instead of scoping to that dialog element.
      const dialogHeader = page.getByRole('dialog').last();
      await dialogHeader.waitFor({ state: 'visible', timeout: 15000 });

      if (imagePaths && imagePaths.length > 0) {
        log(`  Đang gắn ${imagePaths.length} ảnh vào bài viết...`);
        const photoBtn = page.locator('[aria-label="Ảnh/video"]:visible').last();
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 15000 }),
          photoBtn.click(),
        ]);
        await fileChooser.setFiles(imagePaths);
        log('  Đang chờ ảnh tải lên xong...');
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await randomDelay(2000, 4000);
      }

      if (content) {
        const textbox = page.getByRole('textbox').last();
        await textbox.click();
        await page.keyboard.type(content, { delay: 30 + Math.floor(Math.random() * 40) });
        await randomDelay(1000, 2000);
      }

      if (state.postStatus[i].status === 'cancelled') {
        log(`Đã hủy ngay trước khi đăng, bỏ qua group: ${groups[i].name}`);
        continue;
      }

      const postButton = page.getByRole('button', { name: /^đăng$|^post$/i }).last();
      await postButton.waitFor({ state: 'visible', timeout: 15000 });
      await postButton.click();

      // The dialog only closes once Facebook actually accepts the post; if it
      // stays open (validation error, still uploading, etc.) treat it as a failure.
      await dialogHeader.waitFor({ state: 'hidden', timeout: 20000 });

      log(`✓ Đã đăng vào group ${i + 1}/${groups.length}`);

      const postHeadline = (content || '').split('\n')[0].trim();

      // Lấy link bài vừa đăng (áp dụng cho mọi loại bài)
      const capturedLink = await getPostLink(page, postHeadline);
      if (capturedLink) state.postStatus[i].postLink = capturedLink;

      if (productLink) {
        state.postStatus[i].status = 'commenting';
        await commentOnPost(page, `ĐẶT HÀNG NGAY TẠI LINK: ${productLink}`, postHeadline);
      }

      state.postStatus[i].status = 'success';
      state.postStatus[i].doneAt = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
      await randomDelay(4000, 7000);
    } catch (err) {
      log(`✗ Lỗi ở group ${groupUrl}: ${err.message}`);
      // Don't clobber a cancellation that happened to land while this group errored out.
      if (state.postStatus[i].status !== 'cancelled') {
        state.postStatus[i].status = 'error';
        state.postStatus[i].message = err.message;
      }
    }

    if (i < groups.length - 1) {
      const waitMs = 15000 + Math.random() * 30000;
      log(`Nghỉ ${Math.round(waitMs / 1000)}s trước group tiếp theo...`);
      await randomDelay(waitMs, waitMs);
    }
  }

  log('Hoàn tất đăng bài.');
}

module.exports = {
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
  state,
};
