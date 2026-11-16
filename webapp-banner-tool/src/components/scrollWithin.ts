/** The nearest ancestor that scrolls vertically itself (not the page). */
function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return null;
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}

/**
 * Scrolls `element` into the middle of its own scroll area – the preview's
 * tree or the layer panel – without moving the page (T-142-F4, F-142-32).
 * With Reduce Motion the scroll is instant.
 */
export function scrollWithin(element: HTMLElement | null | undefined) {
  if (!element) return;
  const container = scrollParent(element);
  if (!container) return;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const box = element.getBoundingClientRect();
  const area = container.getBoundingClientRect();
  const top = container.scrollTop + box.top - area.top - (area.height - box.height) / 2;
  if (typeof container.scrollTo === "function")
    container.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  else container.scrollTop = Math.max(0, top);
}
