// Every route of the app, as listed in the screen table of
// docs/design/DESIGN.md. The cross-cutting specs (hit targets, prominent
// action) iterate this list.

export interface AppRoute {
  path: string;
  name: string;
  /** Heading that proves the route rendered. */
  heading: string;
  /** Verbs of the destructive actions on this route (screen table). */
  destructiveVerbs: string[];
}

export const SCREEN_ROUTES: AppRoute[] = [
  { path: "/", name: "Banner editor", heading: "Create a channel banner", destructiveVerbs: [] },
  {
    path: "/channels",
    name: "Manage channel images",
    heading: "Manage channel images",
    destructiveVerbs: ["Delete"],
  },
  {
    path: "/banner-urls",
    name: "Banner URLs",
    heading: "Channel banner URLs",
    destructiveVerbs: [],
  },
  {
    path: "/wallpaper",
    name: "Channel Wallpaper",
    heading: "Channel wallpaper generator",
    destructiveVerbs: ["Undo", "Discard"],
  },
];

export const SHELL_ROUTES: AppRoute[] = [
  { path: "/access-denied", name: "Access denied", heading: "Access denied", destructiveVerbs: [] },
  { path: "/missing-page", name: "Not found", heading: "Page not found", destructiveVerbs: [] },
];

/** Every route, screens first. */
export const ALL_ROUTES: AppRoute[] = [...SCREEN_ROUTES, ...SHELL_ROUTES];

/** Routes whose screens are restyled in stage B (T-142-F1). enabled in stage B */
export const STAGE_B_ROUTES: string[] = ["/wallpaper", "/access-denied", "/missing-page"];

/**
 * Stage-A screens still being rebuilt: the Banner editor by D-142F-2, Manage
 * channel images by D-142F-3. Each part removes its own route from this list
 * when its screen is done. enabled by D-142F-2/3
 */
export const STAGE_A_SCREEN_ROUTES: string[] = [];

/**
 * The cross-cutting specs of T-142-F1 mark a route's test `test.fixme` while
 * its screen is pending. Set TS_ICON_CHECK_PENDING=1 to run them anyway, to
 * see how far a pending screen is from passing.
 */
export function pendingReason(path: string): string | undefined {
  if (process.env.TS_ICON_CHECK_PENDING === "1") return undefined;
  if (STAGE_B_ROUTES.includes(path)) return "enabled in stage B";
  if (STAGE_A_SCREEN_ROUTES.includes(path)) return "enabled by D-142F-2/3";
  return undefined;
}

/**
 * Parts of the shell that render a screen-owned component and are checked
 * with that screen: the routed content. The live channel tree
 * (ChannelTreePreview) was rebuilt with the Banner editor in D-142F-2 and is
 * checked with the shell.
 */
export const SCREEN_OWNED_SCOPES = "#main-content";

/** Verbs that must never label a prominent button, on any route. */
export const DESTRUCTIVE_VERBS = ["Delete", "Remove", "Undo", "Discard", "Clear", "Reset"];
