import type { MoiraiGraphTimeSystemIdentity } from "@moirai/contracts";

import {
  readCanon,
  readGraphScope,
  readPublishedWorlds,
  readRelationalTime,
  readSubject,
  selectPublication
} from "./publication";
import {
  publicTimeSystemIdentity,
  type GraphPublicationCanonSnapshot,
  type GraphPublicationFailure
} from "./graph-publication-composer";
import type {
  GraphSourceCatalog,
  GraphSourceWorldOption
} from "./moirai-graph-source-query";

const MAX_WORLDS = 8;
const MAX_CANONS = 32;
const SOURCE_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("graph_publication_source_timeout")),
        SOURCE_TIMEOUT_MS
      );
      timer.unref?.();
    })
  ]);
}

function identityKey(identity: MoiraiGraphTimeSystemIdentity): string {
  return [
    identity.time_system_id,
    identity.definition_version,
    identity.adapter_identity,
    identity.comparison_domain
  ].join(":");
}

export async function loadGraphPublicationSources(): Promise<{
  readonly catalog: GraphSourceCatalog;
  readonly snapshots: readonly GraphPublicationCanonSnapshot[];
  readonly failures: readonly GraphPublicationFailure[];
}> {
  const observations = await withTimeout(readPublishedWorlds());
  const failures: GraphPublicationFailure[] = observations
    .filter((item) => item.availability === "unavailable")
    .map((item) => ({ worldId: item.worldId, code: "source_unavailable" }));
  const ready = observations
    .filter((item) => item.availability === "ready")
    .slice(0, MAX_WORLDS);
  if (
    observations.filter((item) => item.availability === "ready").length >
    MAX_WORLDS
  )
    failures.push({
      worldId: "bounded-world-list",
      code: "source_budget_exceeded"
    });

  const snapshots: GraphPublicationCanonSnapshot[] = [];
  let canonBudget = MAX_CANONS;
  for (const observation of ready) {
    let selected;
    try {
      selected = await withTimeout(selectPublication(observation.worldId));
    } catch (error) {
      failures.push({
        worldId: observation.worldId,
        servedRevision: observation.pointer.served_revision,
        code:
          error instanceof Error && error.message.includes("timeout")
            ? "source_timeout"
            : "source_unavailable"
      });
      continue;
    }
    const canons = observation.canons.slice(0, Math.max(0, canonBudget));
    canonBudget -= canons.length;
    if (canons.length < observation.canons.length)
      failures.push({
        worldId: observation.worldId,
        servedRevision: observation.pointer.served_revision,
        code: "source_budget_exceeded"
      });
    const results = await Promise.allSettled(
      canons.map(async (canon): Promise<GraphPublicationCanonSnapshot> => {
        const document = await withTimeout(
          readCanon(observation.worldId, canon.id, selected)
        );
        const [temporal, graphScope, subjects] = await Promise.all([
          withTimeout(
            readRelationalTime(
              observation.worldId,
              canon.id,
              document.temporalArtifact,
              selected
            )
          ),
          document.graphScopeArtifact
            ? withTimeout(
                readGraphScope(
                  observation.worldId,
                  canon.id,
                  document.graphScopeArtifact,
                  selected
                )
              )
            : Promise.resolve(null),
          Promise.all(
            document.subjectArtifacts.map((subject) =>
              withTimeout(
                readSubject(
                  observation.worldId,
                  canon.id,
                  subject.subject_handle_id,
                  selected
                )
              ).then((value) => value.document)
            )
          )
        ]);
        return {
          worldId: observation.worldId,
          servedRevision: observation.pointer.served_revision,
          canon: document.canon,
          events: document.events,
          narratives: document.narratives,
          timeSystems: document.timeSystems,
          temporal,
          graphScope,
          subjects,
          manifest: selected.manifest
        };
      })
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") snapshots.push(result.value);
      else
        failures.push({
          worldId: observation.worldId,
          servedRevision: observation.pointer.served_revision,
          ...(canons[index]?.id ? { canonId: canons[index]!.id } : {}),
          code:
            result.reason instanceof Error &&
            result.reason.message.includes("timeout")
              ? "source_timeout"
              : "source_unavailable"
        });
    });
  }

  const worlds: GraphSourceWorldOption[] = ready.flatMap((observation) => {
    const worldSnapshots = snapshots.filter(
      (snapshot) => snapshot.worldId === observation.worldId
    );
    const systems = new Map<string, MoiraiGraphTimeSystemIdentity>();
    for (const snapshot of worldSnapshots)
      for (const system of snapshot.timeSystems) {
        const identity = publicTimeSystemIdentity(system);
        systems.set(identityKey(identity), identity);
      }
    const timeSystems = [...systems.values()].toSorted((left, right) =>
      identityKey(left).localeCompare(identityKey(right))
    );
    if (timeSystems.length === 0) return [];
    return [
      {
        id: observation.worldId,
        label: { ko: observation.world.title, en: observation.world.title },
        description: {
          ko: observation.world.description ?? "",
          en: observation.world.description ?? ""
        },
        servedRevision: observation.pointer.served_revision,
        timeSystem: timeSystems[0]!,
        timeSystems,
        canons: worldSnapshots.map((snapshot) => ({
          id: snapshot.canon.id,
          label: { ko: snapshot.canon.title, en: snapshot.canon.title }
        }))
      }
    ];
  });
  const frameMap = new Map<string, MoiraiGraphTimeSystemIdentity>();
  for (const world of worlds)
    for (const identity of world.timeSystems)
      frameMap.set(identityKey(identity), identity);
  const frames = [...frameMap.values()].map((target) => ({
    id: identityKey(target),
    label: { ko: target.time_system_id, en: target.time_system_id },
    description: {
      ko: `${target.adapter_identity} · ${target.comparison_domain}`,
      en: `${target.adapter_identity} · ${target.comparison_domain}`
    },
    target
  }));
  return { catalog: { frames, worlds }, snapshots, failures };
}
