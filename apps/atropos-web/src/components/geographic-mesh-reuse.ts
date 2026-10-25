type View = { x: number; y: number; scaleX: number; scaleY: number };
type Viewport = { width: number; height: number };
export type GeographicMeshFrame = Readonly<{
  view: Readonly<View>;
  viewport: Readonly<Viewport>;
  translation: readonly [number, number];
}>;
export type GeographicPathControls = Readonly<{
  topology: string;
  coordinates: Float64Array;
}>;
export type GeographicPaintTransform = readonly [
  number,
  number,
  number,
  number
];

/** Exact absolute M/L/C/Z controls, not adaptive flattened vertices. Matching
 * every Bézier control bounds the entire curve through its convex weights. */
export function geographicPathControls(
  path: string
): GeographicPathControls | null {
  if (!path || path.length > 1_000_000) return null;
  const number = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;
  if (path.replace(number, "").replace(/[MLCZ\s,]/g, "")) return null;
  const tokens =
    path.match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
  const coordinates: number[] = [];
  let topology = "";
  let at = 0;
  while (at < tokens.length) {
    const command = tokens[at++];
    if (command === "Z") {
      if (!topology || at !== tokens.length) return null;
      return {
        topology: topology + "Z",
        coordinates: new Float64Array(coordinates)
      };
    }
    if ((!topology && command !== "M") || (topology && command === "M"))
      return null;
    const count =
      command === "M" || command === "L" ? 2 : command === "C" ? 6 : 0;
    if (
      !count ||
      at + count > tokens.length ||
      coordinates.length + count > 16_384
    )
      return null;
    topology += command;
    for (let index = 0; index < count; index++) {
      const value = Number(tokens[at++]);
      if (!Number.isFinite(value)) return null;
      coordinates.push(value);
    }
  }
  return null;
}

export function geographicMeshFrame(
  view: View,
  viewport: Viewport,
  pathTransform?: string
): GeographicMeshFrame | null {
  let translation: [number, number] = [0, 0];
  if (pathTransform) {
    const match = /^translate\(([-+\d.e]+)[ ,]+([-+\d.e]+)\)$/.exec(
      pathTransform
    );
    if (!match) return null;
    translation = [Number(match[1]), Number(match[2])];
  }
  if (
    ![
      view.x,
      view.y,
      view.scaleX,
      view.scaleY,
      viewport.width,
      viewport.height,
      ...translation
    ].every(Number.isFinite) ||
    view.scaleX <= 0 ||
    view.scaleY <= 0 ||
    viewport.width < 0 ||
    viewport.height < 0
  )
    return null;
  // Copies anchor this mesh even if a caller reuses mutable camera objects.
  return { view: { ...view }, viewport: { ...viewport }, translation };
}

export function geographicPaintTransform(
  frame: GeographicMeshFrame,
  view: View,
  viewport: Viewport
): GeographicPaintTransform | null {
  const sx = view.scaleX / frame.view.scaleX;
  const sy = view.scaleY / frame.view.scaleY;
  const result = [
    sx,
    sy,
    viewport.width / 2 +
      view.x -
      sx * (frame.viewport.width / 2 + frame.view.x - frame.translation[0]),
    viewport.height / 2 +
      view.y -
      sy * (frame.viewport.height / 2 + frame.view.y - frame.translation[1])
  ] as const;
  return result.every(Number.isFinite) && sx > 0 && sy > 0 ? result : null;
}

/** Keep the original anchor on every hit: repeated small zooms cannot accrue
 * unchecked drift. The scale guard also bounds the original 0.35px flattened
 * curve error to 0.42px, in addition to the 0.75px exact-curve displacement. */
export function canReuseGeographicMesh(
  anchor: GeographicPathControls | null,
  current: GeographicPathControls | null,
  anchorTransform: GeographicPaintTransform,
  currentTransform: GeographicPaintTransform
): boolean {
  if (
    !anchor ||
    !current ||
    anchor.topology !== current.topology ||
    anchor.coordinates.length !== current.coordinates.length ||
    !anchorTransform.every(Number.isFinite) ||
    !currentTransform.every(Number.isFinite) ||
    anchorTransform[0] < 0.8 ||
    anchorTransform[0] > 1.2 ||
    anchorTransform[1] < 0.8 ||
    anchorTransform[1] > 1.2 ||
    currentTransform[0] <= 0 ||
    currentTransform[1] <= 0
  )
    return false;
  for (let index = 0; index < anchor.coordinates.length; index += 2) {
    const dx =
      anchor.coordinates[index]! * anchorTransform[0] +
      anchorTransform[2] -
      (current.coordinates[index]! * currentTransform[0] + currentTransform[2]);
    const dy =
      anchor.coordinates[index + 1]! * anchorTransform[1] +
      anchorTransform[3] -
      (current.coordinates[index + 1]! * currentTransform[1] +
        currentTransform[3]);
    const distance = dx * dx + dy * dy;
    if (!Number.isFinite(distance) || distance > 0.75 ** 2) return false;
  }
  return true;
}

export function reusableGeographicPaintTransform(
  anchorPath: string,
  currentPath: string,
  anchor: GeographicPathControls | null,
  current: GeographicPathControls | null,
  anchorTransform: GeographicPaintTransform | null,
  currentTransform: GeographicPaintTransform
): GeographicPaintTransform | null {
  if (
    !currentTransform.every(Number.isFinite) ||
    currentTransform[0] <= 0 ||
    currentTransform[1] <= 0
  )
    return null;
  // Identical coordinates can be drawn exactly under the current frame even
  // after a large pan/resize. Never apply the old frame just because d matches.
  if (anchorPath === currentPath) return currentTransform;
  return anchorTransform &&
    canReuseGeographicMesh(anchor, current, anchorTransform, currentTransform)
    ? anchorTransform
    : null;
}

/** RAF completion and returned paint must agree, so a finished fade does not
 * leave a permanently positive, invisible hull in the pigment pass. */
export function geographicTweenValue(
  from: number,
  target: number,
  ratio: number
) {
  const value =
    from + (target - from) * (1 - (1 - Math.min(1, Math.max(0, ratio))) ** 3);
  return Math.abs(value - target) <= 0.0001 ? target : value;
}
