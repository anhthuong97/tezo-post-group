import * as https from 'https';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
}

export async function getAiSuggestionsOpenAI(
  content: string,
  config: OpenAIConfig,
): Promise<string[]> {
  const model = config.model || 'gpt-4o-mini';

  const prompt =
    `Bạn là chuyên gia viết bài marketing cho mạng xã hội. ` +
    `Hãy viết 3 phiên bản bài đăng Facebook hấp dẫn dựa trên nội dung:\n\n${content}\n\n` +
    `Mỗi phiên bản cách nhau bằng dòng "---". Không thêm tiêu đề.`;

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 2048,
  });

  const text = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`OpenAI HTTP ${res.statusCode}: ${data}`));
          resolve(data);
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const json    = JSON.parse(text);
  const rawText = json?.choices?.[0]?.message?.content || '';
  return rawText.split(/\n---\n|\n---$/).map((s: string) => s.trim()).filter(Boolean);
}
