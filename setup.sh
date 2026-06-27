#!/bin/bash
# Chạy 1 lần trên VPS: bash setup.sh

BASE=/root/tezo

# ── 1. File .env cho API ─────────────────────────────────────────────────────
cat > $BASE/apps/api/.env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tezo
DB_USER=admin
DB_PASSWORD=tezo2026@123
SESSION_SECRET=tezo2026tezo2027tezo282920
PORT=3000
HEADLESS=true
EOF
echo "✓ apps/api/.env"

# ── 2. File .env cho Web ─────────────────────────────────────────────────────
cat > $BASE/apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
echo "✓ apps/web/.env.local"

# ── 3. Ecosystem config PM2 ──────────────────────────────────────────────────
cat > $BASE/ecosystem.linux.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'tezo-api',
      script: '/root/tezo/apps/api/dist/main.js',
      cwd: '/root/tezo/apps/api',
      watch: false,
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'tezo-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/root/tezo/apps/web',
      watch: false,
      autorestart: true,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },
  ],
};
EOF
echo "✓ ecosystem.linux.config.js"

# ── 4. Nginx config ──────────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/tezo << 'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 180s;
    }

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/tezo /etc/nginx/sites-enabled/tezo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "✓ Nginx"

echo ""
echo "✅ Setup xong! Tiếp theo chạy:"
echo "   npm install"
echo "   npm run build"
echo "   cd apps/api && npx playwright install chromium && cd ../.."
echo "   pm2 start ecosystem.linux.config.js"
echo "   pm2 save && pm2 startup"
