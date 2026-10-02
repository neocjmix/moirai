import type { GraphShellChartPlaneEntity } from "../../shared/contracts";

/** Parsed viewport responses are fresh objects, including fresh hull vertices.
 * Compare only the bounded current working set once per response, preserving
 * all source metadata while allowing independent screen-density updates.
 */
function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((item, index) => equalValue(item, b[index]));
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) && equalValue(left[key], right[key]));
}
function sameSource(a: GraphShellChartPlaneEntity, b: GraphShellChartPlaneEntity) {
  if (a === b) return true;
  const keys = Object.keys(a).filter(key => key !== "renderDensity");
  return keys.length === Object.keys(b).filter(key => key !== "renderDensity").length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equalValue(
      a[key as keyof GraphShellChartPlaneEntity], b[key as keyof GraphShellChartPlaneEntity],
    ));
}

/** Caller keeps only this result, so omitted identities cannot accumulate.
 * Entity order is irrelevant to prepared World geometry; canonicalize by ID to
 * prevent density ranking or tile arrival order from invalidating geometry.
 * renderDensity must continue to be read from the live response, not this view.
 */
export function shareWorldGeometryEntities(
  previous: readonly GraphShellChartPlaneEntity[],
  incoming: readonly GraphShellChartPlaneEntity[],
): readonly GraphShellChartPlaneEntity[] {
  const old = new Map(previous.map(entity => [entity.id, entity]));
  const next = incoming.filter(entity => entity.geometryKind !== "segment")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(entity => {
      const cached = old.get(entity.id);
      return cached && sameSource(cached, entity) ? cached : entity;
    });
  return next.length === previous.length && next.every((entity, index) => entity === previous[index]) ? previous : next;
}
