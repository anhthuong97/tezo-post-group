const { chromium } = require('playwright-core');
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const SESSION_PATH = path.join(app.getPath('userData'), 'fb-session.json');

let browser = null;

async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;
  // Kết nối vào Chromium của Electron qua CDP
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  return browser;
}

async function newContext() {
  const b = await ensureBrowser();
  const opts = fs.existsSync(SESSION_PATH)
    ? { storageState: SESSION_PATH, locale: 'vi-VN' }
    : { locale: 'vi-VN' };
  return b.newContext(opts);
}

function isLoggedOut(url) {
  return ['/login', '/checkpoint', '/two_step_verification', '/recover'].some(p => url.includes(p));
}

async function ensureLoggedIn(onNeedLogin) {
  const ctx  = await newContext();
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  if (isLoggedOut(page.url())) {
    // Cần đăng nhập — thông báo lên UI
    onNeedLogin(page);
    // Chờ user đăng nhập (tối đa 5 phút)
    await page.waitForFunction(
      () => !window.location.href.includes('/login') && !window.location.href.includes('/checkpoint'),
      { timeout: 5 * 60 * 1000 }
    );
    // Lưu session
    await ctx.storageState({ path: SESSION_PATH });
  }
  return { ctx, page };
}

async function postToGroup(page, groupUrl, content, imageUrls, onLog) {
  try {
    onLog(`Đang mở nhóm: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click vào ô tạo bài viết
    const postBox = page.locator('[data-pagelet="GroupInstrumentationUnit"] [role="button"]').first()
      .or(page.locator('div[aria-label*="Bạn đang nghĩ gì"]').first())
      .or(page.locator('div[aria-label*="Write something"]').first());

    await postBox.click({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Nhập nội dung
    const editor = page.locator('div[role="dialog"] div[contenteditable="true"]').first()
      .or(page.locator('div[contenteditable="true"]').first());
    await editor.click();
    await editor.type(content, { delay: 20 });
    await page.waitForTimeout(500);

    // Upload ảnh nếu có
    for (const imgUrl of (imageUrls || [])) {
      // Download ảnh về temp rồi upload
      // TODO: implement if needed
    }

    // Bấm đăng
    const postBtn = page.locator('div[role="dialog"] div[aria-label="Đăng"]')
      .or(page.locator('div[role="dialog"] div[aria-label="Post"]'))
      .or(page.locator('button:has-text("Đăng")'))
      .first();
    await postBtn.click({ timeout: 10000 });
    await page.waitForTimeout(3000);

    onLog(`✓ Đã đăng vào: ${groupUrl}`);
    return { success: true, url: groupUrl };
  } catch (err) {
    onLog(`✗ Lỗi tại ${groupUrl}: ${err.message}`);
    return { success: false, url: groupUrl, error: err.message };
  }
}

async function runPostTask(task, onLog, onNeedLogin) {
  const { groups, content, imageUrls, delayMin = 30, delayMax = 90 } = task.payload;
  const results = [];

  let ctx, page;
  try {
    ({ ctx, page } = await ensureLoggedIn(onNeedLogin));
  } catch (err) {
    return { error: 'Không thể đăng nhập Facebook: ' + err.message, results: [] };
  }

  for (let i = 0; i < groups.length; i++) {
    const result = await postToGroup(page, groups[i].url || groups[i], content, imageUrls, onLog);
    results.push(result);

    if (i < groups.length - 1) {
      const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      onLog(`Chờ ${Math.round(delay / 1000)}s trước nhóm tiếp theo...`);
      await page.waitForTimeout(delay);
    }
  }

  await ctx.close().catch(() => {});
  return { results };
}

function clearSession() {
  if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
  browser = null;
}

module.exports = { ensureLoggedIn, runPostTask, clearSession, SESSION_PATH };
