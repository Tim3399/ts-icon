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

/** Verbs that must never label a prominent button, on any route. */
export const DESTRUCTIVE_VERBS = ["Delete", "Remove", "Undo", "Discard", "Clear", "Reset"];
