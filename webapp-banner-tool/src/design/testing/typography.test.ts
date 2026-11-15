// T-142-F3 item 2 and R3/R9: the D2 type scale. Below 1024 px D2's phone
// values, from 1024 px D2's desktop values (one media query in metrics.css,
// D-6), the allowed weights, the 11 px floor and the system font stack. The
// HIG role names of earlier rounds are aliases of the D2 sizes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from webapp-banner-tool/ (jsdom has no file: import.meta.url).
const designDir = join(process.cwd(), "src/design");
const srcDir = join(designDir, "..");
const typography = readFileSync(join(designDir, "foundations/typography.css"), "utf8");
const metrics = readFileSync(join(designDir, "foundations/metrics.css"), "utf8");
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

// D2 concept.css: size / line height in px. "heading" is not in D2 (it has no
// page titles); it serves the few headings the earlier screens still show.
const D2_PHONE: Record<string, [number, number]> = {
  micro: [13, 18],
  small: [15, 20],
  text: [16, 22],
  title: [17, 22],
  heading: [22, 28],
};
const D2_DESKTOP: Record<string, [number, number]> = {
  micro: [11, 16],
  small: [12, 18],
  text: [13, 20],
  title: [15, 20],
  heading: [17, 22],
};

// HIG role name -> the D2 size it aliases.
const ALIASES: Record<string, string> = {
  "large-title": "heading",
  "title-1": "heading",
  "title-2": "heading",
  "title-3": "title",
  headline: "text",
  body: "text",
  callout: "small",
  subheadline: "small",
  footnote: "micro",
  "caption-1": "micro",
  "caption-2": "micro",
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return /\.(css|tsx?)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("type scale", () => {
  for (const [role, [size, line]] of Object.entries(D2_PHONE)) {
    it(`below 1024 px ${role} is ${size}/${line} px`, () => {
      expect(tokens[`--font-${role}-size`]).toBe(`${size}px`);
      expect(tokens[`--font-${role}-line`]).toBe(`${line}px`);
    });
  }

  for (const [role, [size, line]] of Object.entries(D2_DESKTOP)) {
    it(`from 1024 px ${role} is ${size}/${line} px`, () => {
      expect(desktop[`--font-${role}-size`]).toBe(`${size}px`);
      expect(desktop[`--font-${role}-line`]).toBe(`${line}px`);
    });
  }

  for (const [role, d2] of Object.entries(ALIASES)) {
    it(`the role ${role} is an alias of the D2 ${d2} size`, () => {
      expect(tokens[`--font-${role}-size`]).toBe(`var(--font-${d2}-size)`);
      expect(tokens[`--font-${role}-line`]).toBe(`var(--font-${d2}-line)`);
    });
  }

  it("switches the metrics with exactly one media query at 1024 px", () => {
    expect(metrics.match(/@media/g)).toHaveLength(1);
    expect(metrics).toContain("@media (min-width: 1024px)");
    expect(desktop["--size-hit-target-small"]).toBe("28px");
    expect(parseInt(desktop["--size-hit-target"])).toBeGreaterThanOrEqual(28);
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
      .filter(([name, value]) => /^--font-.*-size$/.test(name) && !value.startsWith("var("))
      .map(([, value]) => parseFloat(value));
    expect(sizes.length).toBeGreaterThan(0);
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
