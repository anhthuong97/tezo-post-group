require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const multer = require('multer');

const pool = require('./db');
const { requireAuth, loginHandler, logoutHandler, meHandler } = require('./auth');
const {
  getUserState,
  destroyUserSession,
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
} = require('./browser');
const { getAiSuggestions, buildProductPost } = require('./gemini');

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

const app = express();
app.use(express.json());

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  store: new PgSession({ pool, tableName: 'session_post_group' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Static files — served AFTER session middleware so login.html is public
app.use(express.static(path.join(__dirname, 'public')));

// ─── Uploads ──────────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
});

// ─── Auth routes (public) ─────────────────────────────────────────────────────
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/logout', logoutHandler);
app.get('/api/auth/me', meHandler);

// ─── All routes below require login ──────────────────────────────────────────
app.use('/api', requireAuth);

app.get('/api/has-session', (req, res) => {
  res.json({ hasSession: hasSavedSession(req.session.userId) });
});

app.post('/api/open-login', async (req, res) => {
  try {
    await openLoginPage(req.session.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/confirm-login', async (req, res) => {
  try {
    await confirmLogin(req.session.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    const groups = await listGroups(req.session.userId);
    res.json({ success: true, groups });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/open-group', async (req, res) => {
  try {
    await openGroupUrl(req.session.userId, req.body.url);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/post', upload.array('images', 50), (req, res) => {
  const userId = req.session.userId;
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

  res.json({ success: true, message: 'Đã bắt đầu đăng.' });

  postToGroups(userId, { groups, content, imagePaths, productLink })
    .finally(() => { for (const p of imagePaths) fs.unlink(p, () => {}); });
});

app.get('/api/log', (req, res) => {
  const s = getUserState(req.session.userId);
  res.json({ log: s.log });
});

app.get('/api/post-status', (req, res) => {
  const s = getUserState(req.session.userId);
  res.json({ postStatus: s.postStatus });
});

app.post('/api/post/cancel', (req, res) => {
  cancelGroup(req.session.userId, req.body.url);
  res.json({ success: true });
});

app.post('/api/post/cancel-all', (req, res) => {
  cancelAllPending(req.session.userId);
  res.json({ success: true });
});

app.get('/api/identities', async (req, res) => {
  try {
    const result = await listIdentities(req.session.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/identities/switch', async (req, res) => {
  try {
    await switchIdentity(req.session.userId, req.body.name);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/ai-suggest', async (req, res) => {
  const { content, apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ success: false, error: 'Chưa nhập Gemini API Key.' });
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Chưa có nội dung.' });
  try {
    const suggestions = await getAiSuggestions(content, apiKey);
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
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
    const r = await fetch(productJsonUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
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
      fs.writeFileSync(filePath, Buffer.from(await imgRes.arrayBuffer()));
      imagePaths.push('/uploads/' + filename);
    } catch (err) {
      console.error('Lỗi tải ảnh:', imgUrl, err.message);
    }
  }

  res.json({ success: true, content, imagePaths });
});

// ─── Serve index only for authenticated users, redirect others to login ───────
app.get('/', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App đang chạy tại http://localhost:${PORT}`));
