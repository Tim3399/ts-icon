# ts-icon design system

This folder is the binding source of the admin UI's visual language, its building blocks and their
quality contract. Product decisions (sources and their order, the HIG/TeamSpeak conflicts, the screen
table) are in [`docs/design/DESIGN.md`](../../../docs/design/DESIGN.md) and are not repeated here.
The structure follows quiltor's `packages/client/src/design` (layers, one barrel, a written contract);
its colours, fonts and palettes are not used.

## Public entry

App code imports from the barrel only:

```tsx
import { Button, PageHeader, Section, useToast } from "../design"; // from src/components/*
import { AppShell, Notice } from "./design"; // from src/*
```

`eslint.config.js` forbids deep imports (`**/design/*`) from outside this folder
(`no-restricted-imports`). The one other entry is the foundations stylesheet `index.css`, imported
once from `main.tsx`. Design components import their own colocated stylesheet.

## Layers

```text
src (app, screens) -> patterns -> components -> primitives -> foundations
```

| Layer       | Where                                                                                            | Contents                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations | design root: `colors.css`, `tokens.css`, `typography.css`, `motion.css`, `base.css`, `index.css` | raw palette and colour roles, geometry, type scale, motion, document defaults                                                                                                       |
| Primitives  | `primitives/`                                                                                    | `Icon`, `Button`, `LinkButton`, `TextField`, `TextArea`, `Select`, `Checkbox`, `Stack`, `Cluster`, `Grid`                                                                           |
| Components  | `components/`                                                                                    | `FieldError`, `RequestError`, `ToastProvider`/`useToast`, `UploadInput`, `EmptyState`, `LoadingState`, `Spinner`, `Skeleton`, `Section`, `PageHeader`, `BannerFrame`, `ThemeToggle` |
| Patterns    | `patterns/`                                                                                      | `AppShell`, `SidebarLink`, `SidePanel`, `UserChip`, `Brand`, `Notice`, `Splash`, `AccessDenied`                                                                                     |
| Internal    | `internal/`                                                                                      | not exported (`fieldDescription`)                                                                                                                                                   |
| Tests       | `testing/`                                                                                       | contrast and typography contract tests                                                                                                                                              |

A layer imports only from the layers to its right. Design code imports no product module, with three
named exceptions: `UploadInput` reads the pure file check `api/image-file`, `AccessDenied` reads
`auth/AuthContext` (it has no props and shows who is signed in), and `ThemeToggle` reads the theme store
`theme/theme` (the store must exist before React mounts, see `index.html`).

## Class prefix

Every class defined in `src/design` starts with **`ds-`**. No stylesheet outside `src/design` defines
or overrides a `ds-` class: `grep -rn "\.ds-" src --include=*.css` outside `src/design` returns
nothing. Screens style their own markup with their own class names and the tokens below.

## Rules for CSS outside the foundations

These hold for the primitive, component and pattern stylesheets here and for every screen stylesheet:

- **Colours** only as `var(--color-<role>)`. No hex, `rgb()`, `hsl()`, `oklch()`, `color-mix()` or
  named colour (`white`, `black`, …). `transparent` and `currentColor` are keywords, not colours.
- **Spacing** (`padding`, `margin`, `gap`, `inset`, `top`/`left`/`right`/`bottom`) only from
  `--space-<n>`; layout with `Stack`, `Cluster` and `Grid` where possible.
- **Radius, shadow, font size, weight, line height and durations** only through their tokens. A line
  whose numbers all sit inside `var(...)` is allowed.
- **Token names describe roles.** The raw palette at the top of `colors.css` is the one place with
  hue names (`--navy-*`, `--gray-*`, `--blue-*`, `--green-*`, `--orange-*`, `--red-*`); only the role
  blocks in the same file read them.
- **Building blocks only.** App code renders `button`, `input`, `select` and `textarea` through the
  components here. The file input inside `UploadInput` is the one native control a component renders
  for the app.

**Colour allowlist outside the foundations** (T-142 item 2; non-UI colour data, not styling):

