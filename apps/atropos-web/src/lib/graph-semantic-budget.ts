export function semanticTextWidth(text: string) {
  return [...text].reduce(
    (sum, char) => sum + (char.charCodeAt(0) > 127 ? 13 : 7.5),
    0
  );
}

/** Keep a readable, bounded label beside the existing point on narrow screens. */
export function fitSemanticText(
  text: string,
  x: number,
  viewportWidth: number
) {
  const available = viewportWidth - x - 8;
  if (available < 44) return "";
  if (semanticTextWidth(text) <= available) return text;
  const characters = [...text];
  while (
    characters.length &&
    semanticTextWidth(characters.join("") + "…") > available
  )
    characters.pop();
  return characters.length ? characters.join("") + "…" : "";
}

export interface SemanticCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
}

/** A5 experiment: one viewport-wide text budget, independent of paint count.
 * Existing label/suppression eligibility must be applied before this policy. */
export function selectSemanticLabels(
  candidates: readonly SemanticCandidate[],
  viewport: { width: number; height: number },
  previous: ReadonlySet<string>
) {
  const budget = Math.max(
    8,
    Math.min(32, Math.floor((viewport.width * viewport.height) / 28000))
  );
  const inside = candidates.filter(
    (c) =>
      c.x >= 0 &&
      c.y >= 72 &&
      c.x + c.width <= viewport.width &&
      c.y + c.height <= viewport.height - 56
  );
  const distance = (c: SemanticCandidate) =>
    Math.hypot(
      (c.x + c.width / 2 - viewport.width / 2) / Math.max(1, viewport.width),
      (c.y + c.height / 2 - viewport.height / 2) / Math.max(1, viewport.height)
    );
  inside.sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) ||
      Number(previous.has(b.id)) - Number(previous.has(a.id)) ||
      distance(a) - distance(b) ||
      a.id.localeCompare(b.id)
  );
  const accepted: SemanticCandidate[] = [];
  for (const candidate of inside) {
    if (accepted.length >= budget) break;
    if (
      accepted.some(
        (other) =>
          candidate.x < other.x + other.width + 8 &&
          candidate.x + candidate.width + 8 > other.x &&
          candidate.y < other.y + other.height + 8 &&
          candidate.y + candidate.height + 8 > other.y
      )
    )
      continue;
    accepted.push(candidate);
  }
  return { budget, ids: new Set(accepted.map((c) => c.id)) };
}
