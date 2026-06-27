import { Injectable, ConflictException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserService } from '../../facebook/infrastructure/browser.service';
import { UserSessionStore, PostStatusItem } from '../../facebook/infrastructure/user-session.store';
import { IdentityService } from '../../identity/service/identity.service';
import { CreatePostDto } from '../dto/create-post.dto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

@Injectable()
export class PostService {
  constructor(
    private readonly browser: BrowserService,
    private readonly store: UserSessionStore,
    private readonly identity: IdentityService,
  ) {}

  // ─── Status / Log ─────────────────────────────────────────────────────────

  getStatus(userId: number): PostStatusItem[] {
    return this.store.get(userId).postStatus;
  }

  getLog(userId: number): string[] {
    return this.store.get(userId).log;
  }

  cancelGroup(userId: number, url: string): void {
    const s = this.store.get(userId);
    const item = s.postStatus.find((i) => i.url === url);
    if (item && item.status === 'pending') {
      item.status = 'cancelled';
      item.message = 'Đã hủy bởi người dùng.';
      this.store.log(userId, `Đã hủy: ${item.name}`);
    }
  }

  cancelAllPending(userId: number): void {
    const s = this.store.get(userId);
    let count = 0;
    s.postStatus.forEach((item) => {
      if (item.status === 'pending') {
        item.status = 'cancelled';
        item.message = 'Đã hủy bởi người dùng.';
        count++;
      }
    });
    if (count) this.store.log(userId, `Đã hủy ${count} nhóm chờ.`);
  }

  // ─── Post ─────────────────────────────────────────────────────────────────

  async startPost(userId: number, dto: CreatePostDto): Promise<void> {
    const s = this.store.get(userId);
    if (s.isPosting) throw new ConflictException('Đang trong quá trình đăng bài.');

    s.postStatus = dto.groups.map((g) => ({
      url: g.url, name: g.name,
      status: 'pending', message: 'Đang chờ...',
    }));

    // Fire & forget — không await để trả response ngay
    this.postToGroups(userId, dto).catch((err) => {
      this.store.log(userId, `Lỗi postToGroups: ${err.message}`);
      this.store.get(userId).isPosting = false;
    });
  }

  private async postToGroups(userId: number, dto: CreatePostDto): Promise<void> {
    const s = this.store.get(userId);
    s.isPosting = true;

    try {
      // Cập nhật tư cách được chọn nếu có
      if (dto.identity?.trim()) {
        this.store.get(userId).selectedIdentity = dto.identity.trim();
        this.store.get(userId).activeIdentity = null; // Force re-check trước nhóm đầu
      }

      for (const item of s.postStatus) {
        if (item.status !== 'pending') continue;

        item.status = 'processing';
        item.message = 'Đang xử lý...';
        this.store.log(userId, `→ Đăng vào: ${item.name}`);

        // Đảm bảo đúng tư cách trước mỗi nhóm (identity có thể bị reset sau navigate)
        await this.identity.ensureIdentity(userId);

        try {
          await this.postToOneGroup(userId, item, dto);
        } catch (err: any) {
          item.status = 'error';
          item.message = err.message || 'Lỗi không xác định';
          item.doneAt = new Date().toLocaleTimeString('vi-VN');
          this.store.log(userId, `✗ Lỗi ${item.name}: ${err.message}`);
        }

        // Delay giữa các group
        const next = s.postStatus.find((i) => i.status === 'pending');
        if (next) {
          const ms = Math.floor(Math.random() * (45000 - 15000 + 1) + 15000);
          this.store.log(userId, `Chờ ${Math.round(ms / 1000)}s trước nhóm tiếp theo...`);
          await this.browser.randomDelay(15000, 45000);
        }
      }
    } finally {
      s.isPosting = false;
    }

    const counts = { success: 0, error: 0, cancelled: 0 };
    s.postStatus.forEach((i) => { if (counts[i.status] !== undefined) counts[i.status]++; });
    this.store.log(userId, `Hoàn thành: ${counts.success} thành công, ${counts.error} lỗi, ${counts.cancelled} hủy.`);
  }

