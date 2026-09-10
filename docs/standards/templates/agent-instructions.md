# Project-standard instruction fragment

Merge the following into the repository's existing `AGENTS.md` or other agent instructions.
Adjust the profile path if needed. This file is a template; it does not install global rules.

> Read `docs/PROJECT_PROFILE.md` before changing formatting, development startup, build or version
> tooling. Follow the adopted baseline linked there and the actual project command map. Preserve
> unrelated local changes. Use the declared formatter for each file type and check changed files;
> keep repository-wide formatting separate from functional work. Start the complete application
> through its documented launcher and verify readiness and source identity. Rebuild before tests
> that serve generated assets; restart a backend that does not reload. Change versions through the
> declared updater, keeping manifest copies synchronized. Report checks actually performed and
> pending requirements accurately. A version update must not implicitly commit, push or publish.
>
> Handle small or tightly coupled changes directly. For substantial work with independently useful
> subtasks, use the available `orchestrated-development` skill when delegation adds clear value.
> Give each worker a concise, self-contained brief with explicit file ownership; workers do not
> delegate further and must preserve shared changes. Keep the configured model and reasoning
> defaults unless user or project instructions select different settings. The lead reviews actual
> changes and scoped verification evidence before accepting them. If the workflow skill is not
> available, apply the same scope, ownership and review discipline directly without blocking work.
