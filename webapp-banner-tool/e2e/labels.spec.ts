// T-142-F2 item 5: no form row repeats its label. On every route, no two
// visible label texts in the same form row are equal or contain one another
// (case-insensitive). Form rows are the D2 PropertyRow and DataTable rows
// (T-142-F3 R9). Labels are the row title and every visible
// field label.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { ALL_ROUTES, SCREEN_ROUTES } from "./fixtures/routes";

const ROWS = ".ds-property-row, .ds-data-table tbody tr";

async function repeatedLabels(page: Page) {
  return page.evaluate((rowsSelector) => {
    const visible = (el: Element) => {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      if (el.closest(".ds-visually-hidden")) return false;
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    const text = (el: Element) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
    const out: string[] = [];
    let rows = 0;
    for (const row of Array.from(document.querySelectorAll(rowsSelector))) {
      if (!visible(row)) continue;
      rows += 1;
      const labels: string[] = [];
      for (const title of Array.from(
        row.querySelectorAll(
          ":scope > * > .ds-list-row-text > .ds-list-row-title, :scope > .ds-property-label",
        ),
      )) {
        // The title's own words: fields inside it are counted by their labels below.
        const own = title.cloneNode(true) as HTMLElement;
        own.querySelectorAll(".ds-field, input, select, textarea").forEach((n) => n.remove());
        const words = (own.textContent ?? "").replace(/\s+/g, " ").trim();
        if (words && visible(title) && title.tagName !== "LABEL") labels.push(words);
      }
      for (const label of Array.from(row.querySelectorAll("label, legend")))
        if (visible(label) && text(label)) labels.push(text(label));
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const [a, b] = [labels[i].toLowerCase(), labels[j].toLowerCase()];
          if (a.includes(b) || b.includes(a)) out.push(`"${labels[i]}" / "${labels[j]}"`);
        }
    }
    return { rows, repeated: out };
  }, ROWS);
}

for (const route of ALL_ROUTES) {
  test(`${route.name}: no form row repeats its label`, async ({ page }) => {
    await mockApi(page);
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    // Open every disclosure that reveals more fields.
    for (const toggle of await page.locator('#main-content button[aria-expanded="false"]').all())
      if (await toggle.isVisible()) await toggle.click();
    const { rows, repeated } = await repeatedLabels(page);
    // R3: the screens have form rows; a check that finds none is vacuous.
    if (SCREEN_ROUTES.some((screen) => screen.path === route.path))
      expect(rows, "form rows found").toBeGreaterThan(0);
    expect(repeated).toEqual([]);
  });
}
