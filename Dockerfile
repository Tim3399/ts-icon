# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci


COPY . .

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

USER node

EXPOSE 3000
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
