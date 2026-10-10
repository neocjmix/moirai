import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
import { hashUnit } from "./engine.js";
/** Prepared, deterministic scale fixture: 20 contexts, ~10% Composite,
 * uneven temporal clusters, sparse shared membership and sparse authored edges.
 * Deliberately excludes canonical-to-temporal projection from timed sections. */
export function scaleFixture(n: number, template: LabSnapshot): LabSnapshot {
  const count = Math.floor(n * 0.9),
    episodes = Math.floor(n * 0.09),
    roots = n - count - episodes;
  const events: LabSnapshot["events"][number][] = [];
  const relations: LabSnapshot["relations"][number][] = [];
  const extents: LabSnapshot["input"]["explicitExtents"][number][] = [];
  for (let i = 0; i < count; i++) {
    const c = i % 20,
      id = "scale-point-" + i,
      cs = ["scale-context-" + c];
    if (i % 53 === 0) cs.push("scale-context-" + ((c + 1) % 20));
    events.push({ id, title: id, childIds: [], collectionIds: cs });
    const year = [1400, 1470, 1592, 1660, 1790][i % 5]! + hashUnit(id) * 35;
    extents.push({ eventId: id, minYear: year, maxYear: year });
    if (i > 20 && i % 5 === 0)
      relations.push({
        id: "cause:" + i,
        sourceId: "scale-point-" + (i - 20),
        targetId: id,
        type: "causes"
      });
  }
  const groups = Array.from({ length: episodes }, () => [] as string[]);
  for (let i = 0; i < count; i++)
    groups[i % episodes]!.push("scale-point-" + i);
  for (let i = 0; i < episodes; i++) {
    const id = "scale-episode-" + i;
    events.push({
      id,
      title: id,
      childIds: groups[i]!,
      collectionIds: ["scale-context-" + (i % 20)]
    });
    for (const child of groups[i]!)
      relations.push({
        id: `contains:${id}:${child}`,
        sourceId: id,
        targetId: child,
        type: "contains"
      });
  }
  const rg = Array.from({ length: roots }, () => [] as string[]);
  for (let i = 0; i < episodes; i++) rg[i % roots]!.push("scale-episode-" + i);
  for (let i = 0; i < roots; i++) {
    const id = "scale-root-" + i;
    events.push({
      id,
      title: id,
      childIds: rg[i]!,
      collectionIds: ["scale-context-" + (i % 20)]
    });
    for (const child of rg[i]!)
      relations.push({
        id: `contains:${id}:${child}`,
        sourceId: id,
        targetId: child,
        type: "contains"
      });
  }
  const collections = Array.from({ length: 20 }, (_, c) => ({
    id: "scale-context-" + c,
    title: "Scale context " + c,
    eventIds: events
      .filter((e) => e.collectionIds.includes("scale-context-" + c))
      .map((e) => e.id)
  }));
  return {
    ...template,
    worldTitle: `Prepared scale fixture · ${n}`,
    events,
    collections,
    relations,
    input: {
      ...template.input,
      dataset: {
        ...template.input.dataset,
        events: events.map((e) => ({
          id: e.id,
          canonId: template.worldId,
          title: e.title,
          type: e.childIds.length ? "composite" : "instant"
        })),
        semanticLinks: relations.map((r) => ({
          id: r.id,
          type: r.type as "contains" | "causes",
          fromId: r.sourceId,
          toId: r.targetId
        }))
      },
      explicitExtents: extents,
      temporalConstraints: [],
      visibleEventIds: events.map((e) => e.id)
    }
  };
}
