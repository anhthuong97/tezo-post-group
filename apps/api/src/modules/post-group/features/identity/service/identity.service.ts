import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserService } from '../../facebook/infrastructure/browser.service';
import { UserSessionStore } from '../../facebook/infrastructure/user-session.store';

@Injectable()
export class IdentityService {
  constructor(
    private readonly browser: BrowserService,
    private readonly store: UserSessionStore,
  ) {}

  // Mở dropdown avatar — tìm nút trong banner có ảnh profile (svg image)
  // Trả về set các aria-label dialog đã tồn tại TRƯỚC khi click để xác định dialog mới
  private async openIdentitySwitcher(page: any): Promise<Set<string>> {
    // Ưu tiên: nút có svg image (ảnh profile tròn)
    let btn = page.locator('[role="banner"] [aria-haspopup]:has(svg image)').last();
    if ((await btn.count()) === 0) {
      btn = page.locator('[role="banner"] [aria-haspopup]:has(img[src])').last();
    }
    if ((await btn.count()) === 0) {
      btn = page.locator('[role="banner"] [aria-haspopup="dialog"]').last();
    }

    await btn.waitFor({ state: 'visible', timeout: 15000 });

    // Ghi nhận labels của các dialog ĐANG MỞ trước khi click
    const labelsBefore: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="dialog"]'))
        .map((d) => d.getAttribute('aria-label') ?? ''),
    );
    const existingLabels = new Set(labelsBefore);

    await btn.click();

    // Chờ xuất hiện dialog MỚI (label chưa có trước khi click)
    await page.waitForFunction(
      (before: string[]) => {
        const s = new Set(before);
        return Array.from(document.querySelectorAll('[role="dialog"]'))
          .some((d) => !s.has(d.getAttribute('aria-label') ?? ''));
      },
      labelsBefore,
      { timeout: 10000 },
    );
    await page.waitForTimeout(600);
    return existingLabels;
  }

  // Lấy tên identity hiện tại từ dialog avatar dropdown
  private async getCurrentIdentityName(page: any, existingLabels: Set<string>): Promise<string | null> {
    return page.evaluate((before: string[]) => {
      const existing = new Set(before);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const d = (dialogs.find((x) => !existing.has(x.getAttribute('aria-label') ?? ''))
        ?? dialogs[dialogs.length - 1]) as HTMLElement | null;
      if (!d) return null;

      const notHidden = (el: Element) => !el.closest('[aria-hidden="true"]');
      const notListitem = (el: Element) => !el.closest('[role="listitem"]');

      // Cách 1: a[href*="/me/"]
      for (const a of Array.from(d.querySelectorAll('a[href*="/me/"]')) as HTMLAnchorElement[]) {
        if (!notHidden(a)) continue;
        const span = a.querySelector('span[dir="auto"]') as HTMLElement | null;
        if (span?.innerText.trim()) return span.innerText.trim();
      }

      // Cách 2: a[href] dẫn đến profile Facebook (loại checkpoint/security/pin/messages...)
      const badPaths = /\/(checkpoint|login|security|settings|help|support|groups|events|pages|watch|marketplace|messages|notifications|privacy|pin)\b/i;
      for (const a of Array.from(d.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
        if (!notHidden(a) || !notListitem(a)) continue;
        try {
          const url = new URL(a.href);
          if (!url.hostname.includes('facebook.com')) continue;
          if (url.pathname === '/' || url.pathname === '') continue;
          if (badPaths.test(url.pathname)) continue;
          const span = a.querySelector('span[dir="auto"]') as HTMLElement | null;
          if (span?.innerText.trim()) return span.innerText.trim();
        } catch { continue; }
      }

      return null;
    }, Array.from(existingLabels));
  }

  private needsHomeNav(url: string): boolean {
    if (!url.includes('facebook.com')) return true;
    return /checkpoint|login|two.step|2fa|two_factor/i.test(url);
  }

  // Chuyển về tư cách cá nhân qua dropdown avatar (listitem đầu tiên trong dropdown)
  private async switchToPersonal(userId: number, page: any): Promise<void> {
    if (this.needsHomeNav(page.url())) {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    }

    let existingLabels: Set<string>;
    try {
      existingLabels = await this.openIdentitySwitcher(page);
    } catch {
      this.store.log(userId, 'Không tìm thấy nút avatar để chuyển về tư cách cá nhân.');
      return;
    }

    const currentName = await this.getCurrentIdentityName(page, existingLabels);
    const personalName = this.store.get(userId).personalIdentity;

    if (currentName === personalName) {
      await page.keyboard.press('Escape').catch(() => {});
      this.store.get(userId).activeIdentity = personalName;
      this.store.log(userId, `Đang ở tư cách cá nhân: "${personalName}"`);
      return;
    }

    // Tư cách cá nhân luôn là listitem ĐẦU TIÊN trong dropdown (sau tư cách đang dùng)
    const clicked = await page.evaluate((before: string[]) => {
      const existing = new Set(before);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const d = (dialogs.find((x) => !existing.has(x.getAttribute('aria-label') ?? ''))
        ?? dialogs[dialogs.length - 1]) as HTMLElement | null;
      if (!d) return false;
      // Tìm listitem đầu tiên có avatar (svg image) — đó là tư cách cá nhân
      const items = Array.from(d.querySelectorAll('[role="listitem"]'));
      for (const item of items) {
        if (!(item as HTMLElement).querySelector('svg image, img[src]')) continue;
        const clickable = (item as HTMLElement).querySelector('a, [role="button"]') as HTMLElement | null;
        if (clickable) { clickable.click(); return true; }
      }
      return false;
    }, Array.from(existingLabels));

    if (!clicked) {
      await page.keyboard.press('Escape').catch(() => {});
      return;
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    this.store.get(userId).activeIdentity = personalName;
    this.store.log(userId, `Đã chuyển về tư cách cá nhân: "${personalName}"`);
  }

  private async doSwitch(userId: number, targetName: string): Promise<void> {
    try {
      const page = await this.browser.ensurePage(userId);
      this.store.log(userId, `Chuyển sang tư cách: "${targetName}"...`);

      // Nếu chưa biết tư cách cá nhân (server restart) → load lại để có personalIdentity + pageUrlMap
      if (!this.store.get(userId).personalIdentity) {
        this.store.log(userId, 'Chưa có thông tin tư cách, đang tải lại...');
        await this.listIdentities(userId);
      }

      const s = this.store.get(userId);
      const isPersonal = targetName === s.personalIdentity;

      // --- Chuyển về tư cách CÁ NHÂN ---
      if (isPersonal) {
        await this.switchToPersonal(userId, page);
        return;
      }

      // --- Chuyển sang PAGE ---
      // Nếu pageUrlMap chưa có (server restart / chưa load) → tự load lại
      if (!s.pageUrlMap?.[targetName]) {
        this.store.log(userId, 'Chưa có danh sách tư cách, đang tải lại...');
        await this.listIdentities(userId);
      }

      const pageUrl = this.store.get(userId).pageUrlMap?.[targetName];
      if (!pageUrl) {
        this.store.log(userId, `Không tìm thấy URL cho "${targetName}" sau khi reload.`);
        return;
      }

      // Bắt buộc về tư cách cá nhân trước — chỉ từ cá nhân mới có nút "Chuyển ngay" trên page
      if (this.store.get(userId).activeIdentity !== this.store.get(userId).personalIdentity) {
        this.store.log(userId, 'Chuyển về tư cách cá nhân trước...');
        await this.switchToPersonal(userId, page);
      }

      // Navigate vào trang page
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      this.dbg(userId, 'switch-01-page', await page.content());

      // Tìm nút "Chuyển ngay" trong [role="main"]
      // Card đặc trưng: [data-visualcompletion="css-img"] + span[dir="auto"] trong cùng ancestor ≤4 cấp
      const dialogsBefore: string[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => d.getAttribute('aria-label') ?? ''),
      );

      const clicked = await page.evaluate(() => {
        const main = document.querySelector('[role="main"]') as HTMLElement | null;
        if (!main) return false;
        for (const btn of Array.from(main.querySelectorAll('[role="button"]')) as HTMLElement[]) {
          if (!btn.innerText?.trim()) continue;
          let el: HTMLElement | null = btn;
          let found = false;
          for (let i = 0; i < 4; i++) {
            el = el?.parentElement as HTMLElement | null;
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
      });

      if (!clicked) {
        this.store.log(userId, 'Không tìm thấy nút "Chuyển ngay" — lưu HTML để debug.');
        this.dbg(userId, 'switch-02-notfound', await page.content());
        return;
      }

      // Chờ modal xác nhận và click confirm
      await page.waitForFunction(
        (before: string[]) => {
          const s = new Set(before);
          return Array.from(document.querySelectorAll('[role="dialog"]')).some(
            (d) => !s.has(d.getAttribute('aria-label') ?? ''),
          );
        },
        dialogsBefore,
        { timeout: 8000 },
      ).catch(() => {});
      await page.waitForTimeout(800);

      await page.evaluate((before: string[]) => {
        const s = new Set(before);
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        const modal = (dialogs.find((d) => !s.has(d.getAttribute('aria-label') ?? ''))
          ?? dialogs[dialogs.length - 1]) as HTMLElement | null;
        if (!modal) return;
        const btn = Array.from(modal.querySelectorAll('[role="button"]'))
          .find((b) => (b as HTMLElement).innerText?.trim().length > 0) as HTMLElement | null;
        btn?.click();
      }, dialogsBefore);

      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);

      s.activeIdentity = targetName;
      this.store.log(userId, `Đã chuyển sang: "${targetName}"`);
      page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    } catch (err: any) {
      this.store.log(userId, `Lỗi khi chuyển tư cách: ${err.message}`);
    }
  }

  async switchIdentity(userId: number, targetName: string): Promise<void> {
    const s = this.store.get(userId);
    s.selectedIdentity = targetName;
    s.activeIdentity = null;
    await this.doSwitch(userId, targetName);
  }

  async ensureIdentity(userId: number): Promise<void> {
    const s = this.store.get(userId);
    const selected = s.selectedIdentity;
    if (!selected) {
      this.store.log(userId, '[identity] Chưa chọn tư cách — bỏ qua.');
      return;
    }
    if (s.activeIdentity === selected) {
      this.store.log(userId, `[identity] Đang dùng đúng tư cách "${selected}" — bỏ qua.`);
      return;
    }
    await this.doSwitch(userId, selected);
  }

  private dbg(userId: number, name: string, html: string): void {
    try {
      fs.writeFileSync(
        path.join(process.cwd(), 'sessions', String(userId), `debug-${name}.html`),
        html, 'utf-8',
      );
    } catch {}
  }

  async listIdentities(userId: number): Promise<{ current: string | null; switchable: string[] }> {
    const empty = { current: null, switchable: [] as string[] };
    try {
      const page = await this.browser.ensurePage(userId);
      this.store.log(userId, 'Đang lấy danh sách tư cách...');

      // 1. Lấy tên tư cách cá nhân qua dropdown avatar
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      let current: string | null = null;
      try {
        const listLabels = await this.openIdentitySwitcher(page);
        current = await this.getCurrentIdentityName(page, listLabels);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape').catch(() => {});
      } catch {}

      // 2. Vào trang quản lý tất cả pages để lấy đầy đủ danh sách
      this.store.log(userId, 'Đang tải danh sách trang từ pages manager...');
      await page.goto('https://www.facebook.com/pages/?category=your_pages&ref=bookmarks', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2500);
      this.dbg(userId, 'pages-list', await page.content());

      // 3. Cuộn xuống để load hết trang (scroll loop)
      for (let i = 0; i < 15; i++) {
        const prevHeight: number = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1200);
        const newHeight: number = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break;
      }
      this.dbg(userId, 'pages-list-scrolled', await page.content());

      // 4. Trích xuất tên + URL của từng trang
      // Chỉ lấy trong [role="main"] để loại sidebar/navigation
      // Card trang: <a href="/page-url"><span dir="auto">Tên trang</span></a>
      // Avatar và tên nằm trong 2 <a> khác nhau → không thể dùng "card có image" để filter
      // Thay vào đó: link phải có span[dir="auto"] trực tiếp bên trong + URL không phải menu
      const pages: { name: string; url: string }[] = await page.evaluate(() => {
        const results: { name: string; url: string }[] = [];
        const seen = new Set<string>();
        const main = document.querySelector('[role="main"]') ?? document.body;

        const isMenuPath = (u: URL) => {
          if (!u.hostname.includes('facebook.com')) return true;
          const p = u.pathname;
          if (p === '/' || p.length < 2) return true;
          return /^\/(pages(\/|$)|settings|help|groups|events|watch|marketplace|checkpoint|login|notifications|messages|privacy|reels|gaming|fundraisers|offers|jobs|professional_dashboard|ads)(\/|$)/i.test(p);
        };

        for (const a of Array.from(main.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
          try {
            const u = new URL(a.href);
            if (isMenuPath(u)) continue;

            // Link có aria-label = nút action (Tạo bài viết, Quảng cáo...) → bỏ qua
            if (a.getAttribute('aria-label')) continue;

            // Bỏ qua các href có query param (modal=, action=, ref=...) trừ profile.php?id=
            if (u.pathname !== '/profile.php' && u.search) continue;

            const cleanUrl = u.pathname === '/profile.php' && u.searchParams.get('id')
              ? `${u.origin}/profile.php?id=${u.searchParams.get('id')}`
              : `${u.origin}${u.pathname}`.replace(/\/$/, '');

            // Link tên trang phải chứa span[dir="auto"]
            const span = a.querySelector('span[dir="auto"]') as HTMLElement | null;
            const name = span?.innerText?.trim();
            if (!name || name.length < 2 || seen.has(name)) continue;

            seen.add(name);
            results.push({ name, url: cleanUrl });
          } catch { continue; }
        }
        return results;
      });

      this.store.log(userId, `Tìm thấy ${pages.length} trang: ${pages.map((p) => p.name).join(', ')}`);

      // 5. Lưu URL map + tư cách cá nhân vào session
      const s = this.store.get(userId);
      s.pageUrlMap = {};
      for (const p of pages) s.pageUrlMap[p.name] = p.url;
      if (current) s.personalIdentity = current;

      // 6. Quay về trang chủ
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

      if (current) s.activeIdentity = current;
      const switchable = pages.map((p) => p.name);
      this.store.log(userId, `Tư cách hiện tại: ${current || '?'} | Có thể chuyển: ${switchable.join(', ') || 'không có'}`);
      return { current, switchable };
    } catch (err) {
      this.store.log(userId, `Lỗi khi lấy tư cách: ${(err as Error).message}`);
      return empty;
    }
  }
}
