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

echo "[1/4] Pull code moi nhat..."
git pull origin main

echo "[2/4] Cap nhat database schema..."
psql -U postgres -d tezo -f schema.sql
echo "      Schema OK."

echo "[3/4] Build..."
npm run build
echo "      Build xong."

echo "[4/4] Restart PM2..."
pm2 restart all
echo "      PM2 da restart."

echo ""
echo "  [OK] Deploy hoan tat!"
echo "  Xem log: pm2 logs"
echo ""
