#!/usr/bin/env bash
# Installiert alle Dependencies für Backend und Frontend

set -e

echo "=== Backend-Dependencies installieren ==="
npm install

echo ""
echo "=== Prisma Client generieren ==="
npx prisma generate

echo ""
echo "=== Frontend-Dependencies installieren ==="
cd webapp-banner-tool
npm install

echo ""
echo "=== Fertig! ==="
echo "Backend starten:   npm run build && npm run start:local"
echo "Frontend starten:  cd webapp-banner-tool && npm run dev"
