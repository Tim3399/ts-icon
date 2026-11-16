# Project-standard instruction fragment

Merge the following into the repository's existing `AGENTS.md` or other agent instructions.
Adjust the profile path if needed. This file is a template; it does not install global rules.

> Read `docs/PROJECT_PROFILE.md` before changing formatting, language profiles, development
> startup, build/version tooling or CI/CD. Follow its adopted component versions, retained exceptions
> and actual command map. Run a project-standard Check or Update only when the user requests it;
> ordinary feature work does not trigger startup, adoption or a baseline update. Update only the
> requested `agents`, `formatting`, `languages`, `tooling` or `cicd` scopes, preserve local overrides and
> locked versions outside them, and record checks actually performed without rewriting historical
> evidence. Use each file type's declared formatter and keep repository-wide formatting separate
> from functional work, and run `check:format` (the npm script name; in projects with `@tim/agent-team`,
> `agent-team check-format` fulfils it) before reporting a change as done. A standard or product version update must not implicitly commit, push or
> publish.
>
> Preserve the project's agent instructions, configured model and reasoning defaults, and local
> overrides unless the user requests a change. Handle small or tightly coupled changes directly.
> In projects with `@tim/agent-team`, delegation follows the roles in `AGENTS.md`; skip the rest of
> this paragraph. For substantial work with independently useful subtasks, use the available
> `orchestrated-development` skill when delegation adds clear value; otherwise apply the same
> ownership and review discipline directly. Assign explicit file ownership, require workers not
> to delegate further or revert shared changes, and review their actual diff and scoped checks.
