// T-142-F3 R2: the Studio breakpoints. Media queries cannot read custom
// properties, so the widths in StudioShell.css must equal the queries in
// studioLayout.ts, and the main column keeps room for a 500 px crop stage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_DESKTOP_QUERY, STUDIO_WIDE_QUERY } from "../patterns/studioLayout";

const read = (name: string) => readFileSync(join(process.cwd(), "src/design", name), "utf8");
const px = (css: string, token: string) =>
  Number(css.match(new RegExp(`${token}:\\s*(\\d+)px`))?.[1]);
const width = (query: string) => Number(query.match(/(\d+)px/)?.[1]);

describe("Studio layout", () => {
  const tokens = read("foundations/tokens.css");
  const shell = read("patterns/StudioShell.css");

  it("keeps room for a 500 px crop stage plus the canvas padding in the main column", () => {
    expect(px(tokens, "--size-main-min")).toBeGreaterThanOrEqual(500 + 2 * 24);
  });

  it("uses the same breakpoints in the CSS as in the layout hook", () => {
    expect(width(STUDIO_WIDE_QUERY)).toBe(1240);
    expect(width(STUDIO_DESKTOP_QUERY)).toBe(1024);
    expect(shell).toContain("@media (min-width: 1240px)");
    expect(shell).toContain("@media (max-width: 1239px)");
    expect(shell).toContain("@media (max-width: 1023px)");
  });

  it("leaves the main column its minimum next to both panels at 1240 px", () => {
    const main =
      width(STUDIO_WIDE_QUERY) - px(tokens, "--size-layers") - px(tokens, "--size-inspector");
    expect(main).toBeGreaterThanOrEqual(px(tokens, "--size-main-min"));
  });
});
