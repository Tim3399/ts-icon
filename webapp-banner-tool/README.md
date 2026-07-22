# ts-icon — admin frontend

React + Vite admin UI for [ts-icon](../README.md): logging in, picking a TeamSpeak channel, and cropping/uploading its banner image. This is one half of a two-part system — see the [root README](../README.md) for the full architecture, the two backend apps this talks to, API reference, and Keycloak setup.

## Running standalone

```powershell
npm install
npm run dev
```

Opens on `http://localhost:5173` by default. By default it points at a backend running on `localhost:3000`/`3001` — see [Configuration](#configuration) below to point it elsewhere.

Other scripts:

| Script | Purpose |
|---|---|
| `npm run build` | Type-check (`tsc -b`) then build with Vite |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check only (`tsc -b`) |
| `npm test` | Unit tests (Vitest + React Testing Library) |

## Configuration

Copy `.env.example` to `.env` and adjust as needed. Full variable list and current defaults live in `.env.example` and `src/config.ts`; the notable ones:

- `VITE_PUBLIC_API_URL` / `VITE_ADMIN_API_URL` — base URLs of the two backend apps (see the root README's Architecture section).
- `VITE_KEYCLOAK_URL` / `VITE_KEYCLOAK_REALM` / `VITE_KEYCLOAK_CLIENT_ID` — Keycloak connection details.
- `VITE_KEYCLOAK_ADMIN_ROLE` / `VITE_KEYCLOAK_EDITOR_ROLE` — realm role names granting admin/editor access; override if your realm uses different names.
- `VITE_KEYCLOAK_ENABLED=false` skips the login screen, **but only when served from `localhost`/`127.0.0.1`/`::1`**, and **only** disables this frontend's own login redirect — the admin backend still requires a real token on every request unless it's *also* configured for no-auth mode. See the root README's [Quickstart](../README.md#quickstart) for how the two are meant to be used together (`AUTH_DISABLED=true` on the backend).

Never commit `.env`.

## Testing

Unit tests (`npm test`) use Vitest + React Testing Library. `src/auth/`, `src/components/Toast.tsx`, and `src/App.tsx`'s routing/access-guard behavior all have dedicated specs — check those for the testing patterns already in use before adding new ones (mocking `useAuth()`/`useCanUpload()` rather than the real Keycloak client, `vi.hoisted`/`vi.doMock` for module-level mocks, etc.).

## See also

The [root README](../README.md) covers the full picture this frontend is one piece of: the two backend apps and their API reference, authentication/authorization end to end, Docker Compose setup, and CI/CD.
