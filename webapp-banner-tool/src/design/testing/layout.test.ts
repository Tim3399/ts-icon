// T-142-F1 addendum 3 (C1): the live panel sits beside the content only while
// the main column keeps --size-main-min. Container queries cannot read custom
// properties, so the literal in AppShell.css must equal main-min + panel.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "src/design", name), "utf8");
const px = (css: string, token: string) =>
  Number(css.match(new RegExp(`${token}:\\s*(\\d+)px`))?.[1]);

describe("app shell layout", () => {
  const tokens = read("tokens.css");
  const shell = read("patterns/AppShell.css");

  it("keeps room for a 500 px crop stage plus the page padding in the main column", () => {
    expect(px(tokens, "--size-main-min")).toBeGreaterThanOrEqual(500 + 2 * 24);
  });

  it("puts the panel beside the content only from main-min + panel width", () => {
    const query = Number(shell.match(/@container shell \(min-width: (\d+)px\)/)?.[1]);
    expect(query).toBe(px(tokens, "--size-main-min") + px(tokens, "--size-panel"));
  });
});
