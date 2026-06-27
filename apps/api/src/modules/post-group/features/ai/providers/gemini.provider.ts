import * as https from 'https';

const MODEL = 'gemini-2.5-flash';

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function buildSuggestPrompt(content: string): string {
  const stripped = stripHtml(content);
  return (
    `Bạn là trợ lý viết nội dung mạng xã hội tiếng Việt. Dưới đây là nội dung bài viết Facebook:\n"""\n${stripped}\n"""\n\n` +
    `Hãy viết lại nội dung trên thành 5 phiên bản khác nhau. Yêu cầu:\n` +
    `- Mỗi phiên bản diễn đạt khác nhau (từ ngữ, cách hành văn, có thể thêm emoji phù hợp)\n` +
    `- PHẢI giữ nguyên ý chính, thông tin, số liệu, liên hệ, hashtag quan trọng\n` +
    `- Không thêm thông tin mà bài gốc không có\n` +
    `- Mỗi phiên bản PHẢI có xuống dòng (\\n) giữa các đoạn, không được viết tất cả trên một dòng\n` +
    `- Mỗi ý/câu quan trọng nên xuống dòng riêng cho dễ đọc trên Facebook\n\n` +
    `Trả lời CHỈ bằng một JSON array gồm đúng 5 string. Các ký tự xuống dòng trong chuỗi phải dùng \\n (JSON escape). Không thêm giải thích, không bọc markdown.`
  );
}

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

function httpsPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Gemini HTTP ${res.statusCode}: ${data}`));
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function getAiSuggestionsGemini(
  content: string,
  config: GeminiConfig,
): Promise<string[]> {
  const model  = config.model || MODEL;
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const prompt = buildSuggestPrompt(content);

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
  });

  const text = await httpsPost(url, body);
  const json = JSON.parse(text);
  const raw  = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini không trả về nội dung.');

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error('Gemini trả về định dạng không hợp lệ.');
  return parsed.map((s: any) => String(s)).slice(0, 5);
}

export async function buildProductPostGemini(
  productInfo: string,
  config: GeminiConfig,
): Promise<string> {
  const model  = config.model || MODEL;
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const prompt =
    `Bạn là chuyên gia viết bài marketing cho sản phẩm trên mạng xã hội Facebook. ` +
    `Dựa vào thông tin sản phẩm sau, hãy viết 1 bài đăng Facebook hấp dẫn, tự nhiên:\n\n${productInfo}\n\n` +
    `Yêu cầu:\n- Có thể dùng emoji phù hợp\n- Ngôn ngữ thân thiện\n` +
    `- Nêu bật ưu điểm sản phẩm\n- Có call-to-action cuối bài\n- Không có tiêu đề`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
  });

  const text = await httpsPost(url, body);
  const json = JSON.parse(text);
  return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}
