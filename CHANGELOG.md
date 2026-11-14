# Changelog

## [Unreleased]

### Added

- Mock dev stack: `TS_MOCK_MODE=true` runs the `local` app against an in-memory fake TeamSpeak server (refused under `NODE_ENV=production`); `docker-compose.dev.yml` starts the whole app with it and with authentication disabled (T-141).
- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `ts-icon-kb`); old Codex delegation rules removed from `AGENTS.md` (T-141).
