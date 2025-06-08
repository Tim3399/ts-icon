# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Nur package.json und package-lock.json kopieren und Abhängigkeiten installieren
COPY package*.json ./
RUN npm install

# Restlichen Code kopieren und bauen
COPY . .

RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine

WORKDIR /app

# Nur Produktions-Abhängigkeiten installieren
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Nur die nötigen Artefakte kopieren
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config.* ./

# Kein CMD hier, da docker-compose für jeden Service das Kommando setzt