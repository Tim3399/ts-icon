# ts-icon

A system for managing per-channel banner images ("icons") for TeamSpeak. It has two parts:

- A **NestJS backend** (`src/`), split into two separately-run apps: a public, read-only image API (for TeamSpeak/clients to fetch banners) and a Keycloak-protected admin API (for uploading, cropping, and importing banners).
- A **React + Vite admin frontend** (`webapp-banner-tool/`) for logging in, picking a channel, and cropping/uploading its banner.

## Features
- Public, read-only image API with per-IP rate limiting and no authentication required
- Admin API protected end-to-end by Keycloak (OIDC): every endpoint requires a valid Bearer token, with two roles (`ts-icon-editor`, `ts-icon-admin`) controlling what an authenticated user can do
- React + Vite frontend for cropping and uploading channel banners, with Keycloak login (Authorization Code + PKCE)
- SSRF-hardened URL-import endpoints (import a banner from a URL, or preview one, without the server becoming an open proxy to internal network resources)
- Prisma ORM with SQLite
- Docker Compose setup, including a dedicated one-off database migration step
- CI (GitHub Actions): lint/typecheck/build/test for both apps, plus a Docker image build-validation job

## Architecture
The backend is one NestJS codebase with two independent entry points/apps, each meant to run as its own process (and, in Docker, its own container):

| App | Entry point | Default port | Purpose | Auth |
|---|---|---|---|---|
| **public** | `src/main.public.ts` | 3000 | Serves channel images to TeamSpeak clients / anyone | None (rate-limited instead) |
| **local** (admin) | `src/main.local.ts` | 3001 | Upload, crop-and-send, URL-import, channel listing | Keycloak Bearer token required on every endpoint |

