import { Injectable, BadRequestException } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_PRODUCT_HOSTS = /^tezo\.vn$/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SECTION_HEADER_RE = /^(?:\*|\d+\.)\s+(.+)$/;
const SKIP_SECTIONS = ['THÔNG TIN', 'HƯỚNG DẪN', 'MIX', 'MATCH'];

function buildProductPost(productData: any): string {
  const cleanTitle = (productData.title || '').replace(/\s*-\s*\d{2}[A-Z0-9]+$/i, '').trim();
  const titleUpper = cleanTitle.toUpperCase();

  const price        = parseFloat(productData.variants?.[0]?.price || 0);
  const comparePrice = parseFloat(productData.variants?.[0]?.compare_at_price || 0);

  let headline = titleUpper;
  if (comparePrice > price && price > 0) {
    const salePct = Math.round((1 - price / comparePrice) * 100);
    const priceK  = Math.round(price / 1000);
    headline += ` SALE ${salePct}% CHỈ CÒN #${priceK}K`;
  } else if (price > 0) {
    const priceK = Math.round(price / 1000);
    headline += ` CHỈ CÒN #${priceK}K`;
  }

  const bodyText = stripHtml(productData.body_html || '');
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;

  for (const raw of bodyText.split('\n')) {
    const line = raw.trim();
    const m    = line.match(SECTION_HEADER_RE);
    if (m) {
      currentSection = m[1].trim().toUpperCase();
      sections[currentSection] = [];
    } else if (currentSection && line.startsWith('-') && line.length > 2) {
      sections[currentSection].push(line.startsWith('- ') ? line : '- ' + line.slice(1).trim());
    }
  }

  let bullets: string[] = [];
  const chiTietKey  = Object.keys(sections).find((k) => k.includes('CHI TIẾT'));
  const tinhNangKey = Object.keys(sections).find((k) => k.includes('TÍNH NĂNG'));
  const thietKeKey  = Object.keys(sections).find((k) => k.includes('THIẾT KẾ'));

  if (chiTietKey && sections[chiTietKey].length > 0) {
    bullets = sections[chiTietKey];
  } else if (tinhNangKey && sections[tinhNangKey].length > 0) {
    bullets = sections[tinhNangKey];
  } else if (thietKeKey && sections[thietKeKey].length > 0) {
    bullets = sections[thietKeKey];
  } else {
    for (const [key, lines] of Object.entries(sections)) {
      if (!SKIP_SECTIONS.some((s) => key.includes(s))) bullets.push(...lines);
    }
  }

  const CTA = 'IB HOẶC BẤM NGAY VÀO LINK DƯỚI CMT ĐỂ ĐẶT HÀNG NGAY NHÉ Ạ!';
  return [headline, ...bullets, CTA].join('\n');
}

function fetchUrl(targetUrl: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith('https') ? https : http;
    lib.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'image/*,*/*',
      },
    }, (res) => {
      // Follow redirect
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        return fetchUrl(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function downloadImage(imgUrl: string): Promise<string | null> {
  try {
    const ext      = path.extname(new URL(imgUrl).pathname) || '.jpg';
    const filename = `product-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    const buf      = await fetchUrl(imgUrl);
    fs.writeFileSync(filePath, buf);
    return filename;
  } catch (err: any) {
    console.error('Lỗi tải ảnh:', imgUrl, err.message);
    return null;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProductService {
  async fetchProduct(productUrl: string): Promise<{ content: string; imageFiles: string[] }> {
    let parsed: URL;
    try {
      parsed = new URL(productUrl.trim());
    } catch {
      throw new BadRequestException('URL không hợp lệ.');
    }

    if (!ALLOWED_PRODUCT_HOSTS.test(parsed.hostname)) {
      throw new BadRequestException(`Domain không được hỗ trợ: ${parsed.hostname}`);
    }

    const jsonUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}.json`;

    const buf  = await fetchUrl(jsonUrl).catch((err) => {
      throw new BadRequestException('Không lấy được thông tin sản phẩm: ' + err.message);
    });

    let productData: any;
    try {
      const json = JSON.parse(buf.toString());
      productData = json.product;
      if (!productData) throw new Error('Không tìm thấy dữ liệu sản phẩm.');
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const content    = buildProductPost(productData);
    const imageUrls  = (productData.images || []).map((img: any) => img.src).filter(Boolean);
    const imageFiles: string[] = [];

    for (const imgUrl of imageUrls) {
      const filename = await downloadImage(imgUrl);
      if (filename) imageFiles.push(filename);
    }

    return { content, imageFiles };
  }
}
