# Project engineering profile

Copy this file to `docs/PROJECT_PROFILE.md`. Replace the fill-in values with verified project
facts; remove this paragraph when adoption is complete. A pending value is not a completed gate.

## Adoption

| Field                       | Value                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Project/product             | To be filled in                                                          |
| Baseline target             | Cross-project engineering standard 1.5.0                                 |
| Baseline location           | `docs/standards/README.md` or immutable shared-repository revision       |
| Mode and requested scopes   | Start / Check / Update; agents / formatting / languages / tooling / cicd |
| Overall status              | Derived from component rows; do not advance past incomplete scopes       |
| Active profiles             | Web / Documentation / Python / Rust / Go / other, only where present     |
| Supported developer systems | To be filled in                                                          |

Record each scope independently. `Adopted version` is the last version actually completed;
`Target version` is the version being assessed or applied. Use unknown when history is missing;
pending, partial, adopted, excepted or inapplicable for known states; and conflicted when sources
disagree. Point to dated verification below. A partial update must not change unrequested rows.

| Scope      | Component            | Adopted version | Target version  | Status          | Evidence / retained exception |
| ---------- | -------------------- | --------------- | --------------- | --------------- | ----------------------------- |
| Agents     | Agent instructions   | To be filled in | To be filled in | To be filled in | To be filled in               |
| Formatting | Core ownership       | To be filled in | To be filled in | To be filled in | To be filled in               |
| Languages  | One row per profile  | To be filled in | To be filled in | To be filled in | To be filled in               |
| Tooling    | Commands and runtime | To be filled in | To be filled in | To be filled in | To be filled in               |
| CI/CD      | Delivery pipeline    | To be filled in | To be filled in | To be filled in | To be filled in               |

Preserve the previous expected baseline as a copied immutable snapshot or an immutable revision.
Do not edit older verification entries when targets change.
Older profiles without a CI/CD row have no established adoption for that scope. Add its record
only during a requested adoption or Update; Check reports it without writing. Never advance
other rows implicitly.

## Formatting and toolchains

Record authoritative config paths, exact formatter versions, excluded/generated files and
every maintained source file type, including embedded formats and framework components. Every
active profile must appear in both formatting and formatting checks, with exactly one formatter
owner per file type.

| Item                         | Source/configuration              | Value or policy                                         |
| ---------------------------- | --------------------------------- | ------------------------------------------------------- |
| Runtime/build pins           | To be filled in                   | Exact versions; distinguish supported development range |
| Package manager and lockfile | To be filled in                   | To be filled in                                         |
| Formatter owners             | To be filled in                   | To be filled in                                         |
| Editor and Git whitespace    | `.editorconfig`, `.gitattributes` | To be filled in                                         |
| Pin consistency gate         | To be filled in                   | CI command checking duplicated runtime pins             |

For each language profile, record its maintained-source inventory, formatter ownership, exact
compatible runtime/tool pins, native write and check entrypoints, CI/editor integration and
exclusions. Preserve locked versions outside the requested update scope.

## Command map

Replace with actual working commands. Mark inapplicable capabilities with their reason; mark
missing required commands as pending. Note which suites are outside the aggregate checks.

| Operation                 | Command         | Scope/prerequisites                                        |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| Install                   | To be filled in | Locked dependency install                                  |
| Doctor                    | To be filled in | To be filled in                                            |
| Complete local start      | To be filled in | To be filled in                                            |
| Frontend-only development | To be filled in | To be filled in                                            |
| Format / check format     | To be filled in | All active language profiles                               |
| Static checks             | To be filled in | List included gates                                        |
| Production build          | To be filled in | To be filled in                                            |
| Unit / backend tests      | To be filled in | Separate commands if necessary                             |
| End-to-end tests          | To be filled in | Built assets or source server, server ownership, test data |
| Release preflight         | To be filled in | To be filled in                                            |
| Version update            | To be filled in | Source and updated manifests                               |

## Local runtime

| Service             | Bind address/default port | Override/config source | Readiness and identity |
| ------------------- | ------------------------- | ---------------------- | ---------------------- |
| Frontend            | To be filled in           | To be filled in        | To be filled in        |
| Backend, if present | To be filled in           | To be filled in        | To be filled in        |

Document proxy configuration, startup deadline, owned-process cleanup, backend reload, dev-data
paths and isolation for parallel projects/worktrees. Include one complete alternate-port example
for a supported shell. Distinguish production-preview and development URLs.

## Version and release

Record the authoritative product version source, synchronized manifests, version command
transaction behavior, version compatibility policy and frontend build metadata. State whether
build output is tracked and why, where freshness is checked, the exact publication trigger and
how verified artifacts are reused without rebuilding.

## CI/CD

Record the provider/workflow paths, PR and branch checks with their local command equivalents,
required check names, tagged-release/version policy, and supported artifact targets. Separate CI,
publication, and deployment status; CI without CD is a valid choice with a stated reason.
Name the publication/deployment triggers, artifact verification, permissions, environments,
concurrency, and recovery policy. Record secret names only. Preserve existing release-policy
exceptions explicitly. For a larger pipeline, use the optional
[CI/CD profile template](CI_CD_PROFILE.md) in `docs/CI_CD_PROFILE.md` and replace this link with
the actual profile path; for a small project, keep the relevant facts here.
Distinguish declared configuration, read-only remote-setting evidence, and actual verified runs.

## Exceptions and pending work

| Scope / component | Requirement     | Actual behavior/status | Reason          | Follow-up/review condition |
| ----------------- | --------------- | ---------------------- | --------------- | -------------------------- |
| To be filled in   | To be filled in | To be filled in        | To be filled in | To be filled in            |

## Verification

For Start and Update, append date, mode, requested scopes, immutable expected baseline revision,
checks actually run and their results. A Check reports the same fields without editing this file
or any other local file. For partial adoption, identify requirements that remain unverified.
Language profile evidence includes a disposable representative drift case that the check rejects,
write followed by a passing check, a second write with no diff, and relevant behavioral tests.
Keep evidence specific to this project and change; never replace historical expected results with
current ones.

| Date | Mode / requested scopes | Immutable expected baseline | Actual state inspected | Checks and results | Component status changes |
| ---- | ----------------------- | --------------------------- | ---------------------- | ------------------ | ------------------------ |
| TBD  | To be filled in         | To be filled in             | To be filled in        | To be filled in    | To be filled in          |
