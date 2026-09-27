import type { GraphShellChartPlaneEntity } from "../shared/contracts";

/** List coverage and hull support are different contracts. Unknown support is partial. */
export function viewportCompleteness(
  entities: readonly GraphShellChartPlaneEntity[],
  shapesTruncated: boolean,
  edgesTruncated: boolean
) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const completeSupport = (id: string): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const entity = byId.get(id);
    if (!entity || visiting.has(id)) return false;
    if (entity.geometryKind === "point") return true;
    if (entity.geometryKind !== "region" || entity.childrenComplete !== true)
      return false;
    visiting.add(id);
    const complete = entity.contains.every(completeSupport);
    visiting.delete(id);
    memo.set(id, complete);
    return complete;
  };
  return {
    entities: !shapesTruncated,
    regions: !shapesTruncated,
    edges: !shapesTruncated && !edgesTruncated,
    regionSupport: entities
      .filter((entity) => entity.geometryKind === "region")
      .every((region) => completeSupport(region.id))
  };
}