The `local` app is meant to stay on a trusted network path (see [Docker Setup](#docker-setup) — its port is bound to `127.0.0.1` only by default) even though it now also enforces its own authentication.

## Web Frontend
The repository contains a small React + Vite frontend located at `webapp-banner-tool/` which can be used to interact with the APIs via a simple user interface (upload/crop and view banners).

- Located in `webapp-banner-tool/`
- Built with React and Vite
- Main entry: `webapp-banner-tool/src/App.tsx`
- Start locally:
  ```powershell
  cd webapp-banner-tool
  npm install
  npm run dev
  ```
- Access via `http://localhost:5173` (default)
- Authentication via Keycloak (Authorization Code flow + PKCE, no client secret) — users are redirected to the Keycloak login page before accessing the app. Keycloak can only be turned off when the app is actually served from `localhost`/`127.0.0.1`; on any other hostname it is always required, regardless of configuration.
- All requests to the admin API include a `Bearer` token in the `Authorization` header when Keycloak is enabled, via a small central fetch wrapper (`src/api/client.ts`) that also applies a request timeout and turns 401/403/429/5xx responses into distinct, user-facing error categories.

Configuration is read from environment variables (see `webapp-banner-tool/.env.example` for the full list and current defaults) via `webapp-banner-tool/src/config.ts`:

- `VITE_PUBLIC_API_URL` — base URL of the public image API (default `http://localhost:3000`)
- `VITE_ADMIN_API_URL` — base URL of the admin/local API (default `http://localhost:3001`)
- `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` — Keycloak connection details
- `VITE_KEYCLOAK_ENABLED` — see the table below

`VITE_KEYCLOAK_ENABLED=false` (in a `.env` file in `webapp-banner-tool/`) skips the Keycloak login **only when the app is served from `localhost`/`127.0.0.1`**. On any other hostname this setting is ignored and login is always required — there is no way to disable authentication on a real deployment.

| Hostname | `VITE_KEYCLOAK_ENABLED` | Behavior |
|---|---|---|
| `localhost` / `127.0.0.1` / `::1` | not set / `true` | Keycloak login required, Bearer token sent with API calls |
| `localhost` / `127.0.0.1` / `::1` | `false` | No login required, app usable immediately without Keycloak |
| anything else | any value | Keycloak login always required |

This is a client-side developer convenience only, not a security boundary (it's trivially bypassed by anyone editing the served JS) — real enforcement is the backend's JWT guard, described below.

## Backend
- Located in `src/`
- Built with NestJS
- Main entries:
  - `src/main.local.ts` — admin/editing server. Use this to upload, change, or crop images for TeamSpeak channels. Requires a valid Keycloak Bearer token on every request.
  - `src/main.public.ts` — public server (viewing endpoints). Use this to serve images to TeamSpeak clients or web frontends. No authentication, but rate-limited.
- Start the admin (local) server:
  ```powershell
  npm install
  npm run start:local
  ```
- Start the public server:
  ```powershell
  npm run start:public
  ```

## API Endpoints
Below is a concise reference for the backend endpoints. Replace the port with your `IMG_WEB_PORT` (public) or `IMG_API_PORT` (local) if you changed them.

### Public server — read-only, default port 3000, no authentication

| Method & path | Description | Response |
|---|---|---|
| `GET /images/:channelName` | Returns the stored image for the given channel name. | Binary image; `Content-Type` set to the stored MIME type; `Cache-Control: public, max-age=86400` |

Example:
```powershell
curl http://localhost:3000/images/news -o news.png
```

This endpoint is rate-limited per client IP (see [Rate Limiting](#rate-limiting) below). There is no endpoint on the public server that lists channels or images — that moved to the admin API (see below).

### Local server — admin/editing, default port 3001, **requires a Keycloak Bearer token on every request**

| Method & path | Description | Required role | Notes |
|---|---|---|---|
| `POST /images-local/:channelName` | Upload a file for the channel (`multipart/form-data`, field `file`) | `ts-icon-editor` | Max 5 MB, MIME must be one of `image/png`, `image/jpeg`, `image/webp`, `image/gif` |
| `POST /images-local/from-url` | Fetch an external URL and save it as the channel image | `ts-icon-editor` | Body: JSON `{ "channelName": "...", "url": "https://..." }`; SSRF-hardened (see below) |
| `GET /images-local/img-from-url?url=...` | Proxy an external image URL and return it (used by the frontend's "load image from URL" preview) | `ts-icon-editor` | SSRF-hardened (see below) |
| `GET /images-local/channels` | Returns a list of channels fetched live via TeamSpeak ServerQuery | `ts-icon-editor` | Returns `{ "channels": [] , "error": "..." }` if TeamSpeak is unreachable, rather than failing the request |
| `GET /images-local/options` | Lists every stored channel image (channel name + MIME type) across the whole database | `ts-icon-admin` | Administrative listing endpoint — deliberately gated to admin, not editor |

Example (upload):
```powershell
curl -F "file=@banner.png" -H "Authorization: Bearer <token>" http://localhost:3001/images-local/news
```

On success, the upload and URL-import endpoints return `{ "message": "Image saved successfully" }`.

- Swagger UI: the local server exposes a Swagger UI at `/swagger`, but **only outside `NODE_ENV=production`** — it's disabled entirely in production. Note that Swagger UI itself is not covered by the JWT guard below (it's mounted directly on the underlying HTTP adapter rather than as a routed controller), which is why it stays restricted to non-production environments.
- Do not expose the local/admin server to the public internet without also keeping it behind a trusted network boundary — see [Docker Setup](#docker-setup) for the default `127.0.0.1`-only port binding.

## Authentication & Authorization
The admin (`local`) API validates a Keycloak-issued JWT on **every** endpoint — there is no unauthenticated route and no way to disable this at runtime. The public API has no authentication at all (by design; it only serves already-public banner images) and relies on rate limiting instead.

- **401 Unauthorized** — no `Authorization: Bearer <token>` header, or the token fails verification (missing/invalid signature, wrong issuer, wrong audience, expired, not-yet-valid, or signed with an algorithm other than `RS256`). The response never reveals which specific check failed.
- **403 Forbidden** — the token is valid, but the caller's roles don't include one required for the endpoint.

Verification is done locally against the configured Keycloak realm's JWKS endpoint (`{issuer}/protocol/openid-connect/certs`) — the backend does not call back to Keycloak for token introspection, so it works even if Keycloak is briefly unreachable after the signing keys have been cached.

### Roles
Two Keycloak client roles are used:

| Role | Grants access to |
|---|---|
| `ts-icon-editor` | Upload, URL-import (`from-url`, `img-from-url`), channel listing |
| `ts-icon-admin` | Everything `ts-icon-editor` can do, **plus** the image-listing endpoint (`GET /images-local/options`) |

In other words, `ts-icon-admin` is a strict superset — a caller with the admin role automatically satisfies any endpoint gated on the editor role. There is no separate endpoint that only the admin role can reach except the listing endpoint above (no delete/config endpoint exists yet).

Role names can be overridden via `OIDC_ADMIN_ROLE`/`OIDC_EDITOR_ROLE` (see `.env.example`), but default to `ts-icon-admin`/`ts-icon-editor`.

### Keycloak Setup
This project uses **one public Keycloak client** — no client secret, Authorization Code flow with PKCE (S256) — that serves double duty: it's both the frontend's OIDC client and the backend's expected JWT audience. A separate confidential backend client is not needed, because the backend only validates JWTs locally via the realm's JWKS; it never performs token introspection or a client-credentials flow, so it has no reason to be a registered client itself — it only needs to know which `aud` value to accept.

To configure your own Keycloak instance:

1. Create (or use an existing) realm, e.g. `<your-realm>`.
2. Create a single client:
   - **Client ID:** `<your-client-id>` (used as both `VITE_KEYCLOAK_CLIENT_ID` on the frontend and `OIDC_AUDIENCE` on the backend)
   - **Client authentication:** off (public client)
   - **Standard flow (Authorization Code):** on
   - **Direct access grants:** off
   - **Valid redirect URIs / web origins:** your frontend's actual origin(s) (no wildcards in production)
3. Create two client roles on that client: `ts-icon-editor` and `ts-icon-admin`, and assign them to the appropriate users/groups.
4. Point the backend at your realm via `OIDC_ISSUER_URL=https://<your-keycloak-url>/realms/<your-realm>` and `OIDC_AUDIENCE=<your-client-id>` (see `.env.example`).
5. Point the frontend at the same realm/client via `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` (see `webapp-banner-tool/.env.example`).

The actual realm name, issuer URL, and client id used for this deployment are not part of this repository — they live only in the (git-ignored) local `.env` files.

## Rate Limiting
The public image endpoint (`GET /images/:channelName`) is rate-limited per client IP via `@nestjs/throttler`, using two limits enforced together:

| Name | Window | Limit |
|---|---|---|
| `burst` | 1 second | 5 requests |
| `per-minute` | 60 seconds | 60 requests |

This only applies to the public app — the admin/local app has no rate limiting of its own (it's already gated by authentication).

When a limit is exceeded, the response is **HTTP 429** with a JSON body (`{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }`) and headers reflecting *which* limit was hit — since two named throttlers are configured, the standard `@nestjs/throttler` headers come back with a per-limit suffix rather than a single unsuffixed name, e.g. `Retry-After-burst` or `Retry-After-per-minute` (seconds until that limit resets), alongside `X-RateLimit-Limit-<name>`, `X-RateLimit-Remaining-<name>`, and `X-RateLimit-Reset-<name>`. There is no plain `Retry-After` header on this endpoint.

## Health Checks
Both apps expose `GET /health/live` (process is running, no dependency checks) and `GET /health/ready` (checks the database connection; returns 503 with a minimal `{ "status": "error", "check": "database" }` body on failure, revealing nothing else). Both routes are reachable without a token even in the `local` app, for container/CI probes.

## Metrics
Both apps expose `GET /metrics` in the Prometheus text exposition format (via `prom-client`), covering HTTP request count/duration by method/route/status, upload success/failure, auth (401) and authorization (403) failure counts, TeamSpeak and database error counts, and SSRF-blocked request counts.

Access to `/metrics` is protected differently on each app, matching how each app is already protected everywhere else:

| App | Protection |
|---|---|
| `local` | Same global Keycloak JWT guard as every other route — not a special case. Point a Prometheus scrape job at it with a static bearer token configured in the scrape config (a normal Prometheus feature). |
| `public` | No Keycloak guard exists on this app by design, so `/metrics` is instead restricted to callers whose source IP is loopback or a private range (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, etc.) — anyone else gets a 403. Scrape it from the same host or network, not over the public internet. |

## SSRF Protection
Both URL-import endpoints (`POST /images-local/from-url` and `GET /images-local/img-from-url`) fetch a caller-supplied URL server-side, which is inherently an SSRF risk. Both endpoints go through the same hardening: the target's resolved IP addresses are checked against private/loopback/link-local/reserved ranges before connecting (and the connection is pinned to the addresses that were actually checked, closing the gap between "we checked DNS" and "we connected"), redirects are not followed automatically (each hop is re-validated the same way), and requests are subject to size and time limits. See `src/images/ssrf-guard.ts` and `src/images/safe-url-fetcher.ts` for the implementation.

## Docker Setup
Build and run with Docker Compose:

```powershell
docker compose run --rm migrate
docker compose up --build
```

The **`migrate` step is required** before the very first start, and again after any change to the Prisma schema/migrations — it is not run automatically by `docker compose up`. `docker-compose.yml` defines three services:

| Service | Purpose |
|---|---|
| `public` | The public image API (port 3000) |
| `local` | The admin/editing API (port 3001, bound to `127.0.0.1` only by default) |
| `migrate` | One-off: applies Prisma migrations against the shared database volume. Only runs via `docker compose run --rm migrate` — it has no `restart` policy and isn't started by `docker compose up`. |

`public` and `local` share a Docker image built from the repository's single `Dockerfile` (a multi-stage build: `builder`, which has the full toolchain including the Prisma CLI, and `runner`, the slim production image that both long-running services actually use). `migrate` builds from the `builder` stage instead, since the Prisma CLI is a dev dependency that `runner` deliberately excludes.

Both long-running services run as a non-root user and use SQLite via a named volume (`db-data`) mounted at `/data`; `restart: unless-stopped` and basic JSON-file log rotation are configured for both.

## Database
- Prisma schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`.
- SQLite by default (`DATABASE_URL=file:./dev.db` for local, non-Docker use).
- Outside Docker, apply migrations with:
  ```powershell
  npx prisma migrate deploy
  ```
  **This fails against the default relative `DATABASE_URL=file:./dev.db`** with `P1013: The provided database string is invalid`. The Prisma CLI parses `DATABASE_URL` itself and requires an absolute path for this command — unlike the app's own runtime (`src/prisma/prisma.service.ts`), which resolves a relative path manually against `prisma/` and works fine with the default as-is. Override `DATABASE_URL` with an absolute path just for this command, e.g.:
  ```powershell
  $env:DATABASE_URL = "file:$($PWD.Path -replace '\\','/')/prisma/dev.db"
  npx prisma migrate deploy
  ```
  ```bash
  DATABASE_URL="file:$(pwd)/prisma/dev.db" npx prisma migrate deploy
  ```
- Inside Docker, use the `migrate` service described above instead of running Prisma commands inside the long-running `public`/`local` containers.

## Environment Variables
Backend configuration is read from a root `.env` file — see `.env.example` for the full, current list and safe example values. Notable behaviors:

- `TS_USERNAME`/`TS_USERPASSWORD` (TeamSpeak ServerQuery credentials) have **no default fallback** — the admin app fails fast at startup if either is unset, rather than silently using a known default credential.
- `DATABASE_URL` defaults to `file:./dev.db` for local development, but is required (fails fast) when `NODE_ENV=production`.
- `OIDC_ISSUER_URL`/`OIDC_AUDIENCE` are required — there is no default issuer or audience to validate JWTs against.
- `CORS_ORIGINS` is a comma-separated allowlist for the admin API; if unset, no cross-origin browser access is enabled at all (no wildcard fallback).

Frontend configuration is read from a `.env` file in `webapp-banner-tool/` — see `webapp-banner-tool/.env.example` for the full list (`VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_KEYCLOAK_ENABLED`, `VITE_KEYCLOAK_ADMIN_ROLE`, `VITE_KEYCLOAK_EDITOR_ROLE`, `VITE_PUBLIC_API_URL`, `VITE_ADMIN_API_URL`).

Never commit either `.env` file.

## Scripts

Backend (root `package.json`):

| Script | Purpose |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:public` / `npm run start:local` | Run the compiled public/local app |
| `npm run start:dev` / `npm run start:debug` | Run via `nest start --watch` (with/without debugger) |
| `npm run lint` | Lint (no auto-fix) |
| `npm run lint:fix` | Lint with auto-fix |
| `npm run typecheck` | Type-check only, no emit |
| `npm test` / `npm run test:watch` / `npm run test:cov` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run format` | Prettier |

Frontend (`webapp-banner-tool/package.json`):

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then build with Vite |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check only (`tsc -b`) |
| `npm test` | Unit tests (Vitest + React Testing Library) |
| `npm run preview` | Preview a production build locally |

## Node Version
The Node version is pinned in `.nvmrc` (currently `22`). Use a Node version manager (e.g. `nvm use`) to match it, both locally and in CI.

## Continuous Integration
`.github/workflows/ci.yml` runs on every push and pull request:

- **Backend job:** install, generate Prisma client, lint, typecheck, build, unit tests.
- **Frontend job:** install, lint, typecheck, build, unit tests.
- **Docker build job:** validates that the backend's `builder`/`runner` stages and the frontend image all actually build (nothing is pushed anywhere in this job).

On a push to `main`, once the three jobs above have all passed, two more run:

- **`version-tag`:** compares the root `package.json` version against existing git tags. If `vX.Y.Z` doesn't already exist as a tag, it's created and pushed. Root `package.json` is the single source of truth for the version — `webapp-banner-tool/package.json` is expected to always match it, and this job fails loudly if they've drifted apart instead of guessing which one is right.
- **`publish-images`:** builds and pushes both Docker images to GHCR — `ghcr.io/<owner>/ts-icon-backend` and `ghcr.io/<owner>/ts-icon-frontend`. Every push to `main` updates the `latest`/`main`/`sha-<short-sha>` tags; a `vX.Y.Z` tag is added only on the push where `version-tag` actually created that tag. The frontend image's `VITE_*` values (baked into the JS bundle at build time — see `webapp-banner-tool/Dockerfile`) come from this repo's Actions **Variables** (not Secrets, since they end up visible in the shipped JS bundle anyway); until `VITE_PUBLIC_API_URL`/`VITE_ADMIN_API_URL`/`VITE_KEYCLOAK_URL`/`VITE_KEYCLOAK_REALM`/`VITE_KEYCLOAK_CLIENT_ID`/`VITE_KEYCLOAK_ENABLED`/`VITE_KEYCLOAK_ADMIN_ROLE`/`VITE_KEYCLOAK_EDITOR_ROLE` are set there, the published frontend image is built against empty config and isn't yet meaningful to deploy as-is.

Neither job deploys anywhere — that still needs host/SSH secrets that aren't configured yet.

## License
MIT — see `LICENSE`.
