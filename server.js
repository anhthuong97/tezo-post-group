const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const {
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
} = require('./browser');
const { getAiSuggestions, buildProductPost } = require('./gemini');

process.on('unhandledRejection', (err) => {
  console.error('Lỗi không bắt được (đã chặn để server không sập):', err);
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    // Keep the original extension — Facebook needs it to recognize the file as an image.
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
    },
  }),
});

app.get('/api/has-session', (req, res) => {
  res.json({ hasSession: hasSavedSession() });
});

app.post('/api/open-login', async (req, res) => {
  try {
    await openLoginPage();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/confirm-login', async (req, res) => {
  try {
    await confirmLogin();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    const groups = await listGroups();
    res.json({ success: true, groups });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/open-group', async (req, res) => {
  try {
    await openGroupUrl(req.body.url);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/post', upload.array('images', 50), (req, res) => {
  let groups;
  try {
    groups = JSON.parse(req.body.groups || '[]');
  } catch {
    return res.status(400).json({ success: false, error: 'groups không hợp lệ.' });
  }
  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ success: false, error: 'Chưa chọn group nào.' });
  }

  const content = req.body.content || '';
  const productLink = req.body.productLink || '';
  const imagePaths = (req.files || []).map((f) => f.path);

  res.json({ success: true, message: 'Đã bắt đầu đăng, theo dõi tiến trình ở khung log.' });

  postToGroups({ groups, content, imagePaths, productLink }).finally(() => {
    for (const p of imagePaths) fs.unlink(p, () => {});
  });
});

app.get('/api/log', (req, res) => {
  res.json({ log: state.log });
});

app.get('/api/post-status', (req, res) => {
  res.json({ postStatus: state.postStatus });
});

app.post('/api/post/cancel', (req, res) => {
  cancelGroup(req.body.url);
  res.json({ success: true });
});

app.post('/api/post/cancel-all', (req, res) => {
  cancelAllPending();
  res.json({ success: true });
});

app.get('/api/identities', async (req, res) => {
  try {
    const result = await listIdentities();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/identities/switch', async (req, res) => {
  try {
    await switchIdentity(req.body.name);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/ai-suggest', async (req, res) => {
  const { content, apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'Chưa nhập Gemini API Key.' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Chưa có nội dung để AI gợi ý.' });
  }

  try {
    const suggestions = await getAiSuggestions(content, apiKey);
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Serve files from uploads/ (product images downloaded server-side)
app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

app.post('/api/fetch-product', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'Thiếu URL sản phẩm.' });

  let productJsonUrl;
  try {
    const parsed = new URL(url.trim());
    productJsonUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}.json`;
  } catch {
    return res.status(400).json({ success: false, error: 'URL không hợp lệ.' });
  }

  let productData;
  try {
    const productRes = await fetch(productJsonUrl);
    if (!productRes.ok) throw new Error(`HTTP ${productRes.status}`);
    const json = await productRes.json();
    productData = json.product;
    if (!productData) throw new Error('Không tìm thấy dữ liệu sản phẩm.');
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Không lấy được thông tin sản phẩm: ' + err.message });
  }

  const content = buildProductPost(productData);

  const imageUrls = (productData.images || []).map((img) => img.src);
  const imagePaths = [];
  for (const imgUrl of imageUrls) {
    try {
      const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
      const filename = `product-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      imagePaths.push('/uploads/' + filename);
    } catch (err) {
      console.error('Lỗi tải ảnh:', imgUrl, err.message);
    }
  }

  res.json({ success: true, content, imagePaths });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`App đang chạy tại http://localhost:${PORT}`);
});
