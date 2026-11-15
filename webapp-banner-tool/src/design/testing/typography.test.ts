// T-142 item 7 and T-142-F1 addendum 1: the iOS type scale below 1024 px, the
// macOS scale from 1024 px (one media query in metrics.css), the allowed
// weights, the 11 px floor and the system font stack.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from webapp-banner-tool/ (jsdom has no file: import.meta.url).
const designDir = join(process.cwd(), "src/design");
const srcDir = join(designDir, "..");
const typography = readFileSync(join(designDir, "typography.css"), "utf8");
const metrics = readFileSync(join(designDir, "metrics.css"), "utf8");
const declarations = (css: string) =>
  Object.fromEntries(
    [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
const tokens = declarations(typography);
// The only media query of the foundations switches the metrics at 1024 px.
const desktop = declarations(metrics);

// iOS / iPadOS Dynamic Type, "Large (default)": size / leading in points.
const IOS_SCALE: Record<string, [number, number]> = {
  "large-title": [34, 41],
  "title-1": [28, 34],
  "title-2": [22, 28],
  "title-3": [20, 25],
  headline: [17, 22],
  body: [17, 22],
  callout: [16, 21],
  subheadline: [15, 20],
  footnote: [13, 18],
  "caption-1": [12, 16],
  "caption-2": [11, 13],
};

// macOS built-in text styles in points; Footnote and Caption (10 pt) are
// raised to the 11 px web floor.
const MACOS_SCALE: Record<string, [number, number]> = {
  "large-title": [26, 32],
  "title-1": [22, 26],
  "title-2": [17, 22],
  "title-3": [15, 20],
  headline: [13, 16],
  body: [13, 16],
  callout: [12, 15],
  subheadline: [11, 14],
  footnote: [11, 14],
  "caption-1": [11, 14],
  "caption-2": [11, 14],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return /\.(css|tsx?)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("type scale", () => {
  for (const [role, [size, line]] of Object.entries(IOS_SCALE)) {
    it(`${role} is ${size}/${line} px`, () => {
      expect(tokens[`--font-${role}-size`]).toBe(`${size}px`);
      expect(tokens[`--font-${role}-line`]).toBe(`${line}px`);
    });
  }

  for (const [role, [size, line]] of Object.entries(MACOS_SCALE)) {
    it(`from 1024 px ${role} is ${size}/${line} px`, () => {
      expect(desktop[`--font-${role}-size`]).toBe(`${size}px`);
      expect(desktop[`--font-${role}-line`]).toBe(`${line}px`);
    });
  }

  it("switches the metrics with exactly one media query at 1024 px", () => {
    expect(metrics.match(/@media/g)).toHaveLength(1);
    expect(metrics).toContain("@media (min-width: 1024px)");
    expect(tokens["--size-hit-target"]).toBeUndefined();
    expect(desktop["--size-hit-target-small"]).toBe("28px");
    expect(parseInt(desktop["--size-hit-target"])).toBeGreaterThanOrEqual(28);
  });

  it("uses the Headline weight 600 on iOS and bold on macOS", () => {
    expect(tokens["--font-weight-headline"]).toBe("var(--font-weight-semibold)");
    expect(desktop["--font-weight-headline"]).toBe("var(--font-weight-bold)");
    expect(tokens["--font-weight-semibold"]).toBe("600");
  });

  it("uses only the weights 400, 500, 600 and 700", () => {
    const literal = Object.entries(tokens)
      .filter(([name]) => name.startsWith("--font-weight"))
      .map(([, value]) => value)
      .filter((value) => !value.startsWith("var("));
    expect(new Set(literal)).toEqual(new Set(["400", "500", "600", "700"]));
  });

  it("has no text size below 11 px", () => {
    const sizes = Object.entries({ ...tokens, ...desktop })
      .filter(([name]) => /^--font-.*-size$/.test(name))
      .map(([, value]) => parseFloat(value));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  it("starts the font stack with the Apple system fonts", () => {
    expect(tokens["--font-family-text"].replace(/\s+/g, " ")).toMatch(
      /^-apple-system, BlinkMacSystemFont, system-ui,/,
    );
  });

  it("loads no web font anywhere in src", () => {
    const offenders = cssFiles(srcDir).filter((file) =>
      /@font-face|fonts\.googleapis|\.woff2?\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
