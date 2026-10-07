/** Renderer-local interpolation only. Publication owns stable priority/ranking. */
export type PointRenderDensity = {
  pointScale: number;
  opacity: number;
  labelOpacity: number;
};

const unit = (value: number | undefined, fallback: number) =>
  value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(0, Math.min(1, value));

/** Authored hulls retain their existing paint and child suppression behavior. */
export function pointDensityDisplay(
  density?: PointRenderDensity,
  isPoint = true
) {
  const scale = isPoint ? unit(density?.pointScale, 1) : 1;
  const opacity = isPoint ? unit(density?.opacity, 1) : 1;
  const labelOpacity = isPoint ? unit(density?.labelOpacity, 1) * opacity : 1;
  return {
    radius: 6 * scale,
    // A small point is a simple dot, without the normal point's thick outline.
    strokeWidth: 1.8 * scale,
    opacity,
    labelOpacity,
    showLabel: labelOpacity > 0,
    interactive: opacity > 0 && labelOpacity >= 0.99,
    state: opacity === 0 || scale === 0 ? "hidden" : scale < 0.999 ? "small-point" : "point",
  } as const;
}

/** As a parent collapses, its children pass through small points before their
 * paint fades out. Labels leave first, so a nested title never outlives its
 * corresponding point. The parent supplies the shared visibility progress. */
export function withParentPointHandoff(
  display: ReturnType<typeof pointDensityDisplay>,
  parentOpacity: number,
): ReturnType<typeof pointDensityDisplay> {
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const ordinary = smooth((parentOpacity - 0.2) / 0.6);
  const labelOpacity = display.labelOpacity * smooth((parentOpacity - 0.4) / 0.5);
  const radius = display.radius * (0.35 + 0.65 * ordinary);
  return {
    ...display,
    radius,
    strokeWidth: display.strokeWidth * ordinary,
    labelOpacity,
    showLabel: labelOpacity > 0,
    interactive: display.interactive && labelOpacity >= 0.99,
    state: parentOpacity === 0 || display.state === "hidden" ? "hidden" : radius < 5.99 ? "small-point" : "point",
  };
}
