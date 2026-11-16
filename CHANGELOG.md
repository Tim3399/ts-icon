# Changelog

## [Unreleased]

## [0.12.0] - 2026-11-16

### Added

- The Banner editor accepts an image pasted from the clipboard (Ctrl+V or ⌘V: image data or an image URL) and dropped anywhere on the page (T-142).
- The Banner editor shows a live TeamSpeak preview of the cropped banner in a channel-tree mock with the TeamSpeak 6 row geometry, plus the exact 500 × 44 saved image (T-142).
- The Banner editor compares the channel's current banner with the new crop (before/after) and sets the crop by numbers: X, Y, W and H in source pixels, with W and H locked to 500 : 44 (T-142).
- `GET channels` also returns `size` (bytes) and `updatedAt` for channels with an image, for the Studio inspectors (T-142).
- `TS_MOCK_MODE=true` runs the `local` app against an in-memory fake TeamSpeak server (refused under `NODE_ENV=production`) (T-141).
- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `ts-icon-kb`); old Codex delegation rules removed from `AGENTS.md` (T-141).

### Changed

- The admin UI is redesigned as a "Studio" workspace (concept D2) on a layered design system (`webapp-banner-tool/src/design`): a top bar with the workspace switcher, canvas tools and an account menu with the theme choice and logout; the Banner editor with the live channel tree as a layer panel, a dot-grid canvas with the crop, the TeamSpeak preview in a dock and an inspector; tables with an inspector on the other pages; light first with a derived dark theme, colour only for highlights, TeamSpeak colours only in TeamSpeak previews, macOS metrics from 1024 px and iOS metrics below; design decisions in `docs/design/DESIGN.md` (T-142).

### Fixed

- `npm run setup` with `TS_MOCK_MODE=true` no longer asks for `TS_USERNAME` and `TS_USERPASSWORD` and runs to the end, as the README states (V-0.12.0-F1).
- Manage channel images and Banner URLs keep the channel list on screen while it reloads after an image change or a banner URL update, instead of replacing it with a loading state, and the keyboard focus no longer falls to the page: after a confirmed removal it moves to the channel's row, and a busy button keeps it (V-0.12.0-F4).

### Security

- Dependency security updates so that all `npm audit` steps of CI pass: the NestJS packages to 11.2.10 (`@nestjs/swagger` 11.4.8), `multer` 2.5.0 (its pin to 2.3.0 under `@nestjs/platform-express` is removed), `sharp` 0.35.5, and patched transitive packages (`proxy-addr`, `body-parser`, `follow-redirects`, `handlebars`, `brace-expansion`; in the frontend `vite` 7.3.8, `vitest` 4.1.12, `undici`, `source-map-js`) (V-0.12.0-F1).
