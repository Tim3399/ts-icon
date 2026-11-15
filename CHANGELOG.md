# Changelog

## [Unreleased]

### Added

- The Banner editor accepts an image pasted from the clipboard (Ctrl+V or ⌘V: image data or an image URL) and dropped anywhere on the page (T-142).
- The Banner editor shows a live TeamSpeak preview of the cropped banner in a channel-tree mock with the TeamSpeak 6 row geometry, plus the exact 500 × 44 saved image (T-142).
- `TS_MOCK_MODE=true` runs the `local` app against an in-memory fake TeamSpeak server (refused under `NODE_ENV=production`) (T-141).
- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `ts-icon-kb`); old Codex delegation rules removed from `AGENTS.md` (T-141).

### Changed

- The admin UI is redesigned on a layered design system (`webapp-banner-tool/src/design`) with an Apple HIG and GitHub Primer structure: grouped list sections, one page header with toolbar actions, colour only for highlights (the one primary action, selection, focus, links and status glyphs), TeamSpeak navy and blue in light and dark themes, macOS metrics from 1024 px and iOS metrics below, a source-list sidebar and an account menu with the theme choice and logout; design decisions in `docs/design/DESIGN.md` (T-142).
