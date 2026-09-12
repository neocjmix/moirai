/** Server read seam for immutable Moirai artifacts; no canonical data access. */
import type {
  MoiraiGraphSource,
  MoiraiGraphDiagnostic,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import { presentationScopeKey } from "@moirai/graph-presentation";
import {
  spatialDigest,
  spatialPrefix,
  type SpatialManifest,
  type SpatialMeta,
  type SpatialEntityIndexEntry
} from "@moirai/graph-presentation/server";
import {
  graphShellChartPlaneEntitySchema,
  type GraphShellChartPlaneEntity,
  type GraphShellViewportQuery,
  type GraphShellViewportResponse
} from "../shared/contracts";
import {
  filterStaticViewportEntities,
  getBandRange,
  mergeUniqueEntities,
  applyCanonOffset
} from "./spatial-read";
import { composeCanonOffsets } from "./spatial-composition";
import {
  getSelectedEntityRefs,
  getNeighborEntityRefs,
  getRegionRetentionRefs
} from "./spatial-retention";

const MAX_CELLS = 2500;
const MAX_BYTES = 1024 * 1024;
const MAX_OBJECT_READS = 256;
const CLASSES = ["point", "segment", "region"] as const;
export type SpatialRead = (
  key: string
) => Promise<{ status: number; body: string | null }>;
export type SpatialSource = {
  world_id: string;
  served_revision: number;
  canon_id: string;
};
export interface SpatialViewportRequest {
  readonly sources: readonly MoiraiGraphSource[];
  readonly viewport: GraphShellViewportQuery;
  readonly maxEntities?: number | undefined;
  /** Optional semantic filter, evaluated server-side, never changes stored geometry. */
  readonly accept?: (
    entity: GraphShellChartPlaneEntity,
    source: SpatialSource
  ) => boolean;
}
export interface SpatialViewportResult {
  readonly viewport: GraphShellViewportResponse;
  readonly revision_vector: readonly {
    world_id: string;
    served_revision: number;
  }[];
  readonly diagnostics: readonly MoiraiGraphDiagnostic[];
  readonly unplaced_count: number;
  readonly reads: {
    readonly objects: number;
    readonly cache_hits: number;
    readonly keys: readonly string[];
  };
}
const bandNumber = (value: string) =>
  value.startsWith("n") ? -Number(value.slice(1)) : Number(value);
const sourceError = (
  source: SpatialSource,
  code: string,
  message: string
): MoiraiGraphDiagnostic => ({
  source,
  code,
  message,
  severity: "warning",
  affected_ids: []
});

export function createMoiraiSpatialReader(read: SpatialRead) {
  const cache = new Map<string, Promise<{ value: unknown; digest: string }>>();
  let cacheHits = 0;
  async function document(
    key: string,
    digest?: string
  ): Promise<{ value: unknown; digest: string }> {
    const cacheKey = key + ":" + (digest ?? "");
    const existing = cache.get(cacheKey);
    if (existing) {
      cacheHits++;
      return existing;
    }
    const promise = (async () => {
      const value = await read(key);
      if (value.status !== 200 || value.body === null)
        throw Error("spatial_partial_missing");
      if (digest && spatialDigest(value.body) !== digest)
        throw Error("spatial_digest_mismatch");
      return {
        value: JSON.parse(value.body),
        digest: spatialDigest(value.body)
      };
    })();
    cache.set(cacheKey, promise);
    // Bound server cache entries; failures never poison a subsequent read.
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
    try {
      return await promise;
    } catch (error) {
      if (cache.get(cacheKey) === promise) cache.delete(cacheKey);
      throw error;
    }
  }
  async function json<T>(key: string, digest?: string): Promise<T> {
    return (await document(key, digest)).value as T;
  }
  async function scope(source: SpatialSource): Promise<SpatialMeta> {
    if (
      !/^[a-z0-9_-]+$/i.test(source.world_id) ||
      !Number.isSafeInteger(source.served_revision) ||
      source.served_revision < 1
    )
      throw Error("invalid_spatial_source");
    const prefix = spatialPrefix(source.world_id, source.served_revision);
    const publicationKey = `worlds/${source.world_id}/revisions/${source.served_revision}/manifest.json`;
    // Bind to this immutable revision, never resolve current again mid-request.
    const original = await document(publicationKey);
    const publication = original.value as {
      world_id: string;
      served_revision: number;
      completeness: string;
    };
    if (
      publication.world_id !== source.world_id ||
      publication.served_revision !== source.served_revision ||
      publication.completeness !== "complete"
    )
      throw Error("spatial_publication_revision_mismatch");
    const manifest = await json<SpatialManifest>(`${prefix}/manifest.json`);
    if (
      manifest.world_id !== source.world_id ||
      manifest.served_revision !== source.served_revision ||
      manifest.format_version !== 1 ||
      manifest.publication_manifest_sha256 !== original.digest
    )
      throw Error("spatial_manifest_mismatch");
    const ref = manifest.scopes.find(
      (s) =>
        s.canon_id === source.canon_id &&
        s.scope_id === presentationScopeKey(source)
    );
    if (!ref || !ref.meta_key.startsWith(prefix + "/scopes/"))
      throw Error("spatial_scope_missing");
    const meta = await json<SpatialMeta>(ref.meta_key, ref.sha256);
    if (
      meta.scope.world_id !== source.world_id ||
      meta.scope.served_revision !== source.served_revision ||
      meta.scope.canon_id !== source.canon_id ||
      meta.scopeId !== ref.scope_id ||
      meta.bandSize !== 4096
    )
      throw Error("spatial_scope_mismatch");
    const scopePrefix = ref.meta_key.slice(0, -"meta.json".length);
    if (
      !meta.index_key.startsWith(scopePrefix) ||
      !meta.sidecar_key.startsWith(prefix + "/") ||
      meta.objects.some((o) => !o.key.startsWith(scopePrefix))
    )
      throw Error("spatial_path_mismatch");
    return meta;
  }
  async function sidecar(
    source: SpatialSource
  ): Promise<MoiraiGraphQueryResult> {
    const meta = await scope(source);
    return json<MoiraiGraphQueryResult>(meta.sidecar_key, meta.sidecar_sha256);
  }
  async function viewport(
    request: SpatialViewportRequest
  ): Promise<SpatialViewportResult> {
    const query = request.viewport;
    const max = Math.max(1, Math.min(MAX_CELLS, request.maxEntities ?? 1000));
    if (
      !Number.isSafeInteger(max) ||
      request.sources.length > 8 ||
      request.sources.reduce((n, s) => n + s.canon_ids.length, 0) > 32 ||
      ![
        query.bbox.minX,
        query.bbox.maxX,
        query.bbox.minY,
        query.bbox.maxY
      ].every(Number.isFinite) ||
      query.bbox.minX > query.bbox.maxX ||
      query.bbox.minY > query.bbox.maxY
    )
      throw Error("invalid_spatial_request");
    const availableSources = request.sources.flatMap((s) =>
      s.canon_ids.map((canon_id) => ({
        world_id: s.world_id,
        served_revision: s.served_revision,
        canon_id
      }))
    );
    const sourceByScope = new Map(
      availableSources.map((s) => [presentationScopeKey(s), s])
    );
    const sources = query.canonIds.flatMap((id) =>
      sourceByScope.has(id) ? [sourceByScope.get(id)!] : []
    );
    const diagnostics: MoiraiGraphDiagnostic[] = [];
    const metas = await Promise.all(
      sources.map(async (source) => {
        try {
          return await scope(source);
        } catch {
          diagnostics.push(
            sourceError(
              source,
              "m46_spatial_source_missing",
              "The selected revision's spatial source is unavailable; other source revisions are unchanged."
            )
          );
          return null;
        }
      })
    );
    const canons = Object.fromEntries(
      sources.map((s, i) => [
        presentationScopeKey(s),
        { widthHint: metas[i]?.widthHint ?? 1800, preferredGap: 240 }
      ])
    );
    const offsets = composeCanonOffsets(
      sources.map(presentationScopeKey),
      "full",
      { canons },
      new Map()
    );
    const requested = (query.artifactClasses ?? CLASSES).filter((c) =>
      CLASSES.includes(c as (typeof CLASSES)[number])
    );
    let truncated = diagnostics.length > 0 || requested.length < CLASSES.length;
    let objectReads = 0;
    const readKeys: string[] = [];
    const beforeHits = cacheHits;
    let unplaced = 0;
    const all: GraphShellChartPlaneEntity[] = [];
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];
      const source = sources[i]!;
      if (!meta) continue;
      unplaced += meta.unplaced.length;
      diagnostics.push(
        ...meta.diagnostics.map((d) => ({
          ...d,
          source,
          affected_ids: d.affected_ids.slice(0, 32),
          message: d.message.slice(0, 512)
        }))
      );
      const extra = new Map<string, Set<number>>();
      if (query.selectedEntityId) {
        try {
          const index = await json<SpatialEntityIndexEntry[]>(
            meta.index_key,
            meta.index_sha256
          );
          const canonMeta = {
            entityIndex: Object.fromEntries(
              index.map((e) => [
                e.id,
                {
                  ...e,
                  eventId: e.geometryKind === "segment" ? e.id : e.eventId,
                  canonId: meta.scopeId,
                  bandIndices: e.bands
                }
              ])
            )
          };
          const selected = getSelectedEntityRefs(
            canonMeta,
            query.selectedEntityId
          );
          const neighbors = query.includeNeighbors
            ? getNeighborEntityRefs(canonMeta, selected, query.selectedEntityId)
            : [];
          const refs = [
            ...selected,
            ...neighbors,
            ...getRegionRetentionRefs(
              canonMeta,
              [...selected, ...neighbors],
              query.selectedEntityId
            )
          ];
          for (const ref of refs) {
            const set = extra.get(ref.geometryKind) ?? new Set<number>();
            for (const band of ref.bands) set.add(band);
            extra.set(ref.geometryKind, set);
          }
        } catch {
          truncated = true;
          diagnostics.push(
            sourceError(
              source,
              "m46_spatial_retention_missing",
              "Selection index could not be read for this revision."
            )
          );
        }
      }
      const objects = meta.objects
        .filter((o) => {
          if (!requested.includes(o.artifactClass)) return false;
          const range = getBandRange({
            viewportMinY: query.bbox.minY,
            viewportMaxY: query.bbox.maxY,
            bandSize: meta.bandSize,
            ...(o.artifactClass === "region" ? { overscanAfter: 3 } : {})
          });
          const band = bandNumber(o.yBand);
          return (
            extra.get(o.artifactClass)?.has(band) ||
            (o.artifactClass === "region" && band === 0) ||
            (band >= range.startBand && band <= range.endBand)
          );
        })
        .sort(
          (a, b) =>
            Number(
              Boolean(extra.get(b.artifactClass)?.has(bandNumber(b.yBand)))
            ) -
            Number(
              Boolean(extra.get(a.artifactClass)?.has(bandNumber(a.yBand)))
            )
        );
      const selectedObjects = objects.slice(
        0,
        Math.max(0, MAX_OBJECT_READS - objectReads)
      );
      if (selectedObjects.length < objects.length) truncated = true;
      objectReads += selectedObjects.length;
      readKeys.push(...selectedObjects.map((o) => o.key));
      const results = await Promise.allSettled(
        selectedObjects.map(async (o) => {
          const doc = await json<{
            scopeKey: string;
            revisionId: string;
            timeLevel: string;
            yBand: string;
            artifactClass: string;
            artifacts: { payload: unknown }[];
          }>(o.key, o.sha256);
          if (
            doc.scopeKey !== meta.scopeId ||
            doc.revisionId !== String(source.served_revision) ||
            doc.yBand !== o.yBand ||
            doc.artifactClass !== o.artifactClass ||
            doc.timeLevel !== "full"
          )
            throw Error("spatial_object_mismatch");
          return doc.artifacts.map((a) => {
            const entity = graphShellChartPlaneEntitySchema.parse(a.payload);
            if (entity.canonId !== meta.scopeId)
              throw Error("spatial_entity_scope_mismatch");
            // A Relation's presentation identity must not overwrite its source Event
            // in the original loader's byEventId retention map. Geometry is untouched.
            return entity.geometryKind === "segment"
              ? { ...entity, eventId: entity.id }
              : entity;
          });
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const entity of result.value)
            if (!request.accept || request.accept(entity, source))
              all.push(
                applyCanonOffset(entity, offsets.get(meta.scopeId) ?? 0)
              );
        } else {
          truncated = true;
          diagnostics.push(
            sourceError(
              source,
              "m46_spatial_partial_missing",
              "A declared spatial object is missing, invalid or has a mismatched digest."
            )
          );
        }
      }
    }
    const filtered = filterStaticViewportEntities(
      {
        entities: mergeUniqueEntities(all),
        timeSystemId: "presentation",
        compatibilityKey: "presentation",
        diagnostics: []
      },
      query
    );
    const ordered = query.selectedEntityId
      ? [
          ...filtered.filter(
            (e) =>
              e.eventId === query.selectedEntityId ||
              e.id === query.selectedEntityId
          ),
          ...filtered.filter(
            (e) =>
              e.eventId !== query.selectedEntityId &&
              e.id !== query.selectedEntityId
          )
        ]
      : filtered;
    const bounded: GraphShellChartPlaneEntity[] = [];
    let bytes = 128 * 1024;
    for (const entity of ordered) {
      const size = Buffer.byteLength(JSON.stringify(entity)) + 1;
      if (bounded.length >= max || bytes + size > MAX_BYTES) {
        truncated = true;
        continue;
      }
      bounded.push(entity);
      bytes += size;
    }
    if (bounded.length < ordered.length || objectReads >= MAX_OBJECT_READS)
      diagnostics.push({
        code: "m46_spatial_budget_exceeded",
        source: {},
        severity: "warning",
        affected_ids: [],
        message:
          "Spatial response budget reached; zoom in or narrow sources. Omitted geometry is not an assertion of absence."
      });
    const revisionVector = request.sources
      .filter((s) => sources.some((v) => v.world_id === s.world_id))
      .map((s) => ({
        world_id: s.world_id,
        served_revision: s.served_revision
      }));
    const revision =
      revisionVector.length === 1 ? revisionVector[0]!.served_revision : 0;
    const unique = [
      ...new Map(
        diagnostics.map((d) => [
          JSON.stringify([d.source, d.code, d.message]),
          d
        ])
      ).values()
    ].slice(0, 16);
    const response: SpatialViewportResult = {
      viewport: {
        revision,
        canonicalRevision: revision,
        lodLevel: 0,
        entities: bounded.filter((e) => e.geometryKind === "point"),
        edges: bounded.filter((e) => e.geometryKind === "segment"),
        regions: bounded.filter((e) => e.geometryKind === "region"),
        diagnostics: unique.map((d) => ({
          code: d.code,
          severity: d.severity === "error" ? "error" : "warning",
          message: d.message
        })),
        truncated,
        cache: { stale: false }
      },
      revision_vector: revisionVector,
      diagnostics: unique,
      unplaced_count: unplaced,
      reads: {
        objects: objectReads,
        cache_hits: cacheHits - beforeHits,
        keys: readKeys
      }
    };
    // Enforce the serialized envelope too, including diagnostics and read evidence.
    while (Buffer.byteLength(JSON.stringify(response)) > MAX_BYTES) {
      const groups = [
        response.viewport.entities,
        response.viewport.edges,
        response.viewport.regions
      ];
      const group = groups.find((g) => g.length > 0);
      if (!group) throw Error("spatial_response_budget");
      group.pop();
      response.viewport.truncated = true;
    }
    return response;
  }
  return {
    scope,
    sidecar,
    viewport,
    reset() {
      cache.clear();
      cacheHits = 0;
    }
  };
}
