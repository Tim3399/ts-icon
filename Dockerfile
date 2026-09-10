# syntax=docker/dockerfile:1
FROM node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

# Tools for migrations, backups, integrity checks and restore.
FROM builder AS tools
CMD ["npm", "run", "db:migrate"]

FROM node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini
COPY package*.json ./
# Root dev declarations otherwise keep optional Prisma peers installed despite
# --omit. The unchanged lockfile still supplies all exact production versions.
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); delete p.devDependencies; fs.writeFileSync('package.json',JSON.stringify(p))" \
    && PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --omit=peer \
    && npm cache clean --force \
    && node -e "if(require('fs').existsSync('node_modules/prisma')) throw Error('Prisma CLI leaked into runtime')" \
    && chown -R node:node /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start:public"]
