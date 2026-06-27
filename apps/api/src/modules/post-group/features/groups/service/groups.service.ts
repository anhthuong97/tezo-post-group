import { Injectable } from '@nestjs/common';
import { BrowserService } from '../../facebook/infrastructure/browser.service';
import { UserSessionStore } from '../../facebook/infrastructure/user-session.store';
import { IdentityService } from '../../identity/service/identity.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly browser: BrowserService,
    private readonly store: UserSessionStore,
    private readonly identity: IdentityService,
  ) {}

  async listGroups(userId: number): Promise<any[]> {
    const page = await this.browser.ensurePage(userId);

    this.store.log(userId, 'Đang tải danh sách nhóm...');
    await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Check tư cách ngay tại trang này — không cần vào home trước
    await this.identity.ensureIdentity(userId);

    // Nếu vừa chuyển tư cách, FB có thể đã redirect sang trang khác
    if (!page.url().includes('/groups/joins')) {
      await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
    }

    // Scroll cho đến khi không xuất hiện thêm item mới (tối đa 10 lần)
    let prevCount = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const currentCount = await page.evaluate(() =>
        document.querySelectorAll('a[href*="/groups/"]').length
      );
      if (currentCount === prevCount) break;
      prevCount = currentCount;
    }

    const groups = await page.evaluate(() => {
      const NAV_IDS = ['joins', 'feed', 'discover', 'create'];
      const links   = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
      const seen    = new Map<string, any>();

      for (const a of links) {
        const href  = a.getAttribute('href');
        const match = href && href.match(/\/groups\/([^/?]+)/);
        if (!match) continue;
        const id = match[1];
        if (NAV_IDS.includes(id)) continue;

        const lines = (a as HTMLElement).innerText
          .split('\n').map((s: string) => s.trim()).filter(Boolean);
        const name = lines[0] || '';
        const meta = lines.slice(1).join(' • ');
        if (!name) continue;

        const existing = seen.get(id);
        if (!existing || lines.length > existing.lineCount) {
          seen.set(id, {
            id, name, meta,
            url: `https://www.facebook.com/groups/${id}`,
            lineCount: lines.length,
          });
        }
      }

      return Array.from(seen.values()).map(({ lineCount, ...g }) => g);
    });

    this.store.log(userId, `Tìm thấy ${groups.length} nhóm.`);
    return groups;
  }

  async openGroupUrl(userId: number, url: string): Promise<void> {
    const page = await this.browser.ensurePage(userId);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    this.store.log(userId, `Đã mở: ${url}`);
  }
}
