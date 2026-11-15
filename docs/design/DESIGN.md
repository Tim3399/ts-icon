# ts-icon design

Product decisions for the admin UI in `webapp-banner-tool/`. The system contract (layers, tokens,
contrast pairs, allowed surface values, class prefix) is in
[`webapp-banner-tool/src/design/README.md`](../../webapp-banner-tool/src/design/README.md).

## Goal

The admin UI should feel like a native, carefully built tool and look like the TeamSpeak client the
banners are made for, so admins judge each banner in its real context (T-142).

## Sources and their order

When two sources disagree, the higher one wins:

1. Team decisions D-2 to D-9 and the T-142 and T-142-F1 briefs.
2. **Apple Human Interface Guidelines** (R-1 section 1): semantic colour roles, contrast, sidebar rules,
   motion and Reduce Motion. Metrics switch at 1024 px (D-6): from 1024 px the **macOS values** (type
   scale 26/32 down to 11/14, hit targets at least 28 × 28 px), below it the **iOS values** (type scale
   34/41 down to 11/13, hit targets at least 44 × 44 px). Minimum text is 11 px on the web.
3. **GitHub Primer** (R-2, D-8) as the second visual reference for app chrome: a neutral canvas,
   containers marked by 1 px neutral borders and row dividers instead of shadows, list boxes with a
   header row, compact aligned rows, colour only for state and the one primary action. The light theme
   uses the Primer light neutrals and the Primer status colours.
4. **TeamSpeak colours and channel-tree look**: the user's TeamSpeak 6 reference screenshot first, then
   teamspeak.com (R-1 2.1), then the official client screenshots (R-1 2.2). Navy surfaces and the
   blue accent stay for the dark theme, the channel tree and the TeamSpeak preview.
5. `src/design/FRONTEND_STYLEGUIDE_v2.1.md` (repo root) as a general quality guide where it does not
   conflict with 1–3.
6. Structure (not look) from quiltor and mediagrab: a layered design folder, one barrel entry point and a
   written contract.

Not used: the colours, fonts and palettes of quiltor and mediagrab, and the B825 "Afterglow" language.

## HIG and TeamSpeak conflicts

From R-1 section 3, with the side chosen:

| Topic               | HIG                                                                         | TeamSpeak                                               | Chosen                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Appearance          | Follow the system light/dark setting                                        | Dark only                                               | **HIG.** Follows the system; a three-state control (system, light, dark) keeps "system" reachable. Dark is the TeamSpeak look. |
| Colour semantics    | Semantic roles; colour sparingly, accent on the primary action's background | Several accent colours at once (blue, green, type tags) | **HIG.** The colour budget below: accent for five things only; red and status colours only as text or glyph.                   |
| Contrast            | 4.5:1 for text, 3:1 for non-text UI                                         | Muted greys on navy, unmeasured                         | **HIG.** Where a TeamSpeak value fails, a value of the same hue is used (D-3); the contrast test enforces it.                  |
| Density             | iOS: 17 px body, 44 × 44 px targets; macOS: 13 px body, 28 px targets       | ≈ 25 px rows, 12–14 px text                             | **HIG,** by viewport (D-6): macOS values from 1024 px, iOS values below. The channel tree keeps its pill look.                 |
| Shape               | No radius values, asks for consistency                                      | Fully rounded pills, 12–16 px card radii                | **Primer and HIG.** 8 px controls, 12 px list boxes, menus and dialogs. Pills only for the channel-tree rows.                  |
| Materials and depth | Liquid Glass for controls, opaque content                                   | Flat, opaque navy steps; lighter is nearer              | **Primer.** 1 px borders and dividers, no shadow on in-flow content; only menus, dialogs and toasts cast one.                  |
| Sidebar hierarchy   | At most two levels                                                          | Deeper sections and a three-level channel tree          | **HIG** for the sidebar (one level today). The channel tree lives in the live panel, not the sidebar.                          |
| Sidebar icons       | Accent-coloured symbols                                                     | Full-colour artwork                                     | **HIG with the colour budget.** Icons in secondary label; the selected row has an accent marker and icon.                      |
| Typography          | San Francisco, avoid light weights                                          | Inter / humanist sans                                   | **HIG.** System font stack starting with `-apple-system`; weights 400, 500, 600, 700; no web font.                             |
| Motion              | Brief, purposeful, honour Reduce Motion                                     | 0.2–0.25 s transitions on the website                   | **Both.** 120–260 ms tokens; every duration drops to 0.01 ms under Reduce Motion.                                              |
| Button labels       | Verb-first, one prominent action, style not size                            | Verb-first, accent-filled pill                          | **Both.** Verb-first labels, at most one prominent button per view; styles are prominent, gray, plain and toolbar only.        |
| Primary placement   | Not at the bottom of a sidebar                                              | Primary action at the bottom of the column              | **HIG.** Account and panel controls sit in the toolbar at the top; the sidebar holds navigation only.                          |

