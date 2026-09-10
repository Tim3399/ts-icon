# ts-icon admin frontend

React and Vite interface for channel banners and recoverable wallpaper operations. See the [root README](../README.md) for Keycloak, both APIs, Docker and the complete setup.

## Development

Use the repository's Node version, copy `.env.example` to `.env`, configure the two APIs and Keycloak, then run from this directory:

```sh
npm ci
npm run dev
```

For the complete application, run `npm run setup` and `npm run dev` from the repository root. Local development without Keycloak requires both frontend `VITE_KEYCLOAK_ENABLED=false` and backend `AUTH_DISABLED=true`; it only works on loopback. Real settings belong in git-ignored `.env` files.

## Checks

| Command                    | Purpose                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run lint`             | ESLint, including configuration and browser tests                                                  |
| `npm run typecheck`        | TypeScript project checks                                                                          |
| `npm test`                 | Vitest component, API client, auth and build-configuration tests                                   |
| `npm run test:e2e:install` | Install Chromium for the browser workflows                                                         |
| `npm run test:e2e`         | Desktop/mobile/tablet and zoom-layout workflows with the real Cropper and controlled API responses |
| `npm run build`            | Typecheck and production build; requires explicit valid API and Keycloak settings                  |
| `npm run preview`          | Serve an existing build locally                                                                    |

Run `npm run format` or `npm run check:format` from the repository root to apply the shared QuiltOR formatting rules.

Browser tests own their Vite server on port 5178. Set `TS_ICON_E2E_PORT` to another available port (1024–65535) when another project uses it. The test URL and server port change together; tests never reuse an existing server.

## Production settings

`VITE_PUBLIC_API_URL` may be empty for same-origin image requests. The included nginx uses `/admin-api` as `VITE_ADMIN_API_URL`. Set `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM` and `VITE_KEYCLOAK_CLIENT_ID` to the real public client; role names must match the backend. Query strings, fragments and example placeholders are rejected during the build. Changing these settings requires rebuilding the frontend.

Browser tests intentionally simulate the API; real Keycloak login, TeamSpeak channel creation and server permissions require a separate installation check described in [operations](../docs/operations.md).
