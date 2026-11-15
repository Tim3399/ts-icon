# ts-icon design

Product decisions for the admin UI in `webapp-banner-tool/`. The system contract (layers, tokens,
contrast pairs, allowed surface values, class prefix) is in
[`webapp-banner-tool/src/design/README.md`](../../webapp-banner-tool/src/design/README.md).

## Goal

The admin UI should feel like a native, carefully built tool and look like the TeamSpeak client the
banners are made for, so admins judge each banner in its real context (T-142). Since T-142-F3 the look
is concept **D2 "Studio Light"** (D-15): a light-first Studio workspace with a derived dark theme.

## Sources and their order

When two sources disagree, the higher one wins:

1. Team decisions D-2 to D-17 and the T-142, T-142-F1, T-142-F2 and T-142-F3 briefs.
2. **Concept D2 "Studio Light"** (binding visual reference, D-15):
   `ts-icon-kb/implementer/T-142-concepts-D/D2/` (`editor.html`, `channels.html`, `concept.css`,
   `README.md`) and its screenshots. Colours, type, spacing, radii and borders come from its
   `concept.css`; the light theme first, the dark theme is D2's derived variant.
3. **Apple Human Interface Guidelines** (R-1 section 1): contrast, hit targets, one prominent action,
   motion and Reduce Motion. Metrics switch at 1024 px (D-6, R9): from 1024 px D2's desktop values
   (13 px text, 30 px controls, hit targets at least 28 x 28 px), below it D2's phone values (16 px
   text, hit targets at least 44 x 44 px). Minimum text is 11 px.
4. **GitHub Primer** (R-2, D-8) for structure: 1 px borders and row dividers instead of shadows, dense
   tables with a header row, gray bordered secondary buttons.
5. **TeamSpeak**: the TS6 colours and geometry, only inside TeamSpeak previews and pills (the
   `--color-ts-*` roles, R3); the TeamSpeak blue hue for the accent.
6. `src/design/FRONTEND_STYLEGUIDE_v2.1.md` (repo root) as a general quality guide where it does not
   conflict with 1-5.
7. Structure (not look) from quiltor and mediagrab: a layered design folder, one barrel entry point and a
   written contract.

Not used: the colours, fonts and palettes of quiltor and mediagrab, and the B825 "Afterglow" language.

## Rules replaced by D2

T-142-F3 R3 replaces these parent rules; everything else stays.

| Parent rule                                                                            | New rule (D2)                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| F1 item 5, `PageHeader` / `ListSection` / `ListRow`, sidebar shell (T-142 items 14-16) | D2 top bar, panels, tables and inspector                          |
| live panel and `ts-icon-rail-open`                                                     | the layer panel (R2), with no stored toggle                       |
| F1 item 9 dashed limit                                                                 | one drop target per view stays; the dashed style follows D2       |
| type scale and `typography.test.ts`                                                    | D2 type tokens; the test checks them                              |
| dark surfaces and accent (T-142 item 5, D-8)                                           | D2 dark variant; TS6 colours only in TeamSpeak previews and pills |
| managed state only on Banner URLs (F1 item 10)                                         | the table tags "Not managed" as in D2                             |
| nav labels                                                                             | unchanged texts, shown in the mode switcher                       |

## Choices against D2

Where the D2 mockup and an enforced rule disagree, the rule wins and the difference is small:

- The "ts-icon Studio" mark glyph is neutral, not accent: the accent keeps to its five uses.
- The chosen segment and the pressed tool are marked by a 1 px border, not D2's 1 px ring shadow: no
  shadow on in-flow content (F1 item 6).
- The panel header is 40 px (the D-142G-1 interface); D2 draws 44 px.

## HIG and D2

