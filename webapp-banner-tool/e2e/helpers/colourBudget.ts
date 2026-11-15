// The colour walk of T-142-F1 items 1-3 and the structure walk of items 6, 8
// and 9, shared by colour-budget.spec.ts and structure.spec.ts.
//
// Accent tokens are resolved in the page by painting a probe element with
// each token, so the comparison is on computed colours. The focus ring
// (`:focus-visible` outline) is a global rule that uses the focus token on
// every element, so the walk ignores `outline-color`; colour-budget.spec.ts
// checks the ring separately by tabbing to controls.
import type { Page } from "@playwright/test";

export interface WalkOptions {
  /** Skip elements inside this selector (a screen that is still pending). */
  exclude?: string;
  /** Only walk elements inside this selector. */
  within?: string;
}

/** Violations of the colour budget; an empty list means the scope is clean. */
export async function colourBudgetViolations(page: Page, options: WalkOptions = {}) {
  return page.evaluate(({ exclude, within }) => {
    const resolve = (token: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const set = (tokens: string[]) => new Set(tokens.map(resolve));
    const accent = set([
      "--color-accent",
      "--color-accent-fill",
      "--color-accent-fill-hover",
      "--color-accent-fill-pressed",
      "--color-link",
      "--color-focus",
    ]);
    const destructive = set(["--color-destructive", "--color-destructive-fill"]);
    const status = set(["--color-positive", "--color-warning"]);

    const root = within ? document.querySelector(within) : document.body;
    if (!root) return [`missing scope ${within}`];
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${
        el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""
      } "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    const out: string[] = [];

    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (["SCRIPT", "STYLE", "TITLE", "HEAD"].includes(el.tagName)) continue;
      if (exclude && el.closest(exclude)) continue;
      if (el.closest("[inert]")) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const small = box.width <= 16.5 && box.height <= 16.5;
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      const values: [string, string][] = [
        ["color", cs.color],
        ["background-color", cs.backgroundColor],
      ];
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const style = cs.getPropertyValue(`border-${side}-style`);
        const width = parseFloat(cs.getPropertyValue(`border-${side}-width`));
        if (style !== "none" && width > 0)
          values.push([`border-${side}-color`, cs.getPropertyValue(`border-${side}-color`)]);
      }
      if (el instanceof SVGElement) values.push(["fill", cs.fill], ["stroke", cs.stroke]);

      for (const [prop, value] of values) {
        // Item 1: accent only with a data-accent ancestor-or-self.
        if (accent.has(value) && !el.closest("[data-accent]"))
          out.push(`accent ${prop} on ${name(el)} has no data-accent`);
        // Item 2: destructive red only as text/glyph on a destructive action or error.
        if (destructive.has(value)) {
          const allowed = el.closest("[data-destructive], [role=alert], [role=alertdialog]");
          if (!allowed) out.push(`destructive ${prop} on ${name(el)} outside a destructive action`);
          if (prop === "background-color" && !el.closest("[role=alertdialog], [role=dialog]"))
            out.push(`red fill on ${name(el)} outside a dialog`);
        }
        // Item 3: status colours only as a glyph of at most 16 px next to text.
        if (status.has(value)) {
          if (prop === "color" && ownText) out.push(`status colour as text on ${name(el)}`);
          else if (prop !== "color" && !small)
            out.push(
              `status ${prop} on ${name(el)} is ${Math.round(box.width)}x${Math.round(box.height)}`,
            );
        }
      }
    }
    return out;
  }, options);
}

/** Computed value of a colour token, for assertions in specs. */
export async function resolveToken(page: Page, token: string) {
  return page.evaluate((t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

/**
 * Structure violations: items 6 (no shadow on in-flow content), 8 (button
 * borders) and 9 (at most one dashed drop zone).
 */
export async function structureViolations(page: Page, options: WalkOptions = {}) {
  return page.evaluate(({ exclude, within }) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-border)";
    document.body.appendChild(probe);
    const neutral = getComputedStyle(probe).color;
    probe.remove();

    const root = within ? document.querySelector(within) : document.body;
    if (!root) return [`missing scope ${within}`];
    const popovers = "[role=menu], [role=dialog], [role=alertdialog], [data-popover], .ds-toast";
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${
        el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""
      } "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    const out: string[] = [];
    let dashed = 0;

    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (exclude && el.closest(exclude)) continue;
      if (el.closest("[inert]")) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const cs = getComputedStyle(el);
      if (cs.boxShadow !== "none" && !el.closest(popovers)) out.push(`box-shadow on ${name(el)}`);
      if (el.tagName === "BUTTON") {
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const width = parseFloat(cs.getPropertyValue(`border-${side}-width`));
          const style = cs.getPropertyValue(`border-${side}-style`);
          if (width === 0 || style === "none") continue;
          const colour = cs.getPropertyValue(`border-${side}-color`);
          if (width !== 1 || colour !== neutral)
            out.push(`button ${name(el)} has a ${width}px ${colour} border`);
        }
      }
      if (
        ["top", "right", "bottom", "left"].some(
          (side) => cs.getPropertyValue(`border-${side}-style`) === "dashed",
        )
      )
        dashed += 1;
    }
    if (dashed > 1) out.push(`${dashed} dashed drop zones (at most 1 per view)`);
    return out;
  }, options);
}
