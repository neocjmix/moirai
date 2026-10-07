type XY = { x: number; y: number };

// GraphShell publishes one closed absolute M/L/C/Z spline. Fail closed for
// another grammar instead of silently drawing a different authored shape.
export function flattenGeographicPath(path: string): XY[] {
  if (path.length > 1_000_000) throw Error("geographic_path_budget");
  const tokens =
    path.match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
  if (path.replace(/[MLCZ\s,]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi, ""))
    throw Error("unsupported_geographic_path");
  let at = 0;
  let closed = false;
  const read = () => {
    const value = Number(tokens[at++]);
    if (!Number.isFinite(value)) throw Error("invalid_geographic_path");
    return value;
  };
  const result: XY[] = [];
  const push = (p: XY) => {
    const old = result.at(-1);
    if (!old || Math.hypot(p.x - old.x, p.y - old.y) > 0.001) result.push(p);
    if (result.length > 2048) throw Error("geographic_vertex_budget");
  };
  const flat = (a: XY, b: XY, c: XY, d: XY, depth: number) => {
    const dx = d.x - a.x,
      dy = d.y - a.y;
    const len = Math.hypot(dx, dy);
    const distance = (p: XY) =>
      len > 0.001
        ? Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len
        : Math.hypot(p.x - a.x, p.y - a.y);
    if (depth >= 10 || Math.max(distance(b), distance(c)) <= 0.35) {
      push(d);
      return;
    }
    const mid = (p: XY, q: XY) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d);
    const abc = mid(ab, bc),
      bcd = mid(bc, cd),
      center = mid(abc, bcd);
    flat(a, ab, abc, center, depth + 1);
    flat(center, bcd, cd, d, depth + 1);
  };
  while (at < tokens.length) {
    const command = tokens[at++];
    if (command === "M" && result.length)
      throw Error("unsupported_geographic_subpath");
    if (command === "M" || command === "L") push({ x: read(), y: read() });
    else if (command === "C" && result.length) {
      const a = result.at(-1)!;
      flat(
        a,
        { x: read(), y: read() },
        { x: read(), y: read() },
        { x: read(), y: read() },
        0
      );
    } else if (command === "Z" && at === tokens.length) closed = true;
    else throw Error("unsupported_geographic_path");
  }
  if (!closed) throw Error("unclosed_geographic_path");
  if (
    result.length > 1 &&
    Math.hypot(
      result[0]!.x - result.at(-1)!.x,
      result[0]!.y - result.at(-1)!.y
    ) < 0.001
  )
    result.pop();
  return result;
}

const cross = (a: XY, b: XY, c: XY) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function geographicMesh(
  path: string,
  options: { stroke?: boolean } = {}
) {
  const points = flattenGeographicPath(path);
  const indices = points.map((_, i) => i);
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  if (area < 0) indices.reverse();
  const fill: number[] = [];
  const emit = (p: XY, q = p, side = 0) => [p.x, p.y, q.x, q.y, side];
  // Ear clipping supports concave padded hulls; a fan would fill outside them.
  while (indices.length > 2) {
    let found = false;
    for (let i = 0; i < indices.length; i++) {
      const a = points[indices[(i + indices.length - 1) % indices.length]!]!;
      const b = points[indices[i]!]!;
      const c = points[indices[(i + 1) % indices.length]!]!;
      if (cross(a, b, c) <= 0.000001) continue;
      if (
        indices.some((index) => {
          const p = points[index]!;
          return (
            p !== a &&
            p !== b &&
            p !== c &&
            cross(a, b, p) >= -0.000001 &&
            cross(b, c, p) >= -0.000001 &&
            cross(c, a, p) >= -0.000001
          );
        })
      )
        continue;
      fill.push(...emit(a), ...emit(b), ...emit(c));
      indices.splice(i, 1);
      found = true;
      break;
    }
    if (!found) {
      // Collinear / collapsed paths have no fill. Never invent a fallback fan.
      const flat = indices.findIndex(
        (index, i) =>
          Math.abs(
            cross(
              points[indices[(i + indices.length - 1) % indices.length]!]!,
              points[index]!,
              points[indices[(i + 1) % indices.length]!]!
            )
          ) <= 0.000001
      );
      if (flat >= 0) indices.splice(flat, 1);
      else throw Error("non_simple_geographic_path");
    }
  }
  // Feather insets only contribute fill. Skip allocating six extrusion
  // vertices per edge when the caller will never upload or draw the stroke.
  if (options.stroke === false)
    return { fill: new Float32Array(fill), stroke: new Float32Array() };
  const stroke: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    stroke.push(
      ...emit(a, b, -1),
      ...emit(a, b, 1),
      ...emit(b, a, -1),
      ...emit(a, b, -1),
      ...emit(b, a, -1),
      ...emit(b, a, 1)
    );
  }
  return { fill: new Float32Array(fill), stroke: new Float32Array(stroke) };
}