| Topic            | HIG                                            | Chosen                                                                                                  |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Appearance       | Follow the system light/dark setting           | **HIG.** Follows the system; the account menu offers System, Light and Dark, stored in `ts-icon-theme`. |
| Colour semantics | Colour sparingly, accent on the primary action | **HIG.** The colour budget below.                                                                       |
| Contrast         | 4.5:1 for text, 3:1 for non-text UI            | **HIG.** D2's values pass the contrast test unchanged; derived steps only for pressed and red fills.    |
| Density          | 28 px targets on desktop, 44 px on touch       | **D2 with HIG floors.** 30 px controls from 1024 px, 44 px below.                                       |
| Materials        | Opaque content                                 | **D2.** White panels with 1 px borders; only menus, dialogs, toasts and the open drawer cast a shadow.  |
| Typography       | System font, avoid light weights               | **D2.** System font stack starting with `-apple-system`; weights 400, 500, 600, 700; no web font.       |
| Motion           | Brief, purposeful, honour Reduce Motion        | **Both.** D2's 160 ms; every duration drops to 0.01 ms under Reduce Motion.                             |
| Button labels    | Verb-first, one prominent action               | **Both.** At most one prominent button per view; styles are prominent, gray, plain and toolbar only.    |

## Colour budget

Colour marks highlights only (T-142-F1 items 1-3; the README has the token table and the specs).

- **Accent** for five things: the fill of at most one prominent button per view, the current mode and
  selected rows, the focus ring, links and plain text buttons, and the crop frame.
- **Destructive red** only as text or glyph on a destructive action or an error message, and as the
  fill of the confirm button inside a destructive confirmation dialog.
- **Status colours** (positive, warning) only as a glyph of at most 16 px next to a text label (D2's
  7 px dot).
- Everything else is neutral: label, secondary label, 1 px borders and the surfaces.

## Studio shell

- **Top bar:** the "ts-icon Studio" mark, the mode switcher with the four routes (labels, icons and
  gating unchanged; it replaces the sidebar), a screen toolbar slot (the editor's canvas tools and zoom
  readout) and one account menu: the signed-in name, the appearance choice and "Log out".
- **Workspace:** a layer panel on the left (the editor's live tree), the main region (canvas and dock,
  or a table) and an inspector on the right.
- **Breakpoints (R2):** from 1240 px three panels; 1024-1239 px the layer panel is an overlay drawer
  opened from the top bar (Escape closes it and returns focus to the toggle); below 1024 px everything
  stacks: top bar, main, inspector, layers. Below 1240 px the mode labels become icons with accessible
  names and tooltips (R7).
- One drop target per view (the editor's image input), dashed as in D2. In tables a gray "Replace..."
  button opens the file picker, the row still accepts a dropped file, and removing is confirmed in a
  dialog.

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

Access denied and Not found are calm pages: a glyph in secondary label, one friendly sentence and one
clear next action (stage B moves them to the D2 state tile, item 11). Access denied: "Ask an administrator to
give you access." with a gray "Log out". Not found: "This page doesn't exist. The banner editor is a good
place to start." with the prominent "Create a banner".

The Studio shell itself (top bar, mode switcher, layer panel) has no prominent button.

## Channel tree look

The channel tree follows the TeamSpeak 6 client as drawn in the reference screenshot (T-142 item 17,
T-142-F1 addendum 4, D-10). One row component (`ChannelTreeRow`) draws the live tree, the Wallpaper
parent picker and the Banner editor's "Preview in TeamSpeak", always in the TeamSpeak client colours
(`--color-ts-*`, both app themes):

- rows are 30 px rounded pills on the client's pill colour, one every 44 px (14 px apart);
- a banner covers the whole pill (cover, centred) with **no fade**; the name (semi-bold, white, with a
  soft shadow in the tree colour so it stays readable on bright banners) and the channel icon sit on top;
- spacer rows are banner-only pills; a spacer without a loadable banner shows its name;
- a parent channel is a group row (bold label over the banner) only while its banner has loaded;
  otherwise it is a normal channel row with its icon;
- sub-channels are indented 10 px per depth with their right edges aligned; no chevron unless it
  collapses something.

The Banner editor's preview draws these rows at the client size: a depth-0 pill is 456 px wide, so the
admin sees the banner cropped and scaled the way TS6 shows it. Below that width the mock scales down
and says so. A "Saved image (500 × 44)" line under it shows the exact saved pixels at 1:1.

All sizes are measured from the reference screenshot, whose display scale is unknown. They live in
`webapp-banner-tool/src/components/teamspeakGeometry.ts` as "TS6 reference, estimated, calibrate";
calibrating against a real TS6 screenshot of a ruler banner is an optional later step.
