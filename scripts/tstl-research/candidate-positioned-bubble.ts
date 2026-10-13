/** Regenerate unchanged Bubble geometry after an offline X solver. */
import type { BaselineArtifact } from "./baseline.js";
import type { TstlComparisonArtifact } from "./candidate.js";
import { baselineCandidateCoordinates } from "./smooth-regions.js";
import { buildBubbleCandidate } from "./candidate-bubble.js";
export function buildPositionedBubbleCandidate(
  baseline: BaselineArtifact,
  comparison: TstlComparisonArtifact,
  positions: Record<string, number>
) {
  const coords = baselineCandidateCoordinates(baseline);
  // Bubble reads anchors, never the old polygon. Rebuild every contour with
  // exactly the unchanged Bubble algorithm and parameters after moving X.
  const relocated = {
    ...baseline,
    primitives: baseline.primitives.map((p) => {
      const id = p.entity.id;
      if (positions[id] === undefined || p.entity.kind === "relation") return p;
      const x = positions[id]!;
      return {
        ...p,
        ...(p.geometry.kind === "point"
          ? { geometry: { ...p.geometry, xy: { ...p.geometry.xy, x } } }
          : {}),
        ...(p.composite
          ? {
              composite: {
                ...p.composite,
                anchor: { x, y: coords.positionsByEventId[id]!.y },
                worldBounds: {
                  ...p.composite.worldBounds,
                  minX: Math.min(
                    x,
                    ...comparison.projection.descendants[id]!.map(
                      (id) => positions[id]!
                    )
                  ),
                  maxX: Math.max(
                    x,
                    ...comparison.projection.descendants[id]!.map(
                      (id) => positions[id]!
                    )
                  )
                }
              }
            }
          : {})
      };
    })
  };
  const generated = buildBubbleCandidate(relocated, comparison);
  return {
    ...generated,
    algorithmVersion: "bubble-capsule-union-on-supplied-x/1",
    limitations: [
      "Original Bubble capsule-union algorithm and parameters, regenerated on supplied X rather than compiled B0 X.",
      ...generated.limitations!.slice(1)
    ]
  };
}
