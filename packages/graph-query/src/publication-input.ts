import {
  normalizePublicEvent,
  normalizePublicRelation
} from "./legacy-publication.js";
import type {
  PublicCanon,
  PublicEvent,
  PublicNarrative,
  PublicTimeSystem,
  PublicRelationalTemporalProjection,
  PublicSubjectHandleDocument,
  PublicationManifest,
  MoiraiGraphQuery
} from "@moirai/contracts";
import { MOIRAI_GRAPH_RELATION_TYPES } from "@moirai/contracts";
import {
  type GraphPublicationCanonSnapshot,
  publicTimeSystemIdentity,
  composeGraphPublicationQuery
} from "./index.js";

/** A display frame selector, never a persisted Time System or coordinate codec. */
export const structuralFrame = (worldId: string) => ({
  time_system_id: `structural-order:${worldId}`,
  definition_version: "1",
  adapter_identity: "structural-order-display/1",
  comparison_domain: `structural-order:${worldId}`
});

export function publicationSnapshots(
  manifestBody: string,
  documents: readonly { key: string; body: string }[]
): GraphPublicationCanonSnapshot[] {
  const manifest = JSON.parse(manifestBody) as PublicationManifest;
  const prefix = `worlds/${manifest.world_id}/revisions/${manifest.served_revision}`;
  const byKey = new Map(documents.map((d) => [d.key, d.body]));
  const read = <T>(key: string): T => {
    const body = byKey.get(key);
    if (!body) throw new Error("spatial_publication_document_missing");
    return JSON.parse(body) as T;
  };
  return documents
    .filter(
      (d) => d.key.startsWith(`${prefix}/canons/`) && d.key.endsWith(".json")
    )
    .map((d) => {
      const doc = JSON.parse(d.body) as {
        world_id: string;
        served_revision: number;
        canon: PublicCanon;
        events: PublicEvent[];
        narratives: PublicNarrative[];
        time_systems: PublicTimeSystem[];
        temporal_artifact: { key: string };
        subject_artifacts: { key: string }[];
      };
      if (
        doc.world_id !== manifest.world_id ||
        doc.served_revision !== manifest.served_revision
      )
        throw new Error("spatial_publication_revision_mismatch");
      return {
        worldId: manifest.world_id,
        servedRevision: manifest.served_revision,
        canon: doc.canon,
        events: doc.events.map((event) =>
          normalizePublicEvent(event, manifest.world_id)
        ),
        narratives: doc.narratives,
        timeSystems: doc.time_systems ?? [],
        temporal: (() => {
          const temporal = read<PublicRelationalTemporalProjection>(
            doc.temporal_artifact.key
          );
          return {
            ...temporal,
            relations: temporal.relations.map((relation) =>
              normalizePublicRelation(relation, manifest.world_id)
            )
          };
        })(),
        graphScope: null,
        subjects: (doc.subject_artifacts ?? []).map((s) =>
          read<PublicSubjectHandleDocument>(s.key)
        ),
        manifest
      };
    });
}

export function fullPublicationQuery(
  snapshots: readonly GraphPublicationCanonSnapshot[]
): MoiraiGraphQuery {
  const first = snapshots[0];
  if (!first) throw new Error("spatial_empty_publication");
  const systems = [
    ...new Map(
      snapshots
        .flatMap((s) => s.timeSystems)
        .map((s) => [s.id, publicTimeSystemIdentity(s)])
    ).values()
  ];
  return {
    contract_version: 1,
    temporal_frame: { target: systems[0] ?? structuralFrame(first.worldId) },
    sources: [
      {
        world_id: first.worldId,
        served_revision: first.servedRevision,
        canon_ids: snapshots.map((s) => s.canon.id),
        time_systems: systems
      }
    ],
    scope: { kind: "overview" },
    entity_filter: {
      event_kinds: ["atomic", "composite"],
      roles: [],
      subject_handle_ids: [],
      include_states: true,
      include_narratives: true,
      include_virtual_time_events: true
    },
    relation_filter: {
      types: MOIRAI_GRAPH_RELATION_TYPES,
      directions: ["directed", "undirected"]
    },
    diagnostics_filter: {
      include_codes: [],
      include_unplaced: true,
      include_unresolved: true
    },
    budget: {
      detail_level: "full",
      max_entities: Number.MAX_SAFE_INTEGER,
      max_relations: Number.MAX_SAFE_INTEGER,
      max_evidence: Number.MAX_SAFE_INTEGER
    }
  };
}
export function queryFromPublicationDocuments(
  manifestBody: string,
  documents: readonly { key: string; body: string }[]
) {
  const snapshots = publicationSnapshots(manifestBody, documents);
  return snapshots.length
    ? composeGraphPublicationQuery(fullPublicationQuery(snapshots), snapshots)
    : null;
}
