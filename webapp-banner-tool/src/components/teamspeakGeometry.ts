import type { CSSProperties } from "react";

/**
 * TeamSpeak 6 channel-tree geometry, in CSS px (T-142-F1 addendum 4, D-10).
 * Measured from the reference screenshot T-142-reference-ts6.webp, whose
 * display scale is unknown: every value is a TS6 reference, estimated,
 * calibrate (against a real TS6 screenshot of a ruler banner).
 *
 * This is the one place these values live. ChannelTreeRow passes them to its
 * CSS as the --teamspeak-* custom properties; the e2e specs import them.
 */
export const TEAMSPEAK_GEOMETRY = {
  /** Pill height. TS6 reference, estimated, calibrate. */
  rowHeight: 30,
  /** Distance from one row's top to the next (pill + 14 px between rows). TS6 reference, estimated, calibrate. */
  rowPitch: 44,
  /** Indent per depth; right edges stay aligned. TS6 reference, estimated, calibrate. */
  indent: 10,
  /** Width of a depth-0 pill in the client's tree column. TS6 reference, estimated, calibrate. */
  treeWidth: 456,
  /** Pill corner radius. TS6 reference, estimated, calibrate. */
  radius: 6,
  /** Channel name size (semi-bold). TS6 reference, estimated, calibrate. */
  nameSize: 13,
  /** Gap between the channel icon and the name. TS6 reference, estimated, calibrate. */
  iconGap: 6,
} as const;

const px = (value: number) => `${value}px`;

/** The geometry as CSS custom properties, set on every tree row. */
export const TEAMSPEAK_GEOMETRY_STYLE = {
  "--teamspeak-row-height": px(TEAMSPEAK_GEOMETRY.rowHeight),
  "--teamspeak-row-pitch": px(TEAMSPEAK_GEOMETRY.rowPitch),
  "--teamspeak-tree-width": px(TEAMSPEAK_GEOMETRY.treeWidth),
  "--teamspeak-row-radius": px(TEAMSPEAK_GEOMETRY.radius),
  "--teamspeak-name-size": px(TEAMSPEAK_GEOMETRY.nameSize),
  "--teamspeak-icon-gap": px(TEAMSPEAK_GEOMETRY.iconGap),
} as CSSProperties;