| File                                           | Line content                                      | Reason                                     |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `src/components/ChannelWallpaperGenerator.tsx` | form default `backgroundColor: "#00000000"`       | wallpaper background value sent to the API |
| `src/components/ChannelWallpaperGenerator.tsx` | validation text containing `#00000000 or #FFFFFF` | user-facing format example                 |

Test files are exempt. `src/components/ChannelAutocomplete.tsx` is exempt (unused, its removal is a
separate decision).

## Token naming

| Group   | Pattern                                                                 |
| ------- | ----------------------------------------------------------------------- |
| Colour  | `--color-<role>`                                                        |
| Spacing | `--space-<n>`                                                           |
| Radius  | `--radius-<role>`                                                       |
| Type    | `--font-<role>-size`, `--font-<role>-line`, `--font-weight-<role>`      |
| Motion  | `--motion-<role>`                                                       |
| Sizes   | `--size-<role>`; elevation `--shadow-<role>`; stacking `--layer-<role>` |

## Colour roles

Values are `light / dark`. Sources: **R-1 2.2** = TeamSpeak 6 client, sampled from the official
screenshots (estimates); **R-1 2.1** = teamspeak.com stylesheet; **mod.** = same hue, lightness moved
until the contrast test passes (HIG wins over colour fidelity, D-3); **derived** = light theme derived
from the dark navy hue; **HIG** = system role without a TeamSpeak value.

| Token                         | Light                 | Dark                  | Source (dark / light)                                   |
| ----------------------------- | --------------------- | --------------------- | ------------------------------------------------------- |
| `--color-label`               | `#131a2c`             | `#f2f5fa`             | derived grey on navy / navy `#131a2c` (R-1 2.2)         |
| `--color-label-secondary`     | `#3f4a5f`             | `#b4bdcc`             | derived                                                 |
| `--color-label-tertiary`      | `#56617a`             | `#a1abbd`             | derived                                                 |
| `--color-placeholder`         | `#56617a`             | `#a1abbd`             | = tertiary label                                        |
| `--color-separator`           | `#6f798c`             | `#7a859c`             | derived (opaque separator, 3:1)                         |
| `--color-link`                | `#0050d6`             | `#5cb0f2`             | mod. `#1c82cc` (R-1 2.1) / mod. `#0458fa` (R-1 2.2)     |
| `--color-accent`              | `#1c6fcc`             | `#3d9be0`             | mod. `#1c82cc` (R-1 2.1)                                |
| `--color-accent-fill`         | `#0458fa`             | `#0458fa`             | `#0458fa` primary button (R-1 2.2), as sampled          |
| `--color-accent-fill-hover`   | `#1a68ff`             | `#1a68ff`             | mod. `#0458fa`                                          |
| `--color-accent-fill-pressed` | `#0349d4`             | `#0349d4`             | mod. `#0458fa`                                          |
| `--color-on-accent-fill`      | `#ffffff`             | `#ffffff`             | white text, R-1 2.1 `--text-primary`                    |
| `--color-control-bg`          | `#ffffff`             | `#1b2336`             | channel row pill (R-1 2.2) / derived                    |
| `--color-selected-bg`         | `#cfe0fa`             | `#1e4a86`             | mod. `#1c82cc`                                          |
| `--color-focus`               | `#0458fa`             | `#5cb0f2`             | = accent fill / = link                                  |
| `--color-bg-window`           | `#e9edf3`             | `#131a2c`             | window top bar (R-1 2.2) / derived                      |
| `--color-bg-sidebar`          | `#e1e6ee`             | `#1b2334`             | left column (R-1 2.2) / derived                         |
| `--color-bg-content`          | `#f4f6f9`             | `#232a3c`             | right panel, page background (R-1 2.2) / derived        |
| `--color-bg-elevated`         | `#ffffff`             | `#2b3346`             | elevated pill, toolbar card, input (R-1 2.2) / derived  |
| `--color-bg-panel`            | `#eceff5`             | `#253044`             | centre column with the channel tree (R-1 2.2) / derived |
| `--color-bg-row`              | `#ffffff`             | `#1b2336`             | channel row pill (R-1 2.2) / derived                    |
| `--color-positive`            | `#0d7a4c`             | `#25eb93`             | `#25eb93` (R-1 2.1) / mod. for light                    |
| `--color-warning`             | `#8a5a00`             | `#f5b94a`             | HIG                                                     |
| `--color-destructive`         | `#c0242f`             | `#ff7b7b`             | HIG (text)                                              |
| `--color-destructive-fill`    | `#c0242f`             | `#c62f3a`             | HIG (destructive button)                                |
| `--color-on-destructive-fill` | `#ffffff`             | `#ffffff`             | white                                                   |
| `--color-checker-a` / `-b`    | `#ffffff` / `#e1e6ee` | `#1d253a` / `#2b3346` | darker card / elevated (R-1 2.2)                        |
| `--color-shadow`              | `rgb(19 26 44 / 14%)` | `rgb(0 0 0 / 40%)`    | elevation only, never text                              |
| `--color-scrim`               | `rgb(19 26 44 / 40%)` | `rgb(0 0 0 / 55%)`    | backdrop behind the sidebar drawer                      |

