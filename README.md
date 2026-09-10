# ts-icon

Manage TeamSpeak channel banners with a NestJS image API and a React admin interface. Images are decoded and stored as 500 × 44 PNGs. Channel IDs keep images stable across renames and duplicate channel names. Wallpaper generation records recoverable operations, including partial failures and undo.

## Local development

Use **Node 22.23.2** (see `.nvmrc`) and npm 11.7.0. The project also accepts npm 10.9+; the Windows launcher must resolve to a functioning Node/npm installation.

1. Copy `.env.example` to `.env` and `webapp-banner-tool/.env.example` to `webapp-banner-tool/.env`.
2. Set your TeamSpeak ServerQuery host, transport, username and password.
3. Choose authentication: configure Keycloak below, or set **both** `AUTH_DISABLED=true` in the root file and `VITE_KEYCLOAK_ENABLED=false` in the frontend file for local development.
4. Run:

```sh
npm run setup
npm run dev
```

Setup installs both lockfiles, validates the required settings, generates Prisma, applies migrations and builds the backend. It never overwrites existing environment files. On a completely fresh checkout, `npm run setup -- --local` creates examples with the local auth flags; fill in the reported missing TeamSpeak settings and rerun setup.

Open [the local UI](http://localhost:5173). The public API runs on port 3000 and the admin API on 3001. The combined dev command watches all three processes; Ctrl+C stops its process tree. Individual commands:

| Command                                        | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `npm run dev:public` / `npm run dev:local`     | Watch one backend with its explicit entry point |
| `npm run debug:public` / `npm run debug:local` | Debug on loopback ports 9230 / 9229             |
| `npm run build`                                | Compile backend and shared tooling              |
| `npm run start:public` / `npm run start:local` | Start the previously built applications         |
| `npm run dev --prefix webapp-banner-tool`      | Start only Vite                                 |

With authentication disabled, the admin listener and guard accept **loopback only**. This mode is rejected under `NODE_ENV=production`. It does not grant LAN access. The frontend independently allows its no-login setting only on a localhost origin.

## Docker Compose

Compose includes **frontend, public API, admin API and database migration**, with schema readiness checks and a persistent SQLite volume. It requires real Keycloak settings and HTTPS public URLs in production.

```sh
cp .env.docker.example .env
# Edit .env: TeamSpeak credentials/host, public HTTPS URL and both OIDC/VITE settings.
docker compose up --build --wait
```

Open [the local frontend entry](http://localhost:8088). For a deployed installation, put your HTTPS reverse proxy in front of this port and register that external origin in Keycloak. Ports are bound to loopback by default. `PUBLIC_BASE_URL` must be the HTTPS address that TeamSpeak clients can actually reach, not a Docker service name.

- `TS_HOST` is respected. For TeamSpeak on the Docker host, use `host.docker.internal`; Compose includes Linux's host-gateway mapping. A remote host or another reachable container can also be configured.
- Frontend requests use the same origin: `/admin-api` proxies to the admin API and `/images` to the public API.
- Frontend configuration is checked at build time. Missing/example Keycloak values fail the build. Changing `VITE_*` requires rebuilding; container environment variables do not rewrite an existing JS bundle.
- Compose assigns the frontend `172.30.20.10` in subnet `172.30.20.0/24` and trusts that exact proxy IP by default. If this subnet conflicts with an existing network, change the subnet, frontend IP and backend trusted-proxy setting together.
- The public nginx entry blocks both metrics paths. See [operation and proxy configuration](docs/operations.md) for additional proxy hops, backups and updates.

Do not use `docker compose down --volumes` for an update: that deletes the persistent database.

## Keycloak

Create a **public client** with Standard Flow enabled, client authentication disabled, and PKCE S256. Register the exact frontend redirect origins; avoid production wildcards. Create the realm roles `ts-icon-editor` and `ts-icon-admin`, and assign them to users/groups.

| Backend setting                                             | Frontend setting                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL=https://login.example.com/realms/my-realm` | `VITE_KEYCLOAK_URL=https://login.example.com`, `VITE_KEYCLOAK_REALM=my-realm` |
| `OIDC_AUDIENCE=ts-icon`                                     | `VITE_KEYCLOAK_CLIENT_ID=ts-icon`                                             |
| `OIDC_EDITOR_ROLE`, `OIDC_ADMIN_ROLE`                       | `VITE_KEYCLOAK_EDITOR_ROLE`, `VITE_KEYCLOAK_ADMIN_ROLE`                       |

The backend verifies RS256 signatures against the issuer's JWKS, issuer, expiry/not-before, **`typ=Bearer`** and **`azp` equal to the configured client ID**. `OIDC_AUDIENCE` is the historical name of the setting checked against `azp`; it is not an `aud` matcher. ID tokens and access tokens with the wrong client are rejected. Admin includes editor permissions.

Outside production, `/swagger` provides OAuth2/PKCE and Bearer authorization for interactive API documentation. It shares the application's access-token policy. Swagger is disabled in production.

## Main workflows and API

Select channels by their CID; the UI shows names and parent context. The gallery supports upload, deletion, search and image-state filters. Crop controls work with keyboard and touch, and preserve the selected content when the preview size changes. Saved-image previews refresh immediately.

Wallpaper preview/generation is admin-only. Each generation has a persistent run ID and idempotency key. The UI can reload operation history, resume partial work and retry partial undo. Undo is limited to that operation's channels and refuses unsafe deletion of changed/occupied channels.

| API                                                             | Access                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /images/by-id/:cid.png`                                    | Public stable channel image; PNG, ETag and revalidation  |
| `GET /images/:legacyName.png`                                   | Public legacy URL; ambiguous aliases return 409          |
| `GET /images/wallpaper/:runId/:position.png`                    | Public recorded wallpaper image                          |
| `GET /images-local/channels`                                    | Editor; `items` contains CIDs and image metadata         |
| `POST/DELETE /images-local/channels/:cid/image`                 | Editor; multipart field `file` for upload                |
| `POST /images-local/from-url`, `GET /images-local/img-from-url` | Editor; bounded HTTPS image fetch                        |
| `GET/POST /images-local/spacer-base-image`                      | Editor; shared spacer fallback                           |
| `GET /images-local/options`                                     | Admin; stored image metadata                             |
| `GET /images-local/channels/banner-urls`                        | Admin; live banner settings                              |
| `PATCH /images-local/channels/:cid/banner-url`                  | Admin; set one stable managed URL                        |
| `POST /images-local/channels/apply-banner-urls`                 | Admin; bulk update with partial results                  |
| `/images-local/channel-wallpaper/*`                             | Admin; preview, generation, runs, resume and undo        |
| `GET /health/live`, `GET /health/ready`                         | Unauthenticated health; readiness checks required schema |

The public image API applies burst and per-minute limits. Downloads and image processing enforce byte/pixel/deadline/concurrency limits. Expected errors include a safe message and request ID; secrets and raw image bytes are excluded from logs. Never use the image URL-import mechanism as a general HTTP proxy.

DTO validation errors also include `fieldErrors`, mapping input names to arrays of messages. The UI associates known fields with their inputs and preserves a general error for failures that need a retry or cannot be assigned to a field.

## Database and maintenance

Both applications and all `db:*` commands share one SQLite path resolver. `file:./dev.db` means `prisma/dev.db` in local development; Docker uses `file:/data/dev.db`. Absolute `file:C:/...` and `file:///...` URLs are supported.

```sh
npm run db:generate
npm run db:migrate
npm run db:check
npm run db:backup -- --output backups/manual.db
npm run db:dry-run
npm run backfill:channel-ids
```

`db:dry-run` applies migrations to a disposable copy. The channel-ID backfill also defaults to a dry run and reports ambiguous names/aliases; `--apply` writes only unambiguous assignments after creating a verified backup. Existing IDs are never reassigned automatically.

A restore defaults to validation only:

```sh
npm run db:restore -- --source backups/manual.db
# Stop both backend applications, then:
npm run db:restore -- --source backups/manual.db --apply --offline
```

The previous database is retained beside the target. Read [the full backup, restore and update procedure](docs/operations.md) before operating on a deployed database.

## Checks and formatting

The adopted [project profile](docs/PROJECT_PROFILE.md) maps commands, formatter ownership, agent workflow and outstanding requirements to the vendored [engineering standard 1.1.0](docs/standards/README.md). Agents follow `AGENTS.md`; project-specific adaptations belong in the profile.

`npm run check` runs formatting, backend/frontend lint and type checks. Tests and production builds are separate gates. On Windows, use `npm.cmd` if a PowerShell `npm` shim points to a missing CLI.

```sh
npm run check
npm run build
npm run build --prefix webapp-banner-tool
npm test -- --runInBand
npm run test:e2e
npm run test:ops
npm test --prefix webapp-banner-tool
npm run test:e2e:install --prefix webapp-banner-tool
npm run test:e2e --prefix webapp-banner-tool
```

Formatting follows the adopted standard: Biome 2.5.7 formats JS/TS/JSX/TSX/JSON/CSS with two spaces, double quotes, semicolons, 100 columns and LF. Prettier 3.9.6 formats Markdown/YAML/HTML only. `npm run format` applies both; ESLint checks code quality separately. Use the respective formatter on changed files during feature work; reserve the full write command for a dedicated normalization change.

CI runs app checks on Windows and Linux, real Chromium workflows at desktop/mobile/tablet sizes and a 200%-zoom-equivalent layout, and container startup/restore checks. The browser tests use a local API fixture; they complement backend integration tests and do not claim to prove a real TeamSpeak/Keycloak installation. Current audit implementation and verification results are recorded in [UMSETZUNG.md](UMSETZUNG.md).

Main-branch releases validate frontend settings before publication, build both candidate images and then publish the paired aliases. Retry preserves an existing commit's version reservation and repairs a partial release. Deploy the **two digests from the same successful release manifest**, rather than independently updating mutable `latest` tags. See [release procedure and dependency policy](docs/operations.md).

## License

MIT — see [LICENSE](LICENSE).
