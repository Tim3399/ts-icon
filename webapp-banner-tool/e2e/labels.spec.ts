// T-142-F2 item 5: no form row repeats its label. On every route, no two
// visible label texts in the same ListRow are equal or contain one another
// (case-insensitive). Labels are the row title and every visible field label.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { ALL_ROUTES } from "./fixtures/routes";

async function repeatedLabels(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      if (el.closest(".ds-visually-hidden")) return false;
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    const text = (el: Element) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
    const out: string[] = [];
    for (const row of Array.from(document.querySelectorAll(".ds-list-row"))) {
      const labels: string[] = [];
      for (const title of Array.from(
        row.querySelectorAll(":scope > * > .ds-list-row-text > .ds-list-row-title"),
      )) {
        // The title's own words: fields inside it are counted by their labels below.
        const own = title.cloneNode(true) as HTMLElement;
        own.querySelectorAll(".ds-field, input, select, textarea").forEach((n) => n.remove());
        const words = (own.textContent ?? "").replace(/\s+/g, " ").trim();
        if (words && visible(title)) labels.push(words);
      }
      for (const label of Array.from(row.querySelectorAll("label, legend")))
        if (visible(label) && text(label)) labels.push(text(label));
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const [a, b] = [labels[i].toLowerCase(), labels[j].toLowerCase()];
          if (a.includes(b) || b.includes(a)) out.push(`"${labels[i]}" / "${labels[j]}"`);
        }
    }
    return out;
  });
}

for (const route of ALL_ROUTES) {
  test(`${route.name}: no form row repeats its label`, async ({ page }) => {
    await mockApi(page);
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    // Open every disclosure that reveals more fields.
    for (const toggle of await page.locator('#main-content button[aria-expanded="false"]').all())
      if (await toggle.isVisible()) await toggle.click();
    expect(await repeatedLabels(page)).toEqual([]);
  });
}
