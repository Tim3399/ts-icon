# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* values into the built JS bundle at build time, not
# runtime - by the time a container built from this image actually starts,
# it's too late to change them. They have to be build-time ARGs here rather
# than environment variables set on the running container.
ARG VITE_PUBLIC_API_URL
ARG VITE_ADMIN_API_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ARG VITE_KEYCLOAK_ENABLED
ENV VITE_PUBLIC_API_URL=${VITE_PUBLIC_API_URL} \
    VITE_ADMIN_API_URL=${VITE_ADMIN_API_URL} \
    VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM} \
    VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID} \
    VITE_KEYCLOAK_ENABLED=${VITE_KEYCLOAK_ENABLED}

RUN npm run build

# --- Production Stage ---
# nginx-unprivileged (maintained by the same org as the official nginx
# image) runs as a non-root user out of the box and listens on 8080 instead
# of 80, rather than needing a hand-rolled non-root nginx setup.
FROM nginxinc/nginx-unprivileged:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
