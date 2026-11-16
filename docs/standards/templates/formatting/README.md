# Formatting templates

Merge these settings into the target repository's existing configuration. Review each
diff before applying it; do not overwrite configuration or run a repository-wide format
as a side effect of adopting the standard. Keep only the profiles the project uses.
Formatting and the format check are mandatory (README section 2).

The destination for `biome.template.json` is the target repository's root `biome.json`.
Its template filename prevents Biome from treating this documentation folder as a second
active project root. `ruff.template.toml` is the same for Ruff (destination `ruff.toml`).
The other configuration files keep their names at the target root.
The schema path resolves against the target project's installed Biome package.

Illustrative tool versions for these templates are Biome 2.5.7, Prettier 3.9.6, Ruff 0.16.4
and Rust 1.98.0. They are examples, not verified latest releases or permanent requirements.
Select compatible versions for the project, pin them, commit its lockfiles, and upgrade them
through a reviewed change. Last checked 2026-11-04. In projects with `@tim/agent-team`,
`check-format` pins these exact versions (`lib/format-profiles.mjs`); they change only with a
package update.

## Ownership

| Files                                                        | Authoritative formatter         | Profile       |
| ------------------------------------------------------------ | ------------------------------- | ------------- |
| JavaScript, JSX, MJS, CJS, TypeScript, TSX, JSON, JSONC, CSS | Biome                           | Web           |
| Python                                                       | Ruff                            | Python        |
| Markdown, YAML, HTML                                         | Prettier                        | Documentation |
| Rust                                                         | rustfmt                         | Rust          |
| Go                                                           | gofmt                           | Go            |
| General whitespace and line endings                          | EditorConfig and Git attributes | Core          |

The formatter owns layout; EditorConfig makes editing agree with it, and Git attributes
keep checkout line endings consistent. Four spaces are the indentation everywhere. The only
exceptions are the ones a tool forces: Makefile recipes and Go use tabs. Preserve Markdown
trailing spaces because they may represent a line break.

The width of 100 is a formatter target, not a hard maximum for every line. Markdown
prose keeps its existing wrapping. Do not manually rewrite output accepted by the owner.

The templates deliberately assign no owner to other file types such as Svelte, Vue,
SCSS, GraphQL or TOML. A project using them must document and configure an appropriate
formatter before including them in its aggregate check.

Limit editor format-on-save settings to the same owners. Invoke Prettier with the
documentation globs below; a broad `prettier --write .` would also format files owned
by Biome. Generated output, dependencies, virtual environments, reports, runtimes and
model files stay outside formatting. Adjust exclusions to actual project paths and keep
the owners' ignore policies aligned; a source directory named `models` must remain
included if it contains maintained source code.

## Commands for a web repository with documentation

Merge this fragment into `package.json`; it is not a replacement manifest. Projects
without one of these profiles omit its command from the aggregate. Use project-local,
pinned tools installed through the project's documented setup.

```json
{
    "scripts": {
        "format": "npm run format:web && npm run format:docs",
        "format:web": "biome format --write .",
        "format:docs": "prettier --write \"**/*.{md,yml,yaml,html}\"",
        "check:format": "npm run check:format:editorconfig && npm run check:format:web && npm run check:format:docs",
        "check:format:editorconfig": "editorconfig-checker",
        "check:format:web": "biome format .",
        "check:format:docs": "prettier --check \"**/*.{md,yml,yaml,html}\""
    }
}
```

`npm run format` writes corrections. `npm run check:format` is read-only, returns a
failure for drift and is a mandatory gate: it belongs to the verification entry point
(`npm run check`) and runs in CI. Keep the same active profiles in both aggregates.
`editorconfig-checker` verifies the files against `.editorconfig`; pin it like the other
tools: pin the npm package and set `EC_VERSION` for the binary, because the wrapper otherwise
loads the latest binary. Formatting is separate from linting, type checking and tests; give those their own
commands and include the relevant checks in the project's quality gate.

## Optional Python profile

