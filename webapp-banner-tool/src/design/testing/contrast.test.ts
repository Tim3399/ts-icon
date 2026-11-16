// T-142 item 6: WCAG contrast of the colour roles in both themes. The pair
// list here must equal the pair table in ../README.md; the test fails if the
// README names a pair this file does not check, or the other way round.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Theme = "light" | "dark";
type Pair = { fg: string; bg: string; min: number };

// Vitest runs from webapp-banner-tool/ (jsdom has no file: import.meta.url).
const read = (name: string) => readFileSync(join(process.cwd(), "src/design", name), "utf8");
const colors = read("foundations/colors.css");
const readme = read("README.md");

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

function block(source: string, selector: RegExp): string {
  const body = source.match(selector)?.[1];
  if (!body) throw new Error(`Missing block ${selector}`);
  return body;
}

// The raw palette is the first plain `:root {` block of foundations/colors.css.
const raw = declarations(block(colors, /:root\s*\{([^}]*)\}/));
const light = declarations(block(colors, /:root,\s*:root\[data-theme="light"\]\s*\{([^}]*)\}/));
const darkExplicit = declarations(block(colors, /\n:root\[data-theme="dark"\]\s*\{([^}]*)\}/));
const darkSystem = declarations(block(colors, /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/));
const themes: Record<Theme, Record<string, string>> = { light, dark: darkExplicit };

function resolve(theme: Theme, name: string, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`Token cycle: ${[...seen, name].join(" -> ")}`);
  const value = themes[theme][name] ?? raw[name];
  if (!value) throw new Error(`${theme}: token ${name} is missing`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolve(theme, alias[1], [...seen, name]) : value;
}

type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba;
  const rgb = value.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+)(%?))?\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
  }
  throw new Error(`Unsupported colour value: ${value}`);
}

/** Translucent tokens are composited on the named backdrop first. */
function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrast(theme: Theme, fgToken: string, bgToken: string): number {
  const bg = parse(resolve(theme, bgToken));
  if (bg[3] !== 1) throw new Error(`${bgToken} must be opaque to serve as a backdrop`);
  const fg = composite(parse(resolve(theme, fgToken)), bg);
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;
const TEXT_BACKGROUNDS = [
  "--color-bg-window",
  "--color-bg-sidebar",
  "--color-bg-content",
  "--color-bg-elevated",
  "--color-control-bg",
];

const PAIRS: Pair[] = [
  ...[
    "--color-label",
    "--color-label-secondary",
    "--color-label-tertiary",
    "--color-placeholder",
    "--color-link",
  ].flatMap((fg) => TEXT_BACKGROUNDS.map((bg) => ({ fg, bg, min: TEXT }))),
  ...["--color-label", "--color-label-secondary"].flatMap((fg) =>
    ["--color-bg-panel", "--color-bg-row"].map((bg) => ({ fg, bg, min: TEXT })),
  ),
  { fg: "--color-on-accent-fill", bg: "--color-accent-fill", min: TEXT },
  { fg: "--color-on-destructive-fill", bg: "--color-destructive-fill", min: TEXT },
  ...["--color-positive", "--color-warning", "--color-destructive"].flatMap((fg) =>
    ["--color-bg-content", "--color-bg-elevated"].map((bg) => ({ fg, bg, min: TEXT })),
  ),
  ...["--color-accent", "--color-focus", "--color-separator"].flatMap((fg) =>
    TEXT_BACKGROUNDS.map((bg) => ({ fg, bg, min: NON_TEXT })),
  ),
  { fg: "--color-focus", bg: "--color-bg-panel", min: NON_TEXT },
  { fg: "--color-separator", bg: "--color-bg-panel", min: NON_TEXT },
  // D2 Studio surfaces: hover and selected rows, the canvas, the crop label
  ...["--color-label", "--color-label-secondary"].flatMap((fg) =>
    ["--color-hover-bg", "--color-selected-bg"].map((bg) => ({ fg, bg, min: TEXT })),
  ),
  { fg: "--color-canvas-label", bg: "--color-bg-canvas", min: TEXT },
  { fg: "--color-on-crop-label", bg: "--color-crop-label-bg", min: TEXT },
  { fg: "--color-focus", bg: "--color-bg-canvas", min: NON_TEXT },
  // TeamSpeak client roles (theme-independent, the TeamSpeak preview)
  { fg: "--color-ts-label", bg: "--color-ts-row-bg", min: TEXT },
  { fg: "--color-ts-label", bg: "--color-ts-tree-bg", min: TEXT },
  { fg: "--color-ts-label-secondary", bg: "--color-ts-row-bg", min: TEXT },
];

const key = (p: Pair) => `${p.fg} on ${p.bg} >= ${p.min}`;

function readmePairs(): Pair[] {
  const section = readme.match(
    /<!-- contrast-pairs:start -->([\s\S]*?)<!-- contrast-pairs:end -->/,
  );
  if (!section) throw new Error("README has no contrast pair table");
  return [
    ...section[1].matchAll(/^\|\s*`(--[\w-]+)`\s*\|\s*`(--[\w-]+)`\s*\|\s*([\d.]+)\s*\|/gm),
  ].map((m) => ({ fg: m[1], bg: m[2], min: Number(m[3]) }));
}

describe("colour roles", () => {
  it("declares the same dark theme for the system preference and the explicit choice", () => {
    expect(darkSystem).toEqual(darkExplicit);
  });

  it("lists exactly the checked pairs in the README", () => {
    expect(readmePairs().map(key).sort()).toEqual(PAIRS.map(key).sort());
  });

  // T-142-F3 R3 (replaces T-142 item 5): dark base surfaces come from D2's
  // dark variant; the TeamSpeak navy stays in the --color-ts-* roles.
  it("takes every dark base surface from the D2 dark variant", () => {
    const allowed = ["#12161e", "#161b24", "#1a1f29", "#1e2430", "#232a36", "#2a313e"];
    for (const token of [
      "--color-bg-window",
      "--color-bg-sidebar",
      "--color-bg-content",
      "--color-bg-elevated",
      "--color-bg-panel",
      "--color-bg-row",
      "--color-control-bg",
      "--color-checker-a",
      "--color-checker-b",
    ]) {
      expect(allowed, token).toContain(resolve("dark", token).toLowerCase());
    }
  });

  for (const theme of ["light", "dark"] as const) {
    describe(`${theme} theme`, () => {
      for (const pair of PAIRS) {
        it(`${pair.fg} on ${pair.bg} reaches ${pair.min}:1`, () => {
          expect(contrast(theme, pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
        });
      }
    });
  }
});
