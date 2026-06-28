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

module.exports = { ensureLoggedIn, fetchGroups, runPostTask, clearSession, SESSION_PATH };