## Colour budget

Colour marks highlights only (T-142-F1 items 1-3; the README has the token table and the specs).

- **Accent** for five things: the fill of at most one prominent button per view, the selected sidebar
  row, the focus ring, links and plain text buttons, and the crop selection frame.
- **Destructive red** only as text or glyph on a destructive action or an error message, and as the
  fill of the confirm button inside a destructive confirmation dialog.
- **Status colours** (positive, warning) only as a glyph of at most 16 px next to a text label.
- Everything else is neutral: label, secondary label, 1 px borders and the surfaces.

## Patterns

Every screen is built from `PageHeader` (Large Title, one-line subtitle, trailing toolbar),
`ListSection` / `ListRow` (a bordered list box with a header row), `Toolbar` / `ToolbarButton`
(page-level actions such as Refresh), `FileButton`, `MenuButton`, `ConfirmDialog`, `StatusGlyph` and
`EmptyState`. Content cards with their own heading, numbered step badges, eyebrow labels and stat tiles
do not exist. At most one dashed drop zone is visible per view (the main image input); in lists a gray
"Replace…" button opens the file picker, the row still accepts a dropped file, and deleting is a plain
destructive "Remove" confirmed in a dialog.

## App shell

- A source-list sidebar on a muted surface with the existing destinations, labels, icons and permission
  gating; one level, a small app name and no logo tile. The current entry is persistently highlighted
  (`aria-current="page"`): muted background, accent marker, accent icon.
- The top bar has the live-panel toggle (admin only) and one account menu: the signed-in name, the
  appearance choice (System, Light, Dark) and "Log out".
- From 1024 px the sidebar is a visible column. Below that it collapses behind a toolbar toggle and opens
  as a drawer; Escape closes it and returns focus to the toggle; a navigation closes it.
- The live channel-tree panel stays admin-only, keeps its show/hide control and the stored choice
  `ts-icon-rail-open`. It sits beside the content only while the main column keeps its minimum width
  (560 px: a 500 px crop stage plus the page padding), and below the content otherwise (D-9).

## Screen table

At most one prominent (accent-filled) button per route. Destructive actions use the destructive role and
are never prominent. `e2e/prominent-action.spec.ts` checks this; the verbs below are the destructive verbs
it rejects on a prominent button.

| Route            | Screen                | Prominent action       | Destructive actions                                                       |
| ---------------- | --------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `/`              | Banner editor         | "Crop & send image"    | none                                                                      |
| `/channels`      | Manage channel images | none                   | "Delete image" (Delete)                                                   |
| `/banner-urls`   | Banner URLs           | "Set for all channels" | none                                                                      |
| `/wallpaper`     | Channel Wallpaper     | "Generate channels"    | "Undo this generation", "Retry undo", "Discard operation" (Undo, Discard) |
| `/access-denied` | Access denied         | none                   | none ("Log out" is not destructive)                                       |
| any other path   | Not found             | "Create a banner"      | none                                                                      |

Access denied and Not found are Blankslate pages (Primer): no card and no eyebrow, a calm glyph in
secondary label, one friendly sentence and one clear next action. Access denied: "Ask an administrator to
give you access." with a gray "Log out". Not found: "This page doesn't exist. The banner editor is a good
place to start." with the prominent "Create a banner".

The app shell itself (sidebar, toolbar, live panel) has no prominent button.

## Channel tree look

The live panel's channel tree follows the reference screenshot (T-142 item 17): rounded pill rows on a
surface darker than the panel, the channel icon on the left and the name in medium weight; banners behind
their row, fading into the row colour; spacer rows as banner-only pills; group rows with a bold label
over the banner; indented sub-channels; no chevron unless it collapses something.
