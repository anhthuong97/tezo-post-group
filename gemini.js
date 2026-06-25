const MODEL = 'gemini-2.5-flash';

function stripHtml(html) {
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

function buildProductPrompt(productData) {
  const title = productData.title || '';
  const price = parseFloat(productData.variants?.[0]?.price || 0);
  const comparePrice = parseFloat(productData.variants?.[0]?.compare_at_price || 0);
  const bodyText = stripHtml(productData.body_html);

  let priceInfo = '';
  if (comparePrice > price && price > 0) {
    const salePct = Math.round((1 - price / comparePrice) * 100);
    priceInfo = `Giá bán: ${price.toLocaleString('vi-VN')}đ (giá gốc: ${comparePrice.toLocaleString('vi-VN')}đ, sale ${salePct}%)`;
  } else if (price > 0) {
    priceInfo = `Giá bán: ${price.toLocaleString('vi-VN')}đ`;
  }

  return `Bạn là chuyên gia viết content bán hàng trên Facebook tiếng Việt. Dựa vào thông tin sản phẩm dưới đây, hãy viết 1 bài đăng Facebook hấp dẫn để bán hàng.

Thông tin sản phẩm:
- Tên: ${title}
- ${priceInfo}
- Mô tả: ${bodyText}

Yêu cầu format bài đăng (trả về đúng theo format này):
1. Dòng đầu tiên: Tên sản phẩm VIẾT HOA toàn bộ, kèm thông tin sale/giá hấp dẫn (ví dụ: "ÁO PHÔNG NAM THỂ THAO SALE 40% CHỈ CÒN #129K")
2. Các dòng tiếp theo: liệt kê bullet points bắt đầu bằng "- " về tính năng và lợi ích nổi bật (viết hấp dẫn, dễ đọc, ngắn gọn, đúng với mô tả sản phẩm)
3. Dòng cuối cùng cố định: "IB HOẶC BẤM NGAY VÀO LINK DƯỚI CMT ĐỂ ĐẶT HÀNG NGAY NHÉ Ạ!"

Trả lời CHỈ nội dung bài đăng, không có giải thích, không có markdown, không có dấu ngoặc kép bao quanh.`;
}

// Section header patterns: "* CHI TIẾT THIẾT KẾ" or "3. CHI TIẾT THIẾT KẾ"
const SECTION_HEADER_RE = /^(?:\*|\d+\.)\s+(.+)$/;
const SKIP_SECTIONS = ['THÔNG TIN', 'HƯỚNG DẪN', 'MIX', 'MATCH'];

function buildProductPost(productData) {
  const cleanTitle = (productData.title || '').replace(/\s*-\s*\d{2}[A-Z0-9]+$/i, '').trim();
  const titleUpper = cleanTitle.toUpperCase();

  const price = parseFloat(productData.variants?.[0]?.price || 0);
  const comparePrice = parseFloat(productData.variants?.[0]?.compare_at_price || 0);

  let headline = titleUpper;
  if (comparePrice > price && price > 0) {
    const salePct = Math.round((1 - price / comparePrice) * 100);
    const priceK = Math.round(price / 1000);
    headline += ` SALE ${salePct}% CHỈ CÒN #${priceK}K`;
  } else if (price > 0) {
    const priceK = Math.round(price / 1000);
    headline += ` CHỈ CÒN #${priceK}K`;
  }

  // Split body into named sections (handles both "* NAME" and "1. NAME" formats)
  const bodyText = stripHtml(productData.body_html || '');
  const sections = {};
  let currentSection = null;
  for (const raw of bodyText.split('\n')) {
    const line = raw.trim();
    const m = line.match(SECTION_HEADER_RE);
    if (m) {
      currentSection = m[1].trim().toUpperCase();
      sections[currentSection] = [];
    } else if (currentSection && line.startsWith('-') && line.length > 2) {
      sections[currentSection].push(line.startsWith('- ') ? line : '- ' + line.slice(1).trim());
    }
  }

  // Priority: CHI TIẾT THIẾT KẾ → TÍNH NĂNG → any section except skipped ones
  let bullets = [];
  const chiTietKey = Object.keys(sections).find((k) => k.includes('CHI TIẾT'));
  const tinhNangKey = Object.keys(sections).find((k) => k.includes('TÍNH NĂNG'));

  if (chiTietKey && sections[chiTietKey].length > 0) {
    bullets = sections[chiTietKey];
  } else if (tinhNangKey && sections[tinhNangKey].length > 0) {
    bullets = sections[tinhNangKey];
  } else {
    for (const [key, lines] of Object.entries(sections)) {
      if (!SKIP_SECTIONS.some((s) => key.includes(s))) bullets.push(...lines);
    }
  }

  const CTA = 'IB HOẶC BẤM NGAY VÀO LINK DƯỚI CMT ĐỂ ĐẶT HÀNG NGAY NHÉ Ạ!';
  return [headline, ...bullets, CTA].join('\n');
}

function buildPrompt(content) {
  return `Bạn là trợ lý viết nội dung mạng xã hội tiếng Việt. Dưới đây là nội dung bài viết Facebook:
"""
${content}
"""
Hãy viết lại nội dung trên thành 5 phiên bản khác nhau, mỗi phiên bản diễn đạt khác nhau (từ ngữ, cách hành văn, có thể thêm emoji phù hợp) nhưng PHẢI giữ nguyên ý chính, thông tin, số liệu, liên hệ, hashtag quan trọng của bài gốc. Không thêm thông tin mà bài gốc không có. Trả lời CHỈ bằng một JSON array gồm đúng 5 chuỗi văn bản (string), không thêm giải thích, không thêm markdown.`;
}

async function getAiSuggestions(content, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(content) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini API lỗi (HTTP ${res.status}).`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini không trả về nội dung (có thể do bộ lọc an toàn chặn nội dung này).');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Không đọc được kết quả AI trả về (không phải JSON hợp lệ).');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Kết quả AI trả về không đúng định dạng mong đợi.');
  }

  return parsed.map((s) => String(s)).slice(0, 5);
}

module.exports = { getAiSuggestions, buildProductPost };