  private async postToOneGroup(userId: number, item: PostStatusItem, dto: CreatePostDto): Promise<void> {
    const page = await this.browser.ensurePage(userId);

    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (this.browser.looksLoggedOut(page.url())) throw new Error('Session Facebook hết hạn.');

    // Chờ trang ổn định sau khi navigate
    await this.browser.randomDelay(2500, 5000);
    if ((this.store.get(userId).postStatus.find(i => i.url === item.url)?.status as any) === 'cancelled') return;

    // ── 1. Mở composer ────────────────────────────────────────────────────────
    const composerTrigger = page.getByRole('button', { name: /viết gì|write something/i }).first();
    await composerTrigger.waitFor({ state: 'visible', timeout: 20000 });
    await composerTrigger.click();
    await this.browser.randomDelay(1000, 2000);

    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    // ── 2. Bắt GraphQL để lấy post ID ─────────────────────────────────────────
    let capturedPostId: string | null = null;
    const responseHandler = async (response) => {
      if (capturedPostId) return;
      if (!response.url().includes('graphql')) return;
      try {
        const text = await response.text().catch(() => '');
        // Không dùng "id" generic vì nó bắt user profile ID (100035...)
        const m = text.match(/"story_id"\s*:\s*"(\d{16,})"/) ||
                  text.match(/"post_id"\s*:\s*"(\d{16,})"/)  ||
                  text.match(/"creation_story_id"\s*:\s*"(\d{16,})"/);
        if (m) capturedPostId = m[1];
      } catch {}
    };
    page.on('response', responseHandler);

    try {
      // ── 3. Bắt đầu upload ảnh (nếu có) — không chờ xong ─────────────────────
      let hasImages = false;
      if (dto.images && dto.images.length > 0) {
        const filePaths = dto.images
          .map((name) => path.join(UPLOADS_DIR, name))
          .filter((p) => fs.existsSync(p));

        if (filePaths.length > 0) {
          item.message = 'Đang tải ảnh/video...';
          this.store.log(userId, `  Gắn ${dto.images.length} ảnh...`);

          const photoBtn = page.locator('[aria-label="Ảnh/video"]:visible').last();
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 15000 }),
            photoBtn.click(),
          ]);
          await fileChooser.setFiles(filePaths);
          hasImages = true;
          // Upload đang chạy nền — nhập content ngay bên dưới, không chờ
        }
      }

      // ── 4. Nhập nội dung (song song với upload ảnh) ──────────────────────────
      item.message = 'Đang nhập nội dung...';
      const textbox = page.getByRole('textbox').last();
      await textbox.click();
      await page.keyboard.type(dto.content, { delay: 30 + Math.floor(Math.random() * 40) });
      await this.browser.randomDelay(1000, 2000);

      // Chờ upload hoàn tất trước khi bấm Đăng
      if (hasImages) {
        this.store.log(userId, '  Chờ ảnh tải xong...');
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await this.browser.randomDelay(1000, 2000);
      }

      if ((this.store.get(userId).postStatus.find(i => i.url === item.url)?.status as any) === 'cancelled') {
        await page.keyboard.press('Escape').catch(() => {});
        return;
      }

      // ── 5. Bấm Đăng ─────────────────────────────────────────────────────────
      item.message = 'Đang đăng bài...';
      const postBtn = page.getByRole('button', { name: /^đăng$|^post$/i }).last();
      await postBtn.waitFor({ state: 'visible', timeout: 15000 });
      await postBtn.click();

      // Chờ dialog đóng (bài đã đăng xong)
      await dialog.waitFor({ state: 'hidden', timeout: 30000 });
      await page.waitForTimeout(1000);

    } finally {
      page.off('response', responseHandler);
      await page.keyboard.press('Escape').catch(() => {});
    }

    // ── 6. Xử lý kết quả ───────────────────────────────────────────────────────
    const groupId = item.url.match(/groups\/([^/?]+)/)?.[1];

    // Navigate lại group để có feed sạch (tránh trạng thái trang không xác định sau khi đăng)
    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const postHeadline = dto.content.split('\n')[0].trim().slice(0, 25);
    item.postLink = await this.getPostLink(page, postHeadline, userId) ?? undefined;

    // Fallback: GraphQL capture (chỉ dùng khi có 16+ digit ID để tránh user ID)
    if (!item.postLink && capturedPostId && groupId) {
      item.postLink = `https://www.facebook.com/groups/${groupId}/posts/${capturedPostId}/`;
    }

    item.status = 'success';
    item.doneAt = new Date().toLocaleTimeString('vi-VN');
    item.message = item.postLink ? 'Đăng thành công!' : 'Đăng xong (không lấy được link).';
    this.store.log(userId, `✓ ${item.name} — ${item.postLink || 'không có link'}`);

    // ── 7. Comment sau khi đăng ───────────────────────────────────────────────
    const commentText = dto.comment?.trim() || '';
    if (commentText) {
      const finalComment = commentText.replace(/\{link bài viết\}/g, item.postLink || '');
      // Truyền postHeadline để tìm đúng story trên group feed (không navigate sang post link)
      await this.postComment(userId, item, finalComment, postHeadline);
    }
  }

  private async postComment(
    userId: number,
    item: PostStatusItem,
    comment: string,
    postHeadline: string,
  ): Promise<void> {
    const page = await this.browser.ensurePage(userId);
    item.status = 'commenting';
    item.message = 'Đang comment...';
    await this.browser.randomDelay(3000, 5000);

    try {
      // Nếu đã có link bài viết → navigate thẳng, không dò trong feed
      if (item.postLink) {
        await page.goto(item.postLink, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }

      const commentBox = page.locator('[role="textbox"][data-lexical-editor="true"]').first();
      await commentBox.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await commentBox.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(comment, { delay: 20 + Math.floor(Math.random() * 30) });
      await page.keyboard.press('Enter');
      await this.browser.randomDelay(2000, 4000);
      item.message = 'Đăng + comment thành công!';
      this.store.log(userId, `✓ Comment vào ${item.name}`);
    } catch (err: any) {
      this.store.log(userId, `⚠ Comment lỗi ${item.name}: ${err.message}`);
      item.message = 'Đăng thành công (comment thất bại).';
    } finally {
      item.status = 'success';
      item.doneAt = new Date().toLocaleTimeString('vi-VN');
    }
  }

  private async getPostLink(page: any, postHeadline: string, userId: number): Promise<string | null> {
    try {
      // Chờ feed load — tìm story_message chứa nội dung bài
      try {
        await page.waitForFunction(
          (t: string) => {
            const divs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
            return Array.from(divs).some((d) => (d as HTMLElement).textContent?.includes(t));
          },
          postHeadline,
          { timeout: 8000 },
        );
      } catch { /* timeout — tiếp tục với fallback */ }

      await page.waitForTimeout(500);

      const result = await page.evaluate((t: string) => {
        const isPostUrl = (href: string) => /\/(?:posts|permalink)\/(\d{16,})/.test(href);

        // Tìm story_message chứa nội dung bài, rồi traverse lên lấy link
        const storyDivs = Array.from(document.querySelectorAll('[data-ad-rendering-role="story_message"]'));
        let target: Element | null = null;
        for (const sd of storyDivs) {
          if ((sd as HTMLElement).textContent?.includes(t)) { target = sd; break; }
        }
        if (!target && storyDivs.length > 0) target = storyDivs[0];

        if (target) {
          let el: Element | null = target;
          for (let i = 0; i < 35; i++) {
            el = el?.parentElement ?? null;
            if (!el) break;
            for (const a of Array.from(el.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
              if (isPostUrl(a.href)) return { link: a.href.split('?')[0], method: 'story' };
            }
          }
        }

        // Fallback: tất cả link trên trang, lấy post ID lớn nhất (= mới nhất)
        let best: string | null = null;
        let bestId = 0;
        for (const a of Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
          const m = a.href.match(/\/(?:posts|permalink)\/(\d{16,})/);
          if (m) {
            const id = parseInt(m[1], 10);
            if (id > bestId) { bestId = id; best = a.href.split('?')[0]; }
          }
        }
        return best ? { link: best, method: 'highest-id' } : { link: null, url: location.href, storyCount: storyDivs.length };
      }, postHeadline);

      this.store.log(userId, `  getPostLink: ${JSON.stringify(result)}`);
      return (result as any).link || null;
    } catch (err: any) {
      this.store.log(userId, `  getPostLink lỗi: ${err.message}`);
      return null;
    }
  }
}
