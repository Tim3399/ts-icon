# Agent workflow

Read `docs/PROJECT_PROFILE.md` before changing formatting, development startup, build or version tooling. Follow the adopted baseline and actual command map linked there. Use the declared formatter for each file type; keep repository-wide normalization separate from functional changes. Preserve the immutable `docs/standards/` snapshot and record project-specific adaptations in the profile.

Use the documented complete launcher and verify readiness and source identity before claiming a successful local start. Rebuild before testing generated assets. The profile records current startup and build-identity gaps; do not treat pending requirements as passing gates. Version preparation must keep manifest copies synchronized and must not implicitly commit, push, tag or publish; the existing CI release helper is not a local version updater.

Keep small or tightly coupled changes with the lead. For substantial work with independently useful subtasks, use the `orchestrated-development` skill when available. If delegating without the skill, give each worker a self-contained brief with exclusive file ownership, acceptance criteria, exclusions, and relevant verification. Workers do not delegate. If the runtime cannot delegate, the lead completes the work directly. The lead reviews the actual diff and check evidence before accepting it.

Use the configured model and reasoning defaults unless the user chooses otherwise; do not duplicate model values in project files.

Treat `README.md` and `package.json` as the command sources. Select checks that cover the change from `npm run check:format`, `npm run lint`, `npm run build`, `npm test -- --runInBand`, `npm run test:e2e`, and `npm run test:ops`, including the separately listed frontend checks when that workspace changes. Preserve unrelated edits and database state. Report exact commands and outcomes, and identify checks that were not run.

The shared workflow policy is maintained in `../ai-infra/codex/AGENTS.md`; keep this file focused on local entry points.
