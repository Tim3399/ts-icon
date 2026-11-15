# ts-icon design

Product decisions for the admin UI in `webapp-banner-tool/`. The system contract (layers, tokens,
contrast pairs, allowed surface values, class prefix) is in
[`webapp-banner-tool/src/design/README.md`](../../webapp-banner-tool/src/design/README.md).

## Goal

The admin UI should feel like a native, carefully built tool and look like the TeamSpeak client the
banners are made for, so admins judge each banner in its real context (T-142).

## Sources and their order

When two sources disagree, the higher one wins:

1. Team decisions D-2 and D-3 and the T-142 brief.
2. **Apple Human Interface Guidelines** (R-1 section 1): semantic colour roles, contrast, sidebar rules,
   motion and Reduce Motion. Metrics are the **iOS values on every viewport** (D-3): iOS type scale,
   44 × 44 px hit targets, minimum text 11 px.
3. **TeamSpeak colours and channel-tree look**: the user's TeamSpeak 6 reference screenshot first, then
   teamspeak.com (R-1 2.1), then the official client screenshots (R-1 2.2). Navy surfaces, a blue
   accent, green for positive states. The dark theme looks like the TeamSpeak 6 client; a light theme is
   derived from the same roles.
4. `src/design/FRONTEND_STYLEGUIDE_v2.1.md` (repo root) as a general quality guide where it does not
   conflict with 1–3.
5. Structure (not look) from quiltor and mediagrab: a layered design folder, one barrel entry point and a
   written contract.

Not used: the colours, fonts and palettes of quiltor and mediagrab, and the B825 "Afterglow" language.

## HIG and TeamSpeak conflicts

From R-1 section 3, with the side chosen:

| Topic               | HIG                                                                         | TeamSpeak                                               | Chosen                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Appearance          | Follow the system light/dark setting                                        | Dark only                                               | **HIG.** Follows the system; a three-state control (system, light, dark) keeps "system" reachable. Dark is the TeamSpeak look. |
| Colour semantics    | Semantic roles; colour sparingly, accent on the primary action's background | Several accent colours at once (blue, green, type tags) | **HIG.** Role tokens only; blue for the accent and links, green only for positive states, always with text or a glyph.         |
| Contrast            | 4.5:1 for text, 3:1 for non-text UI                                         | Muted greys on navy, unmeasured                         | **HIG.** Where a TeamSpeak value fails, a value of the same hue is used (D-3); the contrast test enforces it.                  |
| Density             | iOS: 17 px body, 44 × 44 px targets (D-3)                                   | ≈ 25 px rows, 12–14 px text                             | **HIG.** iOS metrics everywhere; the channel tree keeps its pill look at the larger size.                                      |
| Shape               | No radius values, asks for consistency                                      | Fully rounded pills, 12–16 px card radii                | **TeamSpeak.** Pill buttons and rows, 14–16 px cards; HIG has no conflicting rule.                                             |
| Materials and depth | Liquid Glass for controls, opaque content                                   | Flat, opaque navy steps; lighter is nearer              | **TeamSpeak**, which matches HIG's base/elevated dark model. No translucency or blur.                                          |
| Sidebar hierarchy   | At most two levels                                                          | Deeper sections and a three-level channel tree          | **HIG** for the sidebar (one level today). The channel tree lives in the live panel, not the sidebar.                          |
| Sidebar icons       | Accent-coloured symbols                                                     | Full-colour artwork                                     | **HIG.** Line icons in the accent colour.                                                                                      |
| Typography          | San Francisco, avoid light weights                                          | Inter / humanist sans                                   | **HIG.** System font stack starting with `-apple-system`; weights 400, 500, 600, 700; no web font.                             |
| Motion              | Brief, purposeful, honour Reduce Motion                                     | 0.2–0.25 s transitions on the website                   | **Both.** 120–260 ms tokens; every duration drops to 0.01 ms under Reduce Motion.                                              |
| Button labels       | Verb-first, one prominent action, style not size                            | Verb-first, accent-filled pill                          | **Both.** Verb-first labels, at most one prominent (accent-filled) button per screen, destructive actions never prominent.     |
| Primary placement   | Not at the bottom of a sidebar                                              | Primary action at the bottom of the column              | **HIG.** Account and panel controls sit in the toolbar at the top; the sidebar holds navigation only.                          |

## App shell

- Sidebar on the leading side with the existing destinations, labels, icons and permission gating; one
  level. The current entry is persistently highlighted (`aria-current="page"`).
- From 1024 px the sidebar is a visible column. Below that it collapses behind a toolbar toggle and opens
  as a drawer; Escape closes it and returns focus to the toggle; a navigation closes it.
- The live channel-tree panel stays admin-only, keeps its show/hide control and the stored choice
  `ts-icon-rail-open`. From 1200 px it is a column beside the content, below that it sits under the
  content.

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

The app shell itself (sidebar, toolbar, live panel) has no prominent button.

## Channel tree look

The live panel's channel tree follows the reference screenshot (T-142 item 17): rounded pill rows on a
surface darker than the panel, the channel icon on the left and the name in medium weight; banners behind
their row, fading into the row colour; spacer rows as banner-only pills; group rows with a bold label
over the banner; indented sub-channels; no chevron unless it collapses something.
