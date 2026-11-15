# ts-icon design system

This folder is the binding source of the admin UI's visual language, its building blocks and their
quality contract. Product decisions (sources and their order, the HIG/TeamSpeak conflicts, the screen
table) are in [`docs/design/DESIGN.md`](../../../docs/design/DESIGN.md) and are not repeated here.
The structure follows quiltor's `packages/client/src/design` (layers, one barrel, a written contract);
its colours, fonts and palettes are not used.

## Public entry

App code imports from the barrel only:

```tsx
import { Button, PageHeader, ListSection, ListRow, useToast } from "../design"; // from src/components/*
import { AppShell, MenuButton } from "./design"; // from src/*
```

`eslint.config.js` forbids deep imports (`**/design/*`) from outside this folder
(`no-restricted-imports`). The one other entry is the foundations stylesheet `index.css`, imported
once from `main.tsx`. Design components import their own colocated stylesheet.

## Layers

```text
src (app, screens) -> patterns -> components -> primitives -> foundations
```

| Layer       | Where                                                                                                           | Contents                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations | design root: `colors.css`, `tokens.css`, `typography.css`, `metrics.css`, `motion.css`, `base.css`, `index.css` | raw palette and colour roles, geometry, iOS type scale, the one viewport media query (macOS metrics), motion, document defaults                                                                                                                                                                                 |
| Primitives  | `primitives/`                                                                                                   | `Icon`, `Button`, `LinkButton`, `TextField`, `TextArea`, `Select`, `Checkbox`, `Stack`, `Cluster`, `Grid`                                                                                                                                                                                                       |
| Components  | `components/`                                                                                                   | `Toolbar`, `ToolbarButton`, `PageHeader`, `ListSection`, `ListRow`, `FileButton`, `MenuButton`, `ConfirmDialog`, `StatusGlyph`, `TextLink`, `FieldError`, `RequestError`, `ToastProvider`/`useToast`, `UploadInput`, `EmptyState`, `LoadingState`, `Spinner`, `Skeleton`, `BannerFrame`, `Section` (deprecated) |
| Patterns    | `patterns/`                                                                                                     | `AppShell`, `SidebarLink`, `SidePanel`, `Brand`, `Notice`, `Splash`, `AccessDenied`                                                                                                                                                                                                                             |
| Internal    | `internal/`                                                                                                     | not exported (`fieldDescription`)                                                                                                                                                                                                                                                                               |
| Tests       | `testing/`                                                                                                      | contrast, typography and layout contract tests                                                                                                                                                                                                                                                                  |

A layer imports only from the layers to its right. Design code imports no product module, with two
named exceptions: `UploadInput` reads the pure file check `api/image-file`, and `AccessDenied` reads
`auth/AuthContext` (it has no props and shows who is signed in). The theme store `theme/theme` (it must
exist before React mounts, see `index.html`) is read by `App.tsx`, which feeds the appearance choice
to the account `MenuButton`.

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
  components here. The file inputs inside `UploadInput` and `FileButton` are the only native controls
  a component renders for the app.

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

## Colour budget

Colour marks highlights only (T-142-F1 items 1-3). Everything else is neutral: label, secondary
label, borders and surfaces.

1. **Accent** (the TeamSpeak blue) is used for five things: the fill of at most one prominent button
   per view (`primary`), the selected sidebar row (`selection`), the focus ring (`focus`), links and
   plain text buttons (`link`) and the crop selection frame (`crop`). Every element that renders an
   accent token carries `data-accent="primary|selection|focus|link|crop"` on itself or an ancestor.
   `Button`, `LinkButton`, `TextLink` and `SidebarLink` set it; a screen marks its crop frame itself.
2. **Destructive red** is text or a glyph on a destructive action (`data-destructive`) or on an error
   message (`role="alert"`). The only red fill is the confirm button of a destructive `ConfirmDialog`.
3. **Status colours** (positive, warning) are a glyph of at most 16 px next to a text label
   (`StatusGlyph`). They are never a chip, a pill or a background.

