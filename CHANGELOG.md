# Changelog

## [Unreleased]

### Added

- `TS_MOCK_MODE=true` runs the `local` app against an in-memory fake TeamSpeak server (refused under `NODE_ENV=production`) (T-141).
- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `ts-icon-kb`); old Codex delegation rules removed from `AGENTS.md` (T-141).

### Changed

- The admin UI runs on a new layered design system (`webapp-banner-tool/src/design`): Apple HIG roles and iOS metrics with TeamSpeak navy and blue, light and dark themes, a contrast test, and a HIG sidebar app shell with a collapsible sidebar and the live channel-tree panel beside or below the content; design decisions in `docs/design/DESIGN.md` (T-142).
