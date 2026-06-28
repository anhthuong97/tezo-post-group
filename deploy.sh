#!/bin/bash
# Deploy script cho VPS Linux
# Chay: bash deploy.sh

set -e
cd /root/tezo

echo ""
echo "=========================================="
echo "  TEZO | Deploy VPS"
echo "=========================================="
echo ""

echo "[1/3] Cap nhat database schema..."
sudo -u postgres psql -d tezo -f schema.sql
echo "      Schema OK."

echo "[2/3] Build..."
npx turbo run build --filter=@tezo/api --filter=@tezo/web
echo "      Build xong."

echo "[3/3] Restart PM2..."
pm2 restart all
echo "      PM2 da restart."

echo ""
echo "  [OK] Deploy hoan tat!"
echo "  Xem log: pm2 logs"
echo ""
