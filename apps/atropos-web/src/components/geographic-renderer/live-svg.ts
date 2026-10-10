import {
  geographicMeshFrame,
  geographicPaintTransform
} from "../geographic-mesh-reuse";
import type { GeographicSize, GeographicView } from "./contract";

/** Geometry follows the affine camera. Native glyphs and point radii keep CSS
 * pixel metrics: their local shape stays committed, their anchor moves live.
 * Bounds are read only at scene publication, never in the camera RAF. */
export function prepareLiveSvg(
  group: SVGGElement,
  view: GeographicView,
  size: GeographicSize
) {
  const frame = geographicMeshFrame(view, size)!;
  const fixed = [
    ...group.querySelectorAll<SVGGraphicsElement>("text, circle")
  ].map((node) => {
    const box = node.getBBox();
    // Anchor in the node's own parent coordinate frame; preserve nested retained
    // paint transforms when counter-scaling the glyph/point.
    const local = node.transform.baseVal.consolidate()?.matrix;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    return {
      node,
      transform: node.getAttribute("transform") ?? "",
      x: local ? local.a * x + local.c * y + local.e : x,
      y: local ? local.b * x + local.d * y + local.f : y
    };
  });
  const strokes = [
    ...group.querySelectorAll<SVGGraphicsElement>("path, line, text, circle")
  ];
  for (const node of strokes)
    node.setAttribute("vector-effect", "non-scaling-stroke");
  return {
    apply(live: GeographicView) {
      const affine = geographicPaintTransform(frame, live, size)!;
      const [sx, sy, tx, ty] = affine;
      group.setAttribute("transform", `matrix(${sx} 0 0 ${sy} ${tx} ${ty})`);
      for (const item of fixed) {
        // The inverse belongs before the original transform so rotation is
        // preserved, including relation labels and native textPath contours.
        // Parent transforms in this overlay are translations/scales. Infer the
        // scene-local anchor from the original local transform without a live
        // DOM layout read. The camera group's transform is excluded here.
        const { x, y } = item;
        item.node.setAttribute(
          "transform",
          `translate(${x} ${y}) scale(${1 / sx} ${1 / sy}) translate(${-x} ${-y}) ${item.transform}`
        );
      }
    },
    restore() {
      group.removeAttribute("transform");
      for (const item of fixed) {
        if (item.transform) item.node.setAttribute("transform", item.transform);
        else item.node.removeAttribute("transform");
      }
    }
  };
}
