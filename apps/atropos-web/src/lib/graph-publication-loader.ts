import type { MoiraiGraphTimeSystemIdentity } from "@moirai/contracts";
import {
  structuralFrame,
  publicTimeSystemIdentity,
  type GraphPublicationCanonSnapshot,
  type GraphPublicationFailure
} from "@moirai/graph-query";
import { z } from "zod";
import { readPublishedWorlds } from "./publication";
import { readGraphRevision } from "./graph-revision-source";
import type {
  GraphSourceCatalog,
  GraphSourceWorldOption
} from "./moirai-graph-source-query";
const pinSchema = z
  .array(
    z.object({
      world_id: z.string().uuid(),
      served_revision: z.number().int().positive().safe(),
      canon_ids: z.array(z.string().uuid()).max(32).optional(),
      time_systems: z
        .array(
          z.object({
            time_system_id: z.string().max(256),
            definition_version: z.string().max(256),
            adapter_identity: z.string().max(256),
            comparison_domain: z.string().max(256)
          })
        )
        .max(32)
        .optional()
    })
  )
  .max(8);
export type GraphRevisionPin = z.infer<typeof pinSchema>[number];
/** Read just a bounded revision vector first; the complete URL is validated against its catalog. */
export function graphRevisionPins(raw: string | null): GraphRevisionPin[] {
  if (!raw || raw.length > 64 * 1024) return [];
  try {
    const parsed = pinSchema.safeParse(JSON.parse(raw).query?.sources);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
const identityKey = (i: MoiraiGraphTimeSystemIdentity) =>
  [
    i.time_system_id,
    i.definition_version,
    i.adapter_identity,
    i.comparison_domain
  ].join(":");
export async function loadGraphPublicationSources(
  pins: readonly GraphRevisionPin[] = [],
  options: { onlyPinned?: boolean } = {}
): Promise<{
  catalog: GraphSourceCatalog;
  snapshots: readonly GraphPublicationCanonSnapshot[];
  failures: readonly GraphPublicationFailure[];
}> {
  const observations = options.onlyPinned ? [] : await readPublishedWorlds();
  const candidates = new Map(
    observations.flatMap((o) =>
      o.availability === "ready"
        ? [[o.worldId, o.pointer.served_revision] as const]
        : []
    )
  );
  for (const pin of pins) candidates.set(pin.world_id, pin.served_revision);
  const failures: GraphPublicationFailure[] = observations
    .filter(
      (o) =>
        o.availability === "unavailable" &&
        !pins.some((p) => p.world_id === o.worldId)
    )
    .map((o) => ({ worldId: o.worldId, code: "source_unavailable" }));
  const requested = [...candidates]
    .sort(
      ([a], [b]) =>
        Number(pins.some((p) => p.world_id === b)) -
          Number(pins.some((p) => p.world_id === a)) || a.localeCompare(b)
    )
    .slice(0, 8);
  if (candidates.size > 8)
    failures.push({
      worldId: "bounded-world-list",
      code: "source_budget_exceeded"
    });
  const results = await Promise.allSettled(
    requested.map(([world, revision]) => readGraphRevision(world, revision))
  );
  const snapshots: GraphPublicationCanonSnapshot[] = [];
  const worlds: GraphSourceWorldOption[] = [];
  let remaining = 32;
  results.forEach((value, index) => {
    const [worldId, revision] = requested[index]!;
    if (value.status === "rejected") {
      failures.push({
        worldId,
        servedRevision: revision,
        code: "source_unavailable"
      });
      const pin = pins.find(
        (p) => p.world_id === worldId && p.served_revision === revision
      );
      // Retain the requested selector during partial failure; this creates no data or coordinates.
      if (pin?.canon_ids?.length && pin.time_systems?.length) {
        worlds.push({
          id: worldId,
          label: { ko: worldId, en: worldId },
          description: {
            ko: "선택한 Revision을 읽을 수 없습니다",
            en: "Selected revision unavailable"
          },
          servedRevision: revision,
          timeSystem: pin.time_systems[0]!,
          timeSystems: pin.time_systems,
          canons: pin.canon_ids.map((id) => ({ id, label: { ko: id, en: id } }))
        });
      }
      return;
    }
    const data = value.value;
    const selected = data.snapshots.slice(0, remaining);
    remaining -= selected.length;
    if (selected.length < data.snapshots.length)
      failures.push({
        worldId,
        servedRevision: revision,
        code: "source_budget_exceeded"
      });
    if (!selected.length) return;
    snapshots.push(...selected);
    const systems = new Map<string, MoiraiGraphTimeSystemIdentity>();
    for (const s of selected)
      for (const t of s.timeSystems) {
        const identity = publicTimeSystemIdentity(t);
        systems.set(identityKey(identity), identity);
      }
    // This selector labels relative layout; it is never appended to persisted Time Systems.
    const timeSystems = systems.size
      ? [...systems.values()].sort((a, b) =>
          identityKey(a).localeCompare(identityKey(b))
        )
      : [structuralFrame(worldId)];
    worlds.push({
      id: worldId,
      label: { ko: data.world.title, en: data.world.title },
      description: {
        ko: data.world.description ?? "",
        en: data.world.description ?? ""
      },
      servedRevision: revision,
      timeSystem: timeSystems[0]!,
      timeSystems,
      canons: selected.map((s) => ({
        id: s.canon.id,
        label: { ko: s.canon.title, en: s.canon.title }
      }))
    });
  });
  const identities = new Map(
    worlds.flatMap((w) =>
      w.timeSystems.map((i) => [identityKey(i), i] as const)
    )
  );
  const frames = [...identities].map(([id, target]) => ({
    id,
    target,
    label: {
      ko:
        target.adapter_identity === "structural-order-display/1"
          ? "관계 기반 순서"
          : target.time_system_id,
      en:
        target.adapter_identity === "structural-order-display/1"
          ? "Relative order"
          : target.time_system_id
    },
    description: { ko: target.comparison_domain, en: target.comparison_domain }
  }));
  return { catalog: { worlds, frames }, snapshots, failures };
}