### Allowed dark surface values

Every dark base surface takes its value from this list (R-1 2.2, T-142 item 5); the contrast test
fails otherwise.

| Value     | R-1 2.2 role                              | Used by                                          |
| --------- | ----------------------------------------- | ------------------------------------------------ |
| `#131a2c` | window top bar                            | `--color-bg-window`                              |
| `#1b2334` | left column background                    | `--color-bg-sidebar`                             |
| `#1b2336` | channel row / sub-channel pill            | `--color-bg-row`, `--color-control-bg`           |
| `#1d253a` | darker card (server-management panel)     | `--color-checker-a`                              |
| `#232a3c` | right panel / page background             | `--color-bg-content`                             |
| `#232b40` | header / spacer pill                      | palette `--navy-840`, for the channel-tree parts |
| `#253044` | centre column background                  | `--color-bg-panel`                               |
| `#2b3346` | elevated pill, toolbar card, input, badge | `--color-bg-elevated`, `--color-checker-b`       |

### Derived surfaces

Hover, pressed, selected and status surfaces are derived, never sampled:

- `--color-fill-hover` and `--color-fill-pressed` lay the label colour at 8 % and 14 % over whatever
  surface the control sits on (`color-mix(in srgb, label, transparent)`), so they work on every
  surface in both themes.
- `--color-selected-bg` is a darker (dark theme) or lighter (light theme) step of the TeamSpeak blue.
- `--color-positive-bg`, `--color-warning-bg`, `--color-destructive-bg` and `--color-accent-bg` mix
  14–16 % of their role into `--color-bg-elevated`. They carry text in `--color-label`.

## Contrast pairs

`testing/contrast.test.ts` checks every pair below in both themes and fails if this table and its own
list differ. Text needs 4.5:1. Large Title and Title 1 would need 3:1 but are set in
`--color-label`, which passes 4.5:1. Non-text UI (accent, focus indicator, separator) needs 3:1
against the background it is drawn on. Translucent tokens are composited on the named backdrop first.

<!-- contrast-pairs:start -->

