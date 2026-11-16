// Shared assertions for the cross-cutting T-142 checks (items 8 and 18) and
// the keyboard helpers the screen specs reuse.
import { expect, type Locator, type Page } from "@playwright/test";

/** T-142-F1 addendum 1: 28 px from 1024 px wide (macOS), 44 px below (iOS). */
export const HIT_TARGET_DESKTOP_PX = 28;
export const HIT_TARGET_MOBILE_PX = 44;

/**
 * Exemptions of the hit-target rule. Each is repeated in
 * src/design/README.md ("Hit targets").
 */
export const HIT_TARGET_EXEMPTIONS = {
  inlineTextLink:
    "An inline text link inside running text: HIG and WCAG 2.5.8 exempt inline targets.",
  checkboxOrRadio: "A checkbox or radio counts through its associated label (at least 44 x 44).",
  hiddenFileInput:
    "A visually hidden file input counts through its drop-zone label (at least 44 x 44).",
} as const;

interface HitTargetOptions {
  /** Only check controls inside this selector. */
  within?: string;
  /** Skip controls inside this selector (e.g. a screen still pending restyle). */
  exclude?: string;
}

/**
 * T-142 item 8: every visible button, link, input, select, textarea and
 * [role=button] has a bounding box of at least 28 x 28 px from 1024 px wide
 * and 44 x 44 px below.
 */
export async function expectHitTargets(page: Page, options: HitTargetOptions = {}) {
  const offenders = await page.evaluate(
    ({ desktop, mobile, within, exclude }) => {
      const min = window.matchMedia("(min-width: 1024px)").matches ? desktop : mobile;
      const root = within ? document.querySelector(within) : document.body;
      if (!root) return [`missing scope ${within}`];
      const controls = root.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea, [role=button]",
      );
      const describe = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(
          el.getAttribute("aria-label") ||
          el.textContent ||
          ""
        )
          .trim()
          .slice(0, 40)}"`;
      const bigEnough = (el: Element) => {
        const box = el.getBoundingClientRect();
        return box.width >= min - 0.5 && box.height >= min - 0.5;
      };
      const result: string[] = [];
      for (const el of Array.from(controls)) {
        if (exclude && el.closest(exclude)) continue;
        if (el.closest("[inert]")) continue;
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        // Exemption: inline text link inside running text.
        if (
          el.tagName === "A" &&
          getComputedStyle(el).display === "inline" &&
          Array.from(el.parentElement?.childNodes ?? []).some(
            (node) => node !== el && node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )
        )
          continue;
        if (el instanceof HTMLInputElement) {
          // Exemptions: checkbox or radio through its label, hidden file input through its drop zone.
          const label = el.labels?.[0] ?? el.closest("label");
          const viaLabel =
            ["checkbox", "radio"].includes(el.type) ||
            (el.type === "file" && Number(getComputedStyle(el).opacity) === 0);
          if (viaLabel) {
            if (!label || !bigEnough(label)) result.push(`${describe(el)} (label too small)`);
            continue;
          }
        }
        if (!bigEnough(el))
          result.push(`${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
      return result;
    },
    {
      desktop: HIT_TARGET_DESKTOP_PX,
      mobile: HIT_TARGET_MOBILE_PX,
      within: options.within,
      exclude: options.exclude,
    },
  );
  expect(offenders, "Controls below the hit target (28 px from 1024 px, 44 px below)").toEqual([]);
}

/**
 * T-142 item 18: at most one prominent (accent-filled) button per route, and
 * none labelled with a destructive verb from the screen table.
 */
export async function expectProminentRule(page: Page, destructiveVerbs: string[]) {
  const prominent = page.locator('[data-variant="prominent"]:visible');
  expect(await prominent.count(), "Prominent buttons on this route").toBeLessThanOrEqual(1);
  for (const label of await prominent.allInnerTexts()) {
    for (const verb of destructiveVerbs) {
      expect(label, `Prominent button labelled with "${verb}"`).not.toMatch(
        new RegExp(`\\b${verb}\\b`, "i"),
      );
    }
  }
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

/** Presses Tab until `control` has focus (at most 50 times). */
export async function tabTo(page: Page, control: Locator) {
  for (let i = 0; i < 50; i++) {
    if (await control.evaluate((node) => node === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(control, "Control must be reachable with Tab alone").toBeFocused();
}

/**
 * T-142-F3 R2: from 1024 to 1239 px the layer panel is a drawer behind a
 * top-bar toggle; this reports whether the viewport is in that range.
 */
export async function layersAreDrawer(page: Page) {
  return page.evaluate(
    () =>
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(min-width: 1240px)").matches,
  );
}

/** Opens the layer drawer with the keyboard only (Tab to the toggle, Enter). */
export async function openLayersByKeyboard(page: Page) {
  const toggle = page.getByRole("button", { name: "Show layers" });
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide layers" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
}