`e2e/colour-budget.spec.ts` enforces this in both themes and all four projects. It walks every visible
element and compares computed `color`, `background-color`, `border-*-color` and SVG `fill`/`stroke`
with the resolved accent, accent-fill and link tokens (found by painting a probe element with each
token); a match without `data-accent` on the element or an ancestor fails. The focus ring is a global
`:focus-visible` rule in `base.css`, so the walk ignores `outline-color` and a separate test tabs to a
control and asserts a `2px solid` outline in the focus token. Red and status colours are checked the
same way against `data-destructive`, dialogs and the 16 px limit. `e2e/structure.spec.ts` checks the
structure rules (no `box-shadow` except on menus, dialogs and toasts; button borders; at most one
dashed drop zone per view).

Both specs list their routes from `e2e/fixtures/routes.ts`: Banner URLs, Wallpaper, Access denied and
Not found are in `STAGE_B_ROUTES` (`enabled in stage B`), the Banner editor and Manage channel images in
`STAGE_A_SCREEN_ROUTES` (`enabled by D-142F-2/3`); their tests are `test.fixme` until the route leaves
the list. `TS_ICON_CHECK_PENDING=1` runs them anyway. The shell (sidebar, top bar, account menu) is
checked now; the live tree is a screen-owned scope (`SCREEN_OWNED_SCOPES`).

## Colour roles

Values are `light / dark`. Sources: **R-1 2.2** = TeamSpeak 6 client, sampled from the official
screenshots (estimates); **R-1 2.1** = teamspeak.com stylesheet; **R-2** = GitHub Primer
(primer/primitives @47736486: light neutrals, borders and status colours, T-142-F1 addendum 2);
**mod.** = same hue, lightness moved until the contrast test passes (HIG wins over colour fidelity,
D-3); **derived** = from the dark navy hue; **inferred** = R-2 marks the value as inferred, chosen by
HIG.