| Foreground                    | Background                 | Minimum | Use                                  |
| ----------------------------- | -------------------------- | ------- | ------------------------------------ |
| `--color-label`               | `--color-bg-window`        | 4.5     | text                                 |
| `--color-label`               | `--color-bg-sidebar`       | 4.5     | text                                 |
| `--color-label`               | `--color-bg-content`       | 4.5     | text                                 |
| `--color-label`               | `--color-bg-elevated`      | 4.5     | text                                 |
| `--color-label`               | `--color-control-bg`       | 4.5     | text                                 |
| `--color-label-secondary`     | `--color-bg-window`        | 4.5     | text                                 |
| `--color-label-secondary`     | `--color-bg-sidebar`       | 4.5     | text                                 |
| `--color-label-secondary`     | `--color-bg-content`       | 4.5     | text                                 |
| `--color-label-secondary`     | `--color-bg-elevated`      | 4.5     | text                                 |
| `--color-label-secondary`     | `--color-control-bg`       | 4.5     | text                                 |
| `--color-label-tertiary`      | `--color-bg-window`        | 4.5     | text                                 |
| `--color-label-tertiary`      | `--color-bg-sidebar`       | 4.5     | text                                 |
| `--color-label-tertiary`      | `--color-bg-content`       | 4.5     | text                                 |
| `--color-label-tertiary`      | `--color-bg-elevated`      | 4.5     | text                                 |
| `--color-label-tertiary`      | `--color-control-bg`       | 4.5     | text                                 |
| `--color-placeholder`         | `--color-bg-window`        | 4.5     | text                                 |
| `--color-placeholder`         | `--color-bg-sidebar`       | 4.5     | text                                 |
| `--color-placeholder`         | `--color-bg-content`       | 4.5     | text                                 |
| `--color-placeholder`         | `--color-bg-elevated`      | 4.5     | text                                 |
| `--color-placeholder`         | `--color-control-bg`       | 4.5     | text                                 |
| `--color-link`                | `--color-bg-window`        | 4.5     | text                                 |
| `--color-link`                | `--color-bg-sidebar`       | 4.5     | text                                 |
| `--color-link`                | `--color-bg-content`       | 4.5     | text                                 |
| `--color-link`                | `--color-bg-elevated`      | 4.5     | text                                 |
| `--color-link`                | `--color-control-bg`       | 4.5     | text                                 |
| `--color-label`               | `--color-bg-panel`         | 4.5     | text in the live panel and tree rows |
| `--color-label`               | `--color-bg-row`           | 4.5     | text in the live panel and tree rows |
| `--color-label-secondary`     | `--color-bg-panel`         | 4.5     | text in the live panel and tree rows |
| `--color-label-secondary`     | `--color-bg-row`           | 4.5     | text in the live panel and tree rows |
| `--color-on-accent-fill`      | `--color-accent-fill`      | 4.5     | prominent button label               |
| `--color-on-destructive-fill` | `--color-destructive-fill` | 4.5     | destructive button label             |
| `--color-label`               | `--color-selected-bg`      | 4.5     | selected row or sidebar entry        |
| `--color-positive`            | `--color-bg-content`       | 4.5     | status text                          |
| `--color-positive`            | `--color-bg-elevated`      | 4.5     | status text                          |
| `--color-warning`             | `--color-bg-content`       | 4.5     | status text                          |
| `--color-warning`             | `--color-bg-elevated`      | 4.5     | status text                          |
| `--color-destructive`         | `--color-bg-content`       | 4.5     | status text                          |
| `--color-destructive`         | `--color-bg-elevated`      | 4.5     | status text                          |
| `--color-accent`              | `--color-bg-window`        | 3       | non-text UI                          |
| `--color-accent`              | `--color-bg-sidebar`       | 3       | non-text UI                          |
| `--color-accent`              | `--color-bg-content`       | 3       | non-text UI                          |
| `--color-accent`              | `--color-bg-elevated`      | 3       | non-text UI                          |
| `--color-accent`              | `--color-control-bg`       | 3       | non-text UI                          |
| `--color-focus`               | `--color-bg-window`        | 3       | non-text UI                          |
| `--color-focus`               | `--color-bg-sidebar`       | 3       | non-text UI                          |
| `--color-focus`               | `--color-bg-content`       | 3       | non-text UI                          |
| `--color-focus`               | `--color-bg-elevated`      | 3       | non-text UI                          |
| `--color-focus`               | `--color-control-bg`       | 3       | non-text UI                          |
| `--color-separator`           | `--color-bg-window`        | 3       | non-text UI                          |
| `--color-separator`           | `--color-bg-sidebar`       | 3       | non-text UI                          |
| `--color-separator`           | `--color-bg-content`       | 3       | non-text UI                          |
| `--color-separator`           | `--color-bg-elevated`      | 3       | non-text UI                          |
| `--color-separator`           | `--color-control-bg`       | 3       | non-text UI                          |
| `--color-focus`               | `--color-bg-panel`         | 3       | non-text UI                          |
| `--color-separator`           | `--color-bg-panel`         | 3       | non-text UI                          |

