# ts-icon design system

This folder is the binding source of the admin UI's visual language, its building blocks and their
quality contract. Since T-142-F3 the look is concept **D2 "Studio Light"** (D-15): a light-first Studio
workspace with a derived dark theme. The binding visual reference is
`ts-icon-kb/implementer/T-142-concepts-D/D2/` (`editor.html`, `channels.html`, `concept.css`). Product
decisions (sources and their order, the override table of R3, the screen table) are in
[`docs/design/DESIGN.md`](../../../docs/design/DESIGN.md) and are not repeated here. The structure
follows quiltor's `packages/client/src/design` (layers, one barrel, a written contract); its colours,
fonts and palettes are not used.

## Public entry

App code imports from the barrel only:

```tsx
import { Panel, PropertyRow, NumberField, DataTable } from "../design"; // from src/components/*
import { StudioShell, ModeSwitcher, ModeLink, MenuButton } from "./design"; // from src/*
```

`eslint.config.js` forbids deep imports (`**/design/*`) from outside this folder
(`no-restricted-imports`). The one other entry is the foundations stylesheet `index.css`, imported
once from `main.tsx`. Design components import their own colocated stylesheet.

## Layers

```text
src (app, screens) -> patterns -> components -> primitives -> foundations
```

| Layer       | Where          | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations | `foundations/` | `colors.css` (raw palette and colour roles), `tokens.css` (geometry), `typography.css` (D2 type scale, phone values), `metrics.css` (the one viewport media query: D2 desktop values), `motion.css`, `base.css`; `index.css` at the design root imports them                                                                                                                                                                                                                                                        |
| Primitives  | `primitives/`  | `Icon`, `Button`, `LinkButton`, `TextField`, `TextArea`, `Select`, `Checkbox`, `Stack`, `Cluster`, `Grid`                                                                                                                                                                                                                                                                                                                                                                                                           |
| Components  | `components/`  | Studio building blocks (`Panel`, `InspectorSection`, `PropertyRow`, `NumberField`, `SegmentedControl`, `FilterBar`, `DataTable`, `Canvas`, `Dock`, `StateTile`, `StudioPage`), `Toolbar`, `ToolbarButton`, `FileButton`, `MenuButton`, `ConfirmDialog`, `UploadInput`, `StatusGlyph`, `TextLink`, `FieldError`, `RequestError`, `ToastProvider`/`useToast`, `EmptyState`, `LoadingState`, `Spinner`, `Skeleton`, `BannerFrame`; kept for the screens until they are rebuilt: `PageHeader`, `ListSection`, `ListRow` |
| Patterns    | `patterns/`    | `StudioShell`, `StudioToolbar`, `StudioLayers`, `StudioInspector`, `ModeSwitcher`, `ModeLink`, `StudioMark`, `useStudioLayout`, `Notice`, `Splash`, `AccessDenied`                                                                                                                                                                                                                                                                                                                                                  |
| Internal    | `internal/`    | not exported (`fieldDescription`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests       | `testing/`     | contrast, typography and layout contract tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
  `--space-<n>`.
- **Radius, shadow, font size, weight, line height, sizes and durations** only through their tokens. A
  line whose numbers all sit inside `var(...)` is allowed.
- **Token names describe roles.** The raw palette at the top of `foundations/colors.css` is the one place
  with hue names (`--gray-*`, `--slate-*`, `--blue-*`, `--green-*`, `--orange-*`, `--red-*`); only the
  role blocks in the same file read them.
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

Colour marks highlights only (T-142-F1 items 1-3, kept by F3 item 2). Everything else is neutral:
label, secondary label, borders and surfaces.

1. **Accent** (D2's softer TeamSpeak blue) is used for five things: the fill of at most one prominent
   button per view (`primary`), the current mode and selected rows (`selection`), the focus ring
   (`focus`), links and plain text buttons (`link`) and the crop frame (`crop`). Every element that
   renders an accent token carries `data-accent="primary|selection|focus|link|crop"` on itself or an
   ancestor. `Button`, `LinkButton`, `TextLink` and `ModeLink` set it; a screen marks its crop frame
   itself. D2 draws the "ts-icon Studio" mark glyph in the accent; here it is neutral, so the accent
   keeps to these five uses.
2. **Destructive red** is text or a glyph on a destructive action (`data-destructive`) or on an error
   message (`role="alert"`). The only red fill is the confirm button of a destructive `ConfirmDialog`.
3. **Status colours** (positive, warning) are a glyph of at most 16 px next to a text label (D2's 7 px
   dot, `StatusGlyph`). They are never a chip, a pill or a background.

`e2e/colour-budget.spec.ts` enforces this in both themes and all four projects. It walks every visible
element and compares computed `color`, `background-color`, `border-*-color` and SVG `fill`/`stroke`
with the resolved accent, accent-fill and link tokens (found by painting a probe element with each
token); a match without `data-accent` on the element or an ancestor fails. The focus ring is a global
`:focus-visible` rule in `base.css`, so the walk ignores `outline-color` and a separate test tabs to a
control and asserts a `2px solid` outline in the focus token. `e2e/structure.spec.ts` checks the
structure rules: no `box-shadow` except on menus, dialogs, toasts and the open layer drawer; button
borders only as a 1 px edge in `--color-border` or `--color-border-strong` (D2's `--line-strong`);
at most one dashed drop target per view (D2's dashed style, R3).

## Colour roles

Values are `light / dark`, all from D2's `concept.css` (light block and derived dark block) unless
marked **derived** (a step of a D2 value: pressed fills, the dark red fill, the 3:1 control edge). The
earlier role names stay, so the screens that are rebuilt later keep working.

| Token                         | Light                 | Dark                  | D2 source                                    |
| ----------------------------- | --------------------- | --------------------- | -------------------------------------------- |
| `--color-label`               | `#1d2330`             | `#e7eaf0`             | `--text`                                     |
| `--color-label-secondary`     | `#535d6e`             | `#a7b0c0`             | `--text-2`                                   |
| `--color-label-tertiary`      | `#5f6878`             | `#99a3b4`             | `--text-3`                                   |
| `--color-placeholder`         | `#5f6878`             | `#99a3b4`             | `--text-3`                                   |
| `--color-separator`           | `#6f798c`             | `#7a859c`             | derived: opaque 3:1 control edge             |
| `--color-border`              | `#e2e5ea`             | `#2a313e`             | `--line`: panel borders, row dividers        |
| `--color-border-strong`       | `#cbd0d8`             | `#3a4352`             | `--line-strong`: control edges, dashed slots |
| `--color-divider`             | `#e2e5ea`             | `#2a313e`             | `--line`                                     |
| `--color-fill-neutral`        | `#f7f8fa`             | `#1e2430`             | `--panel-2`: tool and segment groups         |
| `--color-hover-bg`            | `#f0f2f5`             | `#232a36`             | `--hover`                                    |
| `--color-link`                | `#2f64c4`             | `#86b0f5`             | `--accent`                                   |
| `--color-accent`              | `#2f64c4`             | `#86b0f5`             | `--accent`                                   |
| `--color-accent-fill`         | `#2f64c4`             | `#2f5eb6`             | `--accent-fill`                              |
| `--color-accent-fill-hover`   | `#2957ac`             | `#2a549f`             | `--accent-fill-hover`                        |
| `--color-accent-fill-pressed` | `#244c96`             | `#244a8c`             | derived: one step darker                     |
| `--color-on-accent-fill`      | `#ffffff`             | `#ffffff`             | `--on-accent`                                |
| `--color-control-bg`          | `#ffffff`             | `#1a1f29`             | `--panel` (controls sit on panels)           |
| `--color-selected-bg`         | `#e9f0fc`             | `#22324f`             | `--selected`                                 |
| `--color-focus`               | `#2f64c4`             | `#86b0f5`             | `--focus`                                    |
| `--color-bg-window`           | `#f3f4f6`             | `#12161e`             | `--app`                                      |
| `--color-bg-sidebar`          | `#ffffff`             | `#1a1f29`             | `--panel`: layer panel, inspector            |
| `--color-bg-content`          | `#ffffff`             | `#1a1f29`             | `--panel`: top bar, main region, dock, table |
| `--color-bg-elevated`         | `#ffffff`             | `#1e2430`             | `--panel` / `--panel-2`: menus, dialogs      |
| `--color-bg-panel`            | `#f7f8fa`             | `#1e2430`             | `--panel-2`: table header row                |
| `--color-bg-row`              | `#ffffff`             | `#1a1f29`             | `--panel`                                    |
| `--color-bg-canvas`           | `#eceef1`             | `#161b24`             | `--canvas`                                   |
| `--color-canvas-dot`          | `#c9ced6`             | `#2b3240`             | `--canvas-dot`: the 16 px dot grid           |
| `--color-canvas-label`        | `#586273`             | `#9aa4b5`             | `--canvas-text`                              |
| `--color-crop`                | `#6aa0f7`             | `#7aaaf7`             | `--crop`                                     |
| `--color-crop-label-bg`       | `#1d2330`             | `#0d1016`             | `--crop-label-bg`                            |
| `--color-on-crop-label`       | `#ffffff`             | `#ffffff`             | `--crop-label-text`                          |
| `--color-positive`            | `#1f7a3d`             | `#57c776`             | `--positive`                                 |
| `--color-warning`             | `#8a5a00`             | `#dcab4b`             | `--warning`                                  |
| `--color-destructive`         | `#b3262d`             | `#ff8d84`             | `--danger`                                   |
| `--color-destructive-fill`    | `#b3262d`             | `#c62f3a`             | `--danger` / derived (white text 4.5:1)      |
| `--color-on-destructive-fill` | `#ffffff`             | `#ffffff`             | white                                        |
| `--color-checker-a` / `-b`    | `#ffffff` / `#e2e5ea` | `#1a1f29` / `#2a313e` | `--panel` / `--line`                         |
| `--color-shadow`              | `rgb(18 22 32 / 14%)` | `rgb(0 0 0 / 40%)`    | menus, dialogs, toasts, the open drawer      |
| `--color-scrim`               | `rgb(18 22 32 / 46%)` | `rgb(6 8 12 / 55%)`   | `--scrim`: outside the crop, behind dialogs  |

### Dark surface values

R3 replaces T-142 item 5: every dark base surface takes its value from D2's dark variant (`#12161e`,
`#161b24`, `#1a1f29`, `#1e2430`, `#232a36`, `#2a313e`); the contrast test fails otherwise. The
TeamSpeak navy stays in the TeamSpeak client roles below.

### Derived surfaces

`--color-fill-hover` and `--color-fill-pressed` lay the label colour at 6 % and 12 % over whatever
surface the control sits on (`color-mix(in srgb, label, transparent)`), for icon buttons and menu
items. Rows and gray buttons use D2's solid `--color-hover-bg`.

### TeamSpeak client roles (theme-independent)

Everything that draws the TeamSpeak channel tree shows the TeamSpeak 6 dark client, whatever the app
theme: the "Preview in TeamSpeak", the live tree's pills and the Wallpaper parent picker (R3: TS6
colours only in TeamSpeak previews and pills). These roles are declared once in the raw `:root` block
of `foundations/colors.css` and in neither theme block, so they never switch. Only `ChannelTreeRow`,
`ChannelTreePreview` and `TeamSpeakPreview` use them; app chrome never does.

| Token                        | Value (both themes) | Source                                          |
| ---------------------------- | ------------------- | ----------------------------------------------- |
| `--color-ts-tree-bg`         | `#263046`           | TS6 reference tree column, measured (D-142F-4)  |
| `--color-ts-row-bg`          | `#191f32`           | TS6 reference channel pill, measured (D-142F-4) |
| `--color-ts-header-bg`       | `#232b40`           | header / spacer pill (R-1 2.2)                  |
| `--color-ts-label`           | `#f2f5fa`           | dark label                                      |
| `--color-ts-label-secondary` | `#b4bdcc`           | dark secondary label (icons)                    |
| `--color-ts-divider`         | `#3a4358`           | dark divider                                    |
| `--color-ts-select`          | `#8db8ff`           | D2 `--ts-select`: the selected row ring         |

## Contrast pairs

`testing/contrast.test.ts` checks every pair below in both themes and fails if this table and its own
list differ. Text needs 4.5:1. Non-text UI (accent glyph, focus indicator, control edge) needs 3:1
against the background it is drawn on. Translucent tokens are composited on the named backdrop first.
D2 draws control edges in `--color-border-strong`, which is below 3:1; every such control also has a
visible label or value, and `--color-separator` stays the checked 3:1 edge role.

<!-- contrast-pairs:start -->

| Foreground                    | Background                 | Minimum | Use                        |
| ----------------------------- | -------------------------- | ------- | -------------------------- |
| `--color-label`               | `--color-bg-window`        | 4.5     | text                       |
| `--color-label`               | `--color-bg-sidebar`       | 4.5     | text                       |
| `--color-label`               | `--color-bg-content`       | 4.5     | text                       |
| `--color-label`               | `--color-bg-elevated`      | 4.5     | text                       |
| `--color-label`               | `--color-control-bg`       | 4.5     | text                       |
| `--color-label-secondary`     | `--color-bg-window`        | 4.5     | secondary text             |
| `--color-label-secondary`     | `--color-bg-sidebar`       | 4.5     | secondary text             |
| `--color-label-secondary`     | `--color-bg-content`       | 4.5     | secondary text             |
| `--color-label-secondary`     | `--color-bg-elevated`      | 4.5     | secondary text             |
| `--color-label-secondary`     | `--color-control-bg`       | 4.5     | secondary text             |
| `--color-label-tertiary`      | `--color-bg-window`        | 4.5     | tertiary text, meta        |
| `--color-label-tertiary`      | `--color-bg-sidebar`       | 4.5     | tertiary text, meta        |
| `--color-label-tertiary`      | `--color-bg-content`       | 4.5     | tertiary text, meta        |
| `--color-label-tertiary`      | `--color-bg-elevated`      | 4.5     | tertiary text, meta        |
| `--color-label-tertiary`      | `--color-control-bg`       | 4.5     | tertiary text, meta        |
| `--color-placeholder`         | `--color-bg-window`        | 4.5     | placeholder                |
| `--color-placeholder`         | `--color-bg-sidebar`       | 4.5     | placeholder                |
| `--color-placeholder`         | `--color-bg-content`       | 4.5     | placeholder                |
| `--color-placeholder`         | `--color-bg-elevated`      | 4.5     | placeholder                |
| `--color-placeholder`         | `--color-control-bg`       | 4.5     | placeholder                |
| `--color-link`                | `--color-bg-window`        | 4.5     | link, plain button         |
| `--color-link`                | `--color-bg-sidebar`       | 4.5     | link, plain button         |
| `--color-link`                | `--color-bg-content`       | 4.5     | link, plain button         |
| `--color-link`                | `--color-bg-elevated`      | 4.5     | link, plain button         |
| `--color-link`                | `--color-control-bg`       | 4.5     | link, plain button         |
| `--color-label`               | `--color-bg-panel`         | 4.5     | text                       |
| `--color-label`               | `--color-bg-row`           | 4.5     | text                       |
| `--color-label-secondary`     | `--color-bg-panel`         | 4.5     | secondary text             |
| `--color-label-secondary`     | `--color-bg-row`           | 4.5     | secondary text             |
| `--color-on-accent-fill`      | `--color-accent-fill`      | 4.5     | prominent button label     |
| `--color-on-destructive-fill` | `--color-destructive-fill` | 4.5     | destructive confirm label  |
| `--color-positive`            | `--color-bg-content`       | 4.5     | status text                |
| `--color-positive`            | `--color-bg-elevated`      | 4.5     | status text                |
| `--color-warning`             | `--color-bg-content`       | 4.5     | status text                |
| `--color-warning`             | `--color-bg-elevated`      | 4.5     | status text                |
| `--color-destructive`         | `--color-bg-content`       | 4.5     | status text                |
| `--color-destructive`         | `--color-bg-elevated`      | 4.5     | status text                |
| `--color-accent`              | `--color-bg-window`        | 3       | accent glyph               |
| `--color-accent`              | `--color-bg-sidebar`       | 3       | accent glyph               |
| `--color-accent`              | `--color-bg-content`       | 3       | accent glyph               |
| `--color-accent`              | `--color-bg-elevated`      | 3       | accent glyph               |
| `--color-accent`              | `--color-control-bg`       | 3       | accent glyph               |
| `--color-focus`               | `--color-bg-window`        | 3       | focus ring                 |
| `--color-focus`               | `--color-bg-sidebar`       | 3       | focus ring                 |
| `--color-focus`               | `--color-bg-content`       | 3       | focus ring                 |
| `--color-focus`               | `--color-bg-elevated`      | 3       | focus ring                 |
| `--color-focus`               | `--color-control-bg`       | 3       | focus ring                 |
| `--color-separator`           | `--color-bg-window`        | 3       | control edge               |
| `--color-separator`           | `--color-bg-sidebar`       | 3       | control edge               |
| `--color-separator`           | `--color-bg-content`       | 3       | control edge               |
| `--color-separator`           | `--color-bg-elevated`      | 3       | control edge               |
| `--color-separator`           | `--color-control-bg`       | 3       | control edge               |
| `--color-focus`               | `--color-bg-panel`         | 3       | focus ring                 |
| `--color-separator`           | `--color-bg-panel`         | 3       | control edge               |
| `--color-label`               | `--color-hover-bg`         | 4.5     | hovered or selected row    |
| `--color-label`               | `--color-selected-bg`      | 4.5     | hovered or selected row    |
| `--color-label-secondary`     | `--color-hover-bg`         | 4.5     | hovered or selected row    |
| `--color-label-secondary`     | `--color-selected-bg`      | 4.5     | hovered or selected row    |
| `--color-canvas-label`        | `--color-bg-canvas`        | 4.5     | artboard name, canvas hint |
| `--color-on-crop-label`       | `--color-crop-label-bg`    | 4.5     | crop size label            |
| `--color-focus`               | `--color-bg-canvas`        | 3       | focus ring on the canvas   |
| `--color-ts-label`            | `--color-ts-row-bg`        | 4.5     | TeamSpeak channel name     |
| `--color-ts-label`            | `--color-ts-tree-bg`       | 4.5     | TeamSpeak tree text        |
| `--color-ts-label-secondary`  | `--color-ts-row-bg`        | 4.5     | TeamSpeak icons            |

<!-- contrast-pairs:end -->

## Spacing, radius and sizes

| Token                                | Value                                                           | Source                                  |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| `--space-0` … `--space-10`           | 0, 4, 8, 12, 16, 20, 24, 32, 40, 56, 64 px; `--space-half` 2 px | D2 4/8/12/16/24/32 plus earlier steps   |
| `--radius-small`                     | 4 px                                                            | thumbnails                              |
| `--radius-control` / `-row`          | 6 px                                                            | D2 `--radius-control`, TS pills         |
| `--radius-card` / `--radius-panel`   | 10 px                                                           | D2 `--radius-panel`: dock, menus, tiles |
| `--radius-pill`                      | 999 px                                                          | avatars                                 |
| `--size-hit-target`                  | 44 px; 30 px from 1024 px                                       | HIG phone / D2 `--control`              |
| `--size-hit-target-small`            | 44 px; 28 px from 1024 px                                       | the 28 px desktop floor                 |
| `--size-control-prominent`           | 48 px; 34 px from 1024 px                                       | D2 `--control-prominent`                |
| `--size-row-min`                     | 44 px; 40 px from 1024 px                                       | D2 rows (12 px padding)                 |
| `--size-toolbar`                     | 56 px; 52 px from 1024 px                                       | D2 `--topbar`                           |
| `--size-panel-head`                  | 40 px                                                           | `Panel` header, table header row        |
| `--size-layers` / `--size-inspector` | 248 / 312 px                                                    | D2 `--layers` / `--inspector`           |
| `--size-main-min`                    | 560 px                                                          | a 500 px crop stage plus canvas padding |
| `--size-canvas-min`                  | 360 px                                                          | D2 canvas minimum height                |
| `--size-property-label`              | 76 px                                                           | D2 inspector label column               |
| `--size-dot` / `--size-dot-grid`     | 7 / 16 px                                                       | D2 status dot / canvas dot grid         |

The values marked "from 1024 px" are set by the one media query of the foundations, in
`foundations/metrics.css` (D-6, R9: 1024 px, not D2's 900 px). 1 px borders replace shadows;
`--shadow-overlay` is for menus, dialogs, toasts and the open layer drawer only.

## Type scale

D2's four sizes plus a heading size, switched by the one media query at 1024 px (R9). The HIG role
names of the earlier rounds are aliases (right column), so screens that are not rebuilt yet follow
the D2 scale too.

| D2 role   | Below 1024 px (size / line) | From 1024 px (size / line) | Aliases                                |
| --------- | --------------------------- | -------------------------- | -------------------------------------- |
| `micro`   | 13 / 18                     | 11 / 16                    | footnote, caption-1, caption-2         |
| `small`   | 15 / 20                     | 12 / 18                    | callout, subheadline                   |
| `text`    | 16 / 22                     | 13 / 20                    | body, headline (600)                   |
| `title`   | 17 / 22                     | 15 / 20                    | title-3                                |
| `heading` | 22 / 28                     | 17 / 22                    | title-1, title-2, large-title (not D2) |

The only weights are 400, 500, 600 and 700. No text is smaller than 11 px. The font stack starts
with `-apple-system, BlinkMacSystemFont, system-ui` followed by D2's `"Segoe UI"`, `"Noto Sans"`,
Helvetica, Arial; there is no web font. `testing/typography.test.ts` checks both columns and the
aliases.

## Motion

`--motion-fast` 120 ms, `--motion-standard` 160 ms (D2 `--motion`), `--motion-slow` 260 ms, easing
`cubic-bezier(0.2, 0, 0, 1)` (D2 `--ease`). Under `prefers-reduced-motion: reduce` every duration drops
to 0.01 ms, and `base.css` caps any other transition or animation the same way.

## Studio shell

`StudioShell` (T-142-F3 items 1 and 3, R2, R7) replaces the sidebar, the live panel and its stored
`ts-icon-rail-open` choice (R3).

- **Top bar:** the "ts-icon Studio" mark, the `ModeSwitcher` with one `ModeLink` per route (labels,
  icons and gating unchanged; `aria-current="page"` on the current one), the screen's `StudioToolbar`
  slot and the account `MenuButton` (user, theme System / Light / Dark persisted in `ts-icon-theme`,
  "Log out").
- **Workspace regions as slots:** a screen renders `StudioLayers` (left panel), its content in the
  main region (`#main-content`), and `StudioInspector` (right panel). The slots portal into the shell;
  a screen without layers or inspector leaves the slot out and the region disappears.
- **Breakpoints (R2):**

  | Width        | Layout                                                                                  |
  | ------------ | --------------------------------------------------------------------------------------- |
  | ≥ 1240 px    | three panels: layers (248 px), main, inspector (312 px); panels stick under the top bar |
  | 1024–1239 px | the layer panel is an overlay drawer opened by "Show layers" in the top bar             |
  | < 1024 px    | stacked: top bar, main, inspector, layers                                               |

  The drawer toggle has `aria-expanded` and `aria-controls="studio-layers"`; Escape or a click on the
  scrim closes it and focus returns to the toggle; a navigation closes it; while closed it is `inert`.
  Below 1240 px the mode labels collapse to icons: the label stays the accessible name and becomes the
  tooltip (R7). Below 1024 px the mode switcher takes its own row.

- `useStudioLayout()` returns `"wide" | "drawer" | "stacked"`; `studioLayout.ts` holds the two media
  queries, and `testing/layout.test.ts` keeps them equal to the widths in `StudioShell.css`.
- `e2e/studio-layout.spec.ts` checks 1024, 1239, 1240, 1280 and 1440 px on the editor and Channel
  images: side panel or drawer, the drawer keyboard behaviour, no horizontal overflow, mode labels.

```tsx
<StudioShell
  modes={
    <ModeSwitcher label="Primary">
      <ModeLink to="/" end icon="crop">Banner editor</ModeLink>
      <ModeLink to="/channels" icon="image">Manage channel images</ModeLink>
    </ModeSwitcher>
  }
  account={<MenuButton label={username} icon="user" items={accountItems} align="end" collapseLabel />}
>
  <Routes>…</Routes>
</StudioShell>

// Inside a screen:
<StudioToolbar>…canvas tools and zoom readout…</StudioToolbar>
<StudioLayers><Panel title="Layers">…</Panel></StudioLayers>
<Canvas label="Crop stage">…</Canvas>
<StudioInspector>…</StudioInspector>
```

**Banner editor canvas tools (T-142-F3 item 5).** The editor's `StudioToolbar` holds only tools the
cropper really supports: **Fit to screen**, **Zoom out**, **Zoom in** and the live **zoom readout**. D2's
Select, Crop and Pan tools are left out: the crop stage has one interaction (drag the image, move or resize
the crop frame), so a mode switch would be a control without an effect. Precise framing is done with the
inspector's X / Y / W / H fields (W and H locked to 500 : 44).

## Studio building blocks

The editor (D-142G-3) and Channel images (D-142G-4) are built from these. The examples are the markup
a screen writes.

**`Panel`**: `title`, optional `meta`, `actions` (trailing header controls), `footer`, `id`, `level`.
A 40 px header and a body; the layer panel and the inspector use it.

```tsx
<Panel title="Layers" meta="7 · live" actions={<ToolbarButton icon="refresh" label="Refresh" onClick={reload} />}
  footer="Live from the TeamSpeak server">
  …rows…
</Panel>
```

**`InspectorSection`** and **`PropertyRow`**: an inspector group with a title and optional meta, and
label / value rows. With `htmlFor` the label is the `<label>` of the control in the value cell.

```tsx
<InspectorSection title="Channel" meta="#13">
  <PropertyRow label="Target" htmlFor="channel">
    <select id="channel">…</select>
  </PropertyRow>
  <PropertyRow label="Path">Gaming Area / Hytale</PropertyRow>
</InspectorSection>
```

**`NumberField`**: a right-aligned field with a short key and a unit suffix. Props: `label` (accessible
name), `keyLabel` (short visible key, defaults to the label), `unit`, and every native input prop;
it forwards its ref.

```tsx
<NumberField label="Width" keyLabel="W" unit="px" value={crop.width} onChange={setWidth} />
```

**`SegmentedControl`**: `label`, `options` (`{ value, label }[]`), `value`, `onChange`. Radio-group
semantics: one tab stop, the arrow keys, Home and End move the choice.

```tsx
<SegmentedControl label="Image status" value={filter} onChange={setFilter}
  options={[{ value: "all", label: "All" }, { value: "with", label: "With image" }, { value: "without", label: "Without" }]} />
```

**`FilterBar`**: `search`, `filter`, `count` (a polite status) and `trailing` (the page's one prominent
action, for example "Set for all channels" on Banner URLs).

```tsx
<FilterBar search={<TextField id="q" label="Search channels" labelHidden type="search" />}
  filter={<SegmentedControl … />} count="4 of 7 have an image" />
```

**`DataTable`**: `label`, `columns` (`{ key, header, render, align?, wideOnly? }`), `rows`, `rowKey`,
`selectedKey` / `onSelect` (rows get `aria-selected`), optional `onDropFile(row, file)` (the row
highlights only while a file is dragged over it), `rowProps`, `footer` and `empty`. Below 1024 px the
table becomes a list of rows and `wideOnly` columns hide.

```tsx
<DataTable label="Channels" columns={columns} rows={channels} rowKey={(c) => c.cid}
  selectedKey={selected} onSelect={(c) => setSelected(c.cid)} onDropFile={(c, file) => replace(c, file)}
  footer="Drop an image on a row to replace that channel's banner." />
```

**`Canvas`**: `label`, the centred artboard as children, an `overlay` (absolutely positioned over the
whole stage) and `stageProps` (for example `data-testid` and drop handlers). D2's dot grid on
`--color-bg-canvas`, no shadow on the artboard.

```tsx
<Canvas label="Crop stage" stageProps={{ "data-testid": "crop-stage" }} overlay={<p>Drag to move</p>}>
  <img src={source} alt="" />
</Canvas>
```

**`Dock`**: `title`, `meta` and the body under the canvas (the TeamSpeak preview, before/after and the
saved strip live here).

```tsx
<Dock title="Preview in TeamSpeak" meta="TS6 · 1:1 · live while you crop">…</Dock>
```

**`StateTile`** (D2 `state.html`, item 11): a white card with a 1 px border, centred on the dotted canvas
background, with a glyph in a round neutral badge, one short sentence (`title`, a heading of `level` or a
paragraph with `level="p"`), an optional line of text (children) and one `action`. Props: `icon` or a
custom `glyph` (the spinner), `role` (`alert` for an error, `status` for loading), `size` (`"region"`,
the default, fills the panel or table area; `"page"` fills the main region under the top bar) and
`className`. Every state uses it:

| State         | Built with                                | Tile                                                                             |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Not found     | `Notice` (`size="page"`)                  | "Page not found", "This page doesn't exist.", prominent "Open the banner editor" |
| Access denied | `AccessDenied` → `Notice` (`size="page"`) | "Access denied", who is signed in, gray "Log out"                                |
| Empty         | `EmptyState` (props unchanged)            | glyph (default `inbox`), title, description, one action                          |
| Loading       | `LoadingState` (props unchanged)          | spinner glyph, the label, `role="status"`                                        |
| Error         | `RequestError layout="tile"`              | alert glyph, the message, `role="alert"`, "Try again"                            |
| Sign-in       | `Splash` → `Notice fullscreen`            | the app icon, the status line; fills the window                                  |

`RequestError` stays a one-line inline alert by default (`layout="inline"`): field- and action-level
errors stay inline; a page or region whose content failed to load uses `layout="tile"`.

```tsx
<StateTile icon="inbox" title="No channels yet." action={<Button onClick={reload}>Refresh</Button>} />
<RequestError layout="tile" message="Couldn't load the channels." retry={reload} />
```

**`StudioPage`**: a padded page in the main region, for screens without a canvas (and for the screens
that keep their current content until they are rebuilt).

## Buttons

`Button` and `LinkButton` render `data-variant`:

| Style       | Look (D2)                                                  | Use                         |
| ----------- | ---------------------------------------------------------- | --------------------------- |
| `prominent` | accent fill, `data-accent="primary"`; at most one per view | the one primary action      |
| `gray`      | white control, 1 px `--color-border-strong` edge (default) | every other action          |
| `plain`     | borderless text in the accent, `data-accent="link"`        | inline actions ("Load URL") |
| toolbar     | `ToolbarButton`: icon-only, borderless, label and tooltip  | panel and top-bar actions   |

`destructive` adds red text and glyph to `gray` or `plain` (`data-destructive`, never a fill). Both
sizes keep the viewport hit target. `iconOnly` requires an `aria-label` by type.

## Other components

**`Toolbar` / `ToolbarButton`**: icon-only, borderless buttons in label colour. The label is the
accessible name and the tooltip; the hit area is the viewport hit target.

**`FileButton`**: a gray button that opens the file picker (the file input sits inside the label,
visually hidden). With `UploadInput` it is the only place a file input is rendered. `UploadInput` is
the one dashed drop target per view (D2's dashed `--color-border-strong` edge).

**`MenuButton`**: a pop-up menu, a gray button and a popover. Enter, Space or the arrow keys open it;
the arrows, Home and End move; Escape closes and returns focus. Items may be `destructive`, radio items
(`checked`) and grouped (`separatorBefore`, `groupLabel`); `header` is a non-interactive line (the
signed-in name). The popover may have a shadow.

**`ConfirmDialog`**: a dialog for confirmations. Focus starts on Cancel, Tab stays inside, Escape and
the scrim cancel. With `destructive` the confirm button is the one red fill in the app.

**`StatusGlyph`**: `tone` is `positive` or `warning`, plus a label: a glyph in the status colour and the
label in secondary label colour. There is no status chip.

**`EmptyState`**, **`LoadingState`**, **`Notice`**, **`Splash`**: the earlier state components with their
props unchanged; since D-142F-39 they render the `StateTile` (see the table under `StateTile`).

**`PageHeader`, `ListSection`, `ListRow`**: kept until the screens that use them are rebuilt
(D-142G-3, D-142G-4, stage B); new Studio screens do not use them (R3).

## Focus after the main action

After a screen's main action, keyboard focus moves to a defined element and never falls back to
`<body>` (T-142-F2 item 4):

- **Success:** the control of the user's next step. In the Banner editor that is the channel select
  after "Crop & send image": the next step is the next channel, and the success toast is announced
  by its own live region.
- **Failure:** the error message (a focusable wrapper, `tabIndex={-1}`, around the `RequestError`).
  A field error focuses its field instead.

Focus moves once the controls are enabled again, so it never lands on a disabled control.

## Hit targets

Every visible `button`, `a`, `input`, `select`, `textarea` and `[role=button]` is at least 28 × 28 px
from 1024 px wide and 44 × 44 px below (`e2e/hit-targets.spec.ts`, all four projects). Exemptions,
each also listed in the spec:

| Exemption                            | Reason                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Inline text link inside running text | HIG and WCAG 2.5.8 exempt inline targets; enlarging them would break the line height               |
| Checkbox or radio input              | Counts when its associated `label` is at least the hit target (`Checkbox` makes the row the label) |
| Visually hidden file input           | Counts when its drop zone or `FileButton` label is at least the hit target                         |