| Token                         | Light                 | Dark                  | Source (light / dark)                                                |
| ----------------------------- | --------------------- | --------------------- | -------------------------------------------------------------------- |
| `--color-label`               | `#1f2328`             | `#f2f5fa`             | R-2 fg.default / derived, close to Primer dark `#f0f6fc`             |
| `--color-label-secondary`     | `#59636e`             | `#b4bdcc`             | R-2 fg.muted / derived, brighter than Primer dark `#9198a1`          |
| `--color-label-tertiary`      | `#59636e`             | `#a1abbd`             | = secondary label (light) / derived                                  |
| `--color-placeholder`         | `#59636e`             | `#a1abbd`             | = tertiary label                                                     |
| `--color-separator`           | `#6f798c`             | `#7a859c`             | derived; opaque 3:1 edge of inputs and controls                      |
| `--color-border`              | `#d1d9e0`             | `#4b5670`             | R-2 border.default / navy-tinted, about 1.9:1 like Primer dark       |
| `--color-divider`             | `#d1d9e0` at 70 %     | `#3a4358`             | R-2 border.muted / navy-tinted                                       |
| `--color-fill-gray`           | `#f6f8fa`             | label at 10 %         | R-2 canvas.subtle: the gray button fill                              |
| `--color-link`                | `#0050d6`             | `#5cb0f2`             | mod. `#0458fa` (R-1 2.2) / mod. `#1c82cc` (R-1 2.1)                  |
| `--color-accent`              | `#1c6fcc`             | `#3d9be0`             | mod. `#1c82cc` (R-1 2.1)                                             |
| `--color-accent-fill`         | `#0458fa`             | `#0458fa`             | `#0458fa` primary button (R-1 2.2), as sampled                       |
| `--color-accent-fill-hover`   | `#1a68ff`             | `#1a68ff`             | mod. `#0458fa`                                                       |
| `--color-accent-fill-pressed` | `#0349d4`             | `#0349d4`             | mod. `#0458fa`                                                       |
| `--color-on-accent-fill`      | `#ffffff`             | `#ffffff`             | white text, R-1 2.1 `--text-primary`                                 |
| `--color-control-bg`          | `#ffffff`             | `#1b2336`             | R-2 canvas / channel row pill (R-1 2.2)                              |
| `--color-selected-bg`         | `#eaeef2`             | `#2b3346`             | R-2 neutral.muted / elevated pill (R-1 2.2); marked by accent        |
| `--color-focus`               | `#0458fa`             | `#5cb0f2`             | = accent fill / = link                                               |
| `--color-bg-window`           | `#ffffff`             | `#131a2c`             | R-2 canvas.default / window top bar (R-1 2.2)                        |
| `--color-bg-sidebar`          | `#f6f8fa`             | `#1b2334`             | R-2 canvas.subtle / left column (R-1 2.2)                            |
| `--color-bg-content`          | `#ffffff`             | `#232a3c`             | R-2 canvas.default / right panel, page background (R-1 2.2)          |
| `--color-bg-elevated`         | `#ffffff`             | `#2b3346`             | R-2 canvas / elevated pill, toolbar card, input (R-1 2.2)            |
| `--color-bg-panel`            | `#f6f8fa`             | `#253044`             | R-2 canvas.subtle / centre column (R-1 2.2)                          |
| `--color-bg-row`              | `#ffffff`             | `#1b2336`             | R-2 canvas / channel row pill (R-1 2.2)                              |
| `--color-positive`            | `#1a7f37`             | `#3fb950`             | R-2 success                                                          |
| `--color-warning`             | `#9a6700`             | `#d29922`             | R-2 attention                                                        |
| `--color-destructive`         | `#d1242f`             | `#ff6b66`             | R-2 danger / mod. `#f85149`, lighter for 4.5:1 on navy               |
| `--color-destructive-fill`    | `#d1242f`             | `#c62f3a`             | R-2 danger / inferred (Primer `#da3633` is too light for white text) |
| `--color-on-destructive-fill` | `#ffffff`             | `#ffffff`             | white                                                                |
| `--color-checker-a` / `-b`    | `#ffffff` / `#d1d9e0` | `#1d253a` / `#2b3346` | R-2 canvas, border / darker card, elevated (R-1 2.2)                 |
| `--color-shadow`              | `rgb(31 35 40 / 16%)` | `rgb(0 0 0 / 40%)`    | menus, dialogs and toasts only                                       |
| `--color-scrim`               | `rgb(31 35 40 / 40%)` | `rgb(0 0 0 / 55%)`    | backdrop behind the sidebar drawer and dialogs                       |

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
- `--color-selected-bg` is a neutral step (Primer neutral.muted, or the elevated navy); the accent
  marker, not a blue surface, shows the selection.
- `--color-positive-bg`, `--color-warning-bg`, `--color-destructive-bg` and `--color-accent-bg` are
  **deprecated**: status and accent never fill a surface. Only stage-B screens still read them.

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
| `--space-0` … `--space-10`         | 0, 4, 8, 12, 16, 20, 24, 32, 40, 56, 64 px; `--space-half` 2 px | 4 px grid; R-2 4/8/12/16/24 plus 32/40 for section gaps |
| `--radius-small`                   | 6 px                                                            | small badges                                            |
| `--radius-control` / `-row`        | 8 px                                                            | buttons, inputs, menu items (A3, R-2)                   |
| `--radius-card` / `--radius-panel` | 12 px                                                           | list boxes, menus, dialogs (A3, R-2)                    |
| `--radius-pill`                    | 999 px                                                          | channel-tree row pills and avatars only                 |
| `--size-hit-target`                | 44 px; 32 px from 1024 px                                       | HIG iOS hit region (R-1 1.6) / Primer default control   |
| `--size-hit-target-small`          | 44 px; 28 px from 1024 px                                       | the 28 px macOS floor (A1), Primer small control        |
| `--size-row-min`                   | 44 px; 32 px from 1024 px                                       | `ListRow` height                                        |
| `--size-toolbar`                   | 56 px; 48 px from 1024 px                                       | top bar height                                          |
| `--size-sidebar` / `--size-panel`  | 264 (240 from 1024 px) / 340 px                                 | sidebar and live panel columns                          |
| `--size-main-min`                  | 560 px                                                          | narrowest main column, see "App shell layout"           |

The values marked "from 1024 px" are set by the one media query of the foundations, in `metrics.css`
(addendum 1, D-6). 1 px borders replace shadows; `--shadow-overlay` is for menus, dialogs and toasts
only and `--shadow-raised` is deprecated (`none`).

## App shell layout

The sidebar is a column from 1024 px and a drawer below. The live panel (admin only, hide/show
control, stored as `ts-icon-rail-open`) sits **beside** the content only while the main column keeps
`--size-main-min` (560 px: a 500 px crop stage plus 2 × 24 px page padding), and **below** the content
otherwise (T-142-F1 addendum 3, C1). Container queries cannot read custom properties, so
`patterns/AppShell.css` spells the sum out (`@container shell (min-width: 900px)` = 560 + 340 px) and
`testing/layout.test.ts` fails if the three numbers drift apart. `e2e/work-area.spec.ts` checks 1024,
1200, 1280, 1366 and 1440 px. The Banner editor marks its crop stage `data-testid="crop-stage"`.

## Type scale

Two scales, switched by the one media query at 1024 px (T-142-F1 addendum 1, D-6). Checked on
2026-11-15 against <https://developer.apple.com/design/human-interface-guidelines/typography>
(Specifications). Points are used as CSS px; the web minimum is 11 px, so the macOS Footnote and
Caption sizes (10 pt) are raised to 11 px.

| Role        | iOS, below 1024 px (size / line, weight) | macOS, from 1024 px (size / line, weight) |
| ----------- | ---------------------------------------- | ----------------------------------------- |
| Large Title | 34 / 41, 700                             | 26 / 32, 700                              |
| Title 1     | 28 / 34, 700                             | 22 / 26, 700                              |
| Title 2     | 22 / 28, 700                             | 17 / 22, 700                              |
| Title 3     | 20 / 25, 600                             | 15 / 20, 600                              |
| Headline    | 17 / 22, 600                             | 13 / 16, 700                              |
| Body        | 17 / 22, 400                             | 13 / 16, 400                              |
| Callout     | 16 / 21, 400                             | 12 / 15, 400                              |
| Subheadline | 15 / 20, 400                             | 11 / 14, 400                              |
| Footnote    | 13 / 18, 400                             | 11 / 14, 400                              |
| Caption 1   | 12 / 16, 400                             | 11 / 14, 400                              |
| Caption 2   | 11 / 13, 400                             | 11 / 14, 400                              |

The only weights are 400, 500, 600 and 700. No text is smaller than 11 px. The font stack starts
with `-apple-system, BlinkMacSystemFont, system-ui`; there is no web font. `testing/typography.test.ts`
checks both columns.

## Motion

`--motion-fast` 120 ms, `--motion-standard` 200 ms, `--motion-slow` 260 ms (HIG: brief and
purposeful; teamspeak.com uses 0.2–0.25 s, R-1 2.1). Under `prefers-reduced-motion: reduce` every
duration drops to 0.01 ms, and `base.css` caps any other transition or animation the same way.

## Buttons

Only the HIG styles exist (T-142-F1 item 8). `Button` and `LinkButton` render `data-variant`:

| Style       | Look                                                       | Use                             |
| ----------- | ---------------------------------------------------------- | ------------------------------- |
| `prominent` | accent fill, `data-accent="primary"`; at most one per view | the one primary action          |
| `gray`      | neutral fill, label colour, 1 px neutral border (default)  | every other action              |
| `plain`     | borderless text in the link colour, `data-accent="link"`   | inline actions                  |
| toolbar     | `ToolbarButton`: icon-only, borderless, label and tooltip  | page-level actions, the top bar |

`destructive` adds red text and glyph to `gray` or `plain` (`data-destructive`, never a fill). Every
button has `border-width: 0`, except `gray` with a 1 px border in `--color-border` (Primer default
button, addendum 1); the structure spec checks exactly that. Both sizes keep the viewport hit target.
`iconOnly` requires an `aria-label` by type. `variant="bordered"` and `variant="destructive"` are
**deprecated** aliases (gray; plain + destructive) for the stage-B screens and go away in stage B.

## Patterns

Every screen is built from these. The examples are the markup a screen writes.

**`PageHeader`**: one per view. The Large Title, an optional one-line subtitle in secondary label and
a trailing toolbar slot for page-level actions. `eyebrow`, `icon`, `lead` and `actions` are deprecated
(`eyebrow` renders nothing).

```tsx
<PageHeader
  title="Manage channel images"
  subtitle="Replace or remove the banner of a channel."
  toolbar={
    <Toolbar label="Page actions">
      <ToolbarButton icon="refresh" label="Refresh" onClick={reload} />
    </Toolbar>
  }
/>
```

**`ListSection` / `ListRow`**: a Primer ActionList box in HIG inset-grouped form. It is a 1 px bordered,
12 px rounded box with an optional header row (at most three words), 1 px row dividers and no shadow.
A row has a leading icon or thumbnail, a title with secondary text and trailing content. With
`onDropFile` the row accepts a dropped file and highlights only while a drag is over it.

```tsx
<ListSection header="Channels" footer="Images are 500 × 44 px.">
  <ListRow
    leading={<BannerFrame src={url} alt="" />}
    title="Gaming Area"
    subtitle={<StatusGlyph tone="positive" label="Own image" />}
    onDropFile={(file) => replace(file)}
    trailing={
      <>
        <FileButton label="Replace…" onFile={replace} />
        <Button variant="plain" destructive onClick={() => setConfirm(channel)}>
          Remove
        </Button>
      </>
    }
  />
</ListSection>
```

**`Toolbar` / `ToolbarButton`**: icon-only, borderless buttons in label colour. The label is the
accessible name and the tooltip; the hit area is the viewport hit target.

**`FileButton`**: a gray button that opens the file picker (the file input sits inside the label,
visually hidden). With `UploadInput` it is the only place a file input is rendered. `UploadInput`
stays the one dashed drop zone per view.

**`MenuButton`**: a HIG pop-up menu, a gray button and a popover. Enter, Space or the arrow keys open
it; the arrows, Home and End move; Escape closes and returns focus. Items may be `destructive`, radio
items (`checked`) and grouped (`separatorBefore`, `groupLabel`); `header` is a non-interactive line
(the signed-in name). The popover may have a shadow.

```tsx
<MenuButton
  label={username}
  icon="user"
  header={`Signed in as ${username}`}
  align="end"
  collapseLabel
  items={[
    { label: "Light", checked: theme === "light", onSelect: () => setTheme("light") },
    { label: "Log out", onSelect: logout, separatorBefore: true },
  ]}
/>
```

**`ConfirmDialog`**: a Primer Dialog / HIG alert for confirmations. Focus starts on Cancel, Tab stays
inside, Escape and the scrim cancel. With `destructive` the confirm button is the one red fill in the
app.

```tsx
<ConfirmDialog
  open={Boolean(target)}
  title="Remove image?"
  message="The channel falls back to no banner."
  confirmLabel="Remove"
  destructive
  onConfirm={remove}
  onCancel={() => setTarget(null)}
/>
```

**`StatusGlyph`**: `tone` is `positive` or `warning`, plus a label. It is a 14 px glyph in the status
colour and the label in secondary label colour. There is no status chip.

**`EmptyState`** (Primer Blankslate): a calm glyph in secondary label, one friendly short sentence
(`title`) and one clear next action (`action`).

**`SidebarLink`** (Primer NavList): the selected row gets the muted background, an accent marker and
an accent icon (`data-accent="selection"`); other rows are label colour with secondary icons.

Inline messages use `Notice` and `RequestError` in the Primer Banner style: a neutral box, text in
label colour and a glyph in the status role.

## Hit targets

Every visible `button`, `a`, `input`, `select`, `textarea` and `[role=button]` is at least 28 × 28 px
from 1024 px wide and 44 × 44 px below (`e2e/hit-targets.spec.ts`, all four projects). Exemptions,
each also listed in the spec:

| Exemption                            | Reason                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Inline text link inside running text | HIG and WCAG 2.5.8 exempt inline targets; enlarging them would break the line height               |
| Checkbox or radio input              | Counts when its associated `label` is at least the hit target (`Checkbox` makes the row the label) |
| Visually hidden file input           | Counts when its drop zone or `FileButton` label is at least the hit target                         |