<!-- contrast-pairs:end -->

## Spacing, radius and sizes

| Token                              | Value                                                           | Source                                                  |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `--space-0` … `--space-10`         | 0, 4, 8, 12, 16, 20, 24, 32, 40, 56, 64 px; `--space-half` 2 px | 4 px grid; HIG 12 pt around bezelled controls (R-1 1.8) |
| `--radius-small`                   | 6 px                                                            | small badges (R-1 2.2: ≈ 8 px)                          |
| `--radius-control`                 | 10 px                                                           | inputs                                                  |
| `--radius-row`                     | 12 px                                                           | channel row pills (R-1 2.2: ≈ 12 px)                    |
| `--radius-card` / `--radius-panel` | 14 / 16 px                                                      | cards and panels (R-1 2.2: 12–16 px)                    |
| `--radius-pill`                    | 999 px                                                          | buttons (R-1 2.2: fully rounded)                        |
| `--size-hit-target`                | 44 px                                                           | HIG iOS hit region (R-1 1.6, 1.8), D-3                  |
| `--size-sidebar` / `--size-panel`  | 264 / 340 px                                                    | sidebar and live panel columns                          |
| `--size-toolbar`                   | 56 px                                                           | toolbar height (≥ 44 px target plus padding)            |

## Type scale

iOS / iPadOS Dynamic Type, **Large (default)**, on every viewport (D-3). Checked on 2026-11-15
against <https://developer.apple.com/design/human-interface-guidelines/typography>
(Specifications → iOS, iPadOS Dynamic Type sizes → Large). Points are used as CSS px.

| Role        | Size / line (px) | Weight |
| ----------- | ---------------- | ------ |
| Large Title | 34 / 41          | 700    |
| Title 1     | 28 / 34          | 700    |
| Title 2     | 22 / 28          | 700    |
| Title 3     | 20 / 25          | 600    |
| Headline    | 17 / 22          | 600    |
| Body        | 17 / 22          | 400    |
| Callout     | 16 / 21          | 400    |
| Subheadline | 15 / 20          | 400    |
| Footnote    | 13 / 18          | 400    |
| Caption 1   | 12 / 16          | 400    |
| Caption 2   | 11 / 13          | 400    |

The only weights are 400, 500, 600 and 700. No text is smaller than 11 px. The font stack starts
with `-apple-system, BlinkMacSystemFont, system-ui`; there is no web font. Titles use the HIG
"emphasized" weight (bold) so the hierarchy reads at a glance.

## Motion

`--motion-fast` 120 ms, `--motion-standard` 200 ms, `--motion-slow` 260 ms (HIG: brief and
purposeful; teamspeak.com uses 0.2–0.25 s, R-1 2.1). Under `prefers-reduced-motion: reduce` every
duration drops to 0.01 ms, and `base.css` caps any other transition or animation the same way.

## Buttons

`Button` and `LinkButton` render `data-variant`: `prominent` (accent fill, at most one per screen),
`bordered` (default), `plain` and `destructive` (never prominent). Both sizes keep the 44 × 44 px hit
area. `iconOnly` requires an `aria-label` by type.

## Hit targets

Every visible `button`, `a`, `input`, `select`, `textarea` and `[role=button]` is at least 44 × 44 px
(`e2e/hit-targets.spec.ts`, all four projects). Exemptions, each also listed in the spec:

| Exemption                            | Reason                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Inline text link inside running text | HIG and WCAG 2.5.8 exempt inline targets; enlarging them would break the line height           |
| Checkbox or radio input              | Counts when its associated `label` is at least 44 × 44 px (`Checkbox` makes the row the label) |
| Visually hidden file input           | Counts when its drop zone (`UploadInput` label) is at least 44 × 44 px                         |
