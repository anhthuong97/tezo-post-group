const bcrypt = require('bcrypt');
const pool = require('./db');

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
  }
  next();
}

async function loginHandler(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Thiếu username hoặc password.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, is_active FROM employees WHERE username = $1',
      [username.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Tài khoản không tồn tại hoặc bị khóa.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Sai mật khẩu.' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function logoutHandler(req, res) {
  req.session.destroy(() => res.json({ success: true }));
}

function meHandler(req, res) {
  if (!req.session?.userId) return res.status(401).json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username, userId: req.session.userId });
}

module.exports = { requireAuth, loginHandler, logoutHandler, meHandler };
