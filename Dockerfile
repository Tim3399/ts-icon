# --- Build Stage ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install


COPY . .

RUN npx prisma generate
RUN npm run build


# --- Production Stage ---
FROM node:18-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma

ENV DATABASE_URL="file:./dev.db"
RUN npx prisma db push

EXPOSE 3000

# Clean optional caches
RUN npm cache clean --force

EXPOSE 3000