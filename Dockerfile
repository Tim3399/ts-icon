# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci


COPY . .

# prisma.config.ts resolves DATABASE_URL via env() as soon as the Prisma CLI
# loads its config, even for a command like `generate` that never actually
# connects to a database — so a value must be present here regardless. This
# is a build-time-only placeholder: it doesn't need to point at a real
# database, and it has no effect on the runner stage below (each Docker
# stage's ENV is independent; the real DATABASE_URL is supplied at runtime
# via docker-compose).
ENV DATABASE_URL=file:./dev.db
RUN npx prisma generate
RUN npm run build


# --- Production Stage ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Minimal init process so SIGTERM (and reaping) is handled correctly for
# whatever start command docker-compose supplies as CMD.
RUN apk add --no-cache tini

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && chown -R node:node /app

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/node_modules/.prisma /app/node_modules/.prisma

# The SQLite database file lives on a mounted volume at /data, outside /app.
# A fresh named volume is created root-owned, so without this the non-root
# user below cannot create or write the database file on first start.
RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