Copy `ruff.template.toml` to `ruff.toml`, or merge its keys into `pyproject.toml` under
`[tool.ruff]` and `[tool.ruff.format]`, preserving existing build, application and lint
settings. It sets `indent-width = 4` and `line-length = 100`.

The runtime minimum and release build interpreter can differ. A formatter must never
introduce syntax unsupported by the runtime minimum. Markdown is explicitly excluded
from Ruff so documentation stays with Prettier.

For repositories using a compatible interpreter resolver:

```json
{
    "scripts": {
        "format:python": "node tools/dev/python.mjs --needs ruff -m ruff format .",
        "check:format:python": "node tools/dev/python.mjs --needs ruff -m ruff format --check ."
    }
}
```

The resolver is project code and is not included in this template pack. Supply or adapt
it before adopting these two scripts; it must select a compatible interpreter that can
import the required module. A project's environment runner is another valid choice.
Use the same environment in the editor, terminal and CI, with the pinned Ruff installed
there. A bare `python` selected from an unverified Windows PATH is insufficient.

Add `npm run format:python` and `npm run check:format:python` to their respective
aggregates. A Python-only project can expose the same write/check distinction through
its native task runner without adding Node solely for orchestration.

## Optional Rust profile

Commit a `rust-toolchain.toml` naming an exact project-approved Rust version and the
`rustfmt` component. The source snapshot used:

```toml
[toolchain]
channel = "1.98.0"
components = ["clippy", "rustfmt"]
profile = "minimal"
```

Use the pinned rustfmt defaults (four spaces) unless the project needs an explicit override.
Merge these scripts when Node already orchestrates the project:

```json
{
    "scripts": {
        "format:rust": "cargo fmt --all",
        "check:format:rust": "cargo fmt --all -- --check",
        "format": "npm run format:web && npm run format:python && npm run format:docs && npm run format:rust",
        "check:format": "npm run check:format:editorconfig && npm run check:format:web && npm run check:format:python && npm run check:format:docs && npm run check:format:rust"
    }
}
```

This final example assumes all four profiles are present. Remove absent profiles from
both aggregates. A Rust-only repository can use the two Cargo commands directly.

## Optional Go profile

`gofmt` owns Go files and writes tabs. The `.editorconfig` template sets
`indent_style = tab` for `*.go`, so editors and `editorconfig-checker` expect the tabs `gofmt`
writes. Check with `gofmt -l .` (non-empty output is a failure) and write with `gofmt -w .`.

## Adding a language or formatter profile

Inventory maintained source by file type before choosing tools. Exclude dependencies, vendored
code, generated output, caches and runtime data, but do not exclude a directory merely because
its name resembles generated content. Include embedded languages and framework components in
the inventory, then assign exactly one formatting owner to every maintained file type. Follow
the framework's convention where it owns embedded formatting and keep formatter scopes disjoint.

Choose formatter and runtime versions that are compatible with the project's actual supported
range and pin them in tracked configuration. Verify language-specific choices against primary
tool or framework documentation. An unknown language is not permission to guess a tool, command
or version, and this template does not install it. Use the project's native task runner and
environment where practical; do not add Node solely to orchestrate formatting.

Provide write and read-only check entrypoints with identical file coverage. Connect the check to
CI and align editor configuration and exclusions with the command-line owner. On representative
copies in a disposable fixture, prove that the check detects intentionally introduced drift, the
write command makes the check pass, and a second write is idempotent. Run relevant behavioral
checks after formatting. Do not inject drift into maintained working-tree files for this test.
Adoption or update changes only the selected profile and affected files: preserve locked versions
outside that scope and put any intentional repository-wide rewrite in a separate reviewed change.

## Adoption check

Run the read-only check with the project's installed tool versions. Review formatting
drift separately from behavior changes, run the write command when adopting the changes,
and rerun the check. CI must execute the same read-only contract. Check ignored output
paths and unsupported source file types before declaring all source files covered.

These files do not install tools, change global editor settings or migrate another
repository automatically.
