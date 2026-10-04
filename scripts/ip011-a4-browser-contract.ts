import type { Page } from "@playwright/test";

/** Readiness means an authored Event can actually be opened at this scale.
 * Its current representation may be a point, a compact Composite or a label.
 * Background geometry and outgoing paint must never satisfy this gate.
 */
export async function waitForGraphReadTarget(page: Page) {
  const handle = await page.waitForFunction(
    () => {
      for (const element of document.querySelectorAll(
        "[data-primary-hit-target]"
      )) {
        if (element.closest('[aria-hidden="true"]')) continue;
        const id =
          element.getAttribute("data-event-point-id") ??
          element.getAttribute("data-region-id") ??
          element
            .closest("[data-composite-point-id]")
            ?.getAttribute("data-composite-point-id");
        const kind = element.getAttribute("data-primary-hit-target");
        if (!id || !kind) continue;
        const box = element.getBoundingClientRect();
        const left = Math.max(1, box.left),
          right = Math.min(innerWidth - 1, box.right);
        const top = Math.max(1, box.top),
          bottom = Math.min(innerHeight - 1, box.bottom);
        if (left >= right || top >= bottom) continue;
        for (const x of [left + (right - left) / 2, left + 1, right - 1]) {
          for (const y of [top + (bottom - top) / 2, top + 1, bottom - 1]) {
            if (
              document
                .elementFromPoint(x, y)
                ?.closest("[data-primary-hit-target]") === element
            )
              return { id, kind, x, y };
          }
        }
      }
      return null;
    },
    undefined,
    { timeout: 20_000 }
  );
  try {
    const target = await handle.jsonValue();
    if (!target) throw Error("a4_mobile_no_hit_testable_event");
    return target;
  } finally {
    await handle.dispose();
  }
}

/** Spatial continuations authenticate the entire bbox; every new query starts
 * at its own first page, even when its template was captured on a later page.
 */
export function restartViewportQuery(
  template: Record<string, unknown>,
  bbox: { minX: number; maxX: number; minY: number; maxY: number }
) {
  return {
    ...template,
    cursor: null,
    viewport: { ...(template.viewport as object), bbox }
  };
}
