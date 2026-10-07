export function semanticTextWidth(text: string) {
  return [...text].reduce(
    (sum, char) => sum + (char.charCodeAt(0) > 127 ? 13 : 7.5),
    0
  );
}

export interface SemanticCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
}

/** Labels keep their text and position; the SVG viewport clips only the paint. */
export function semanticBoundsIntersectViewport(
  bounds: Pick<SemanticCandidate, "x" | "y" | "width" | "height">,
  viewport: { width: number; height: number }
) {
  return (
    bounds.x < viewport.width &&
    bounds.x + bounds.width > 0 &&
    bounds.y < viewport.height &&
    bounds.y + bounds.height > 0
  );
}

/** A5 experiment: one viewport-wide text budget, independent of paint count.
 * Existing label/suppression eligibility must be applied before this policy. */
export function selectSemanticLabels(
  candidates: readonly SemanticCandidate[],
  viewport: { width: number; height: number },
  previous: ReadonlySet<string>
) {
  const budget = Math.max(
    10,
    Math.min(40, Math.floor((viewport.width * viewport.height) / 18000))
  );
  // Offscreen glyphs neither remove the visible part of a label nor block
  // another label through collisions outside the screen.
  const inside = candidates
    .filter((c) => semanticBoundsIntersectViewport(c, viewport))
    .map((c) => ({
      ...c,
      x: Math.max(0, c.x),
      y: Math.max(0, c.y),
      width: Math.min(viewport.width, c.x + c.width) - Math.max(0, c.x),
      height: Math.min(viewport.height, c.y + c.height) - Math.max(0, c.y)
    }));
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
          candidate.x < other.x + other.width + 2 &&
          candidate.x + candidate.width + 2 > other.x &&
          candidate.y < other.y + other.height + 2 &&
          candidate.y + candidate.height + 2 > other.y
      )
    )
      continue;
    accepted.push(candidate);
  }
  return { budget, ids: new Set(accepted.map((c) => c.id)) };
}
