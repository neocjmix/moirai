import { createHash } from "node:crypto";
import type { MoiraiGraphQueryResult } from "@moirai/contracts";
import { projectPresentationInput, type PresentationScope } from "./index.js";
import {
  layoutPresentationScope,
  PRESENTATION_LAYOUT_VERSION
} from "./semantic-layout.js";
import {
  createStaticProjectionObjectDocs,
  getStaticEntityBandIndices
} from "./urdr-static-bake.js";
import type {
  GraphShellChartPlane,
  GraphShellChartPlaneEntity
} from "./urdr-layout-types.js";

export const SPATIAL_FORMAT_VERSION = 1;
export const SPATIAL_PATH_VERSION = "urdr-0267c8f-moirai-v1";
export const SPATIAL_BAND_SIZE = 4096;
export const spatialDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const spatialPrefix = (worldId: string, revision: number) =>
  `worlds/${worldId}/revisions/${revision}/presentation/${SPATIAL_PATH_VERSION}`;
export const scopeToken = (scopeId: string) => spatialDigest(scopeId);
export const entityToken = (id: string) => spatialDigest(id);
export interface SpatialDocument {
  readonly key: string;
  readonly body: string;
}
export interface SpatialManifest {
  readonly format_version: 1;
  readonly world_id: string;
  readonly served_revision: number;
  readonly algorithm_version: string;
  readonly publication_manifest_sha256: string;
  readonly scopes: readonly {
    readonly scope_id: string;
    readonly canon_id: string;
    readonly meta_key: string;
    readonly sha256: string;
  }[];
}
export interface SpatialMeta {
  readonly scope: PresentationScope["source"];
  readonly scopeId: string;
  readonly bandSize: number;
  readonly widthHint: number;
  readonly bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
  readonly entityCount: number;
  readonly unplaced: readonly string[];
  readonly diagnostics: MoiraiGraphQueryResult["diagnostics"];
  readonly objects: readonly {
    key: string;
    sha256: string;
    yBand: string;
    artifactClass: string;
    count: number;
  }[];
  readonly index_key: string;
  readonly index_sha256: string;
  readonly sidecar_key: string;
  readonly sidecar_sha256: string;
}
export interface SpatialEntityIndexEntry {
  readonly id: string;
  readonly eventId: string;
  readonly geometryKind: GraphShellChartPlaneEntity["geometryKind"];
  readonly contains: readonly string[];
  readonly containedBy?: string | undefined;
  readonly bands: readonly number[];
}
export interface SpatialBundle {
  readonly documents: readonly SpatialDocument[];
  readonly manifestKey: string;
  readonly manifestBody: string;
}

/** Pure immutable document producer. It consumes Publication query results only. */
export function buildSpatialArtifacts(
  result: MoiraiGraphQueryResult,
  publicationManifestBody: string
): SpatialBundle {
  const publication = JSON.parse(publicationManifestBody) as {
    world_id: string;
    served_revision: number;
  };
  if (
    result.revision_vector.length !== 1 ||
    result.revision_vector[0]?.world_id !== publication.world_id ||
    result.revision_vector[0].served_revision !== publication.served_revision
  )
    throw new Error("spatial_revision_mismatch");
  const input = projectPresentationInput(result);
  const layouts = input.scopes.map((scope) =>
    layoutPresentationScope(input, scope)
  );
  return bakeSpatialArtifacts(
    result,
    publicationManifestBody,
    layouts.map((l) => ({
      scope: l.scope,
      chartPlane: l.chartPlane,
      diagnostics: [...input.diagnostics, ...l.diagnostics],
      unplaced: l.unplaced
    }))
  );
}

/** Also usable with prebuilt synthetic geometry to test large spatial reads. */
export function bakeSpatialArtifacts(
  result: MoiraiGraphQueryResult,
  publicationManifestBody: string,
  layouts: readonly {
    scope: PresentationScope;
    chartPlane: GraphShellChartPlane;
    diagnostics: MoiraiGraphQueryResult["diagnostics"];
    unplaced: readonly string[];
  }[]
): SpatialBundle {
  const publication = JSON.parse(publicationManifestBody) as {
    world_id: string;
    served_revision: number;
  };
  const prefix = spatialPrefix(
    publication.world_id,
    publication.served_revision
  );
  const documents: SpatialDocument[] = [];
  const scopes: SpatialManifest["scopes"][number][] = [];
  const add = (key: string, value: unknown) => {
    const body = JSON.stringify(value);
    documents.push({ key, body });
    return { key, sha256: spatialDigest(body) };
  };
  const sidecar = add(`${prefix}/sidecar.json`, result);
  for (const layout of layouts) {
    if (
      layout.scope.source.world_id !== publication.world_id ||
      layout.scope.source.served_revision !== publication.served_revision
    )
      throw new Error("spatial_scope_mismatch");
    const scopePrefix = `${prefix}/scopes/${scopeToken(layout.scope.id)}`;
    const objects = createStaticProjectionObjectDocs({
      chartPlane: layout.chartPlane,
      revisionId: String(publication.served_revision),
      scopeKey: layout.scope.id,
      timeLevel: "full",
      bandSize: SPATIAL_BAND_SIZE
    });
    const refs: SpatialMeta["objects"][number][] = [];
    for (const object of objects.values()) {
      const ref = add(
        `${scopePrefix}/objects/${object.yBand}/${object.artifactClass}.json`,
        object
      );
      refs.push({
        ...ref,
        yBand: object.yBand,
        artifactClass: object.artifactClass,
        count: object.artifacts.length
      });
    }
    const index = add(
      `${scopePrefix}/index.json`,
      layout.chartPlane.entities.map(
        (e) =>
          ({
            id: e.id,
            eventId: e.eventId,
            geometryKind: e.geometryKind,
            contains: e.contains,
            containedBy: e.containedBy,
            bands: getStaticEntityBandIndices(e, SPATIAL_BAND_SIZE)
          }) satisfies SpatialEntityIndexEntry
      )
    );
    // Index and full sidecar stay on the server. Browser requests are bounded.
    const coordinates = layout.chartPlane.entities.flatMap((e) =>
      e.geometryKind === "point"
        ? [e.position]
        : e.geometryKind === "segment"
          ? [e.start, e.end]
          : [
              { x: e.worldBounds.minX, y: e.worldBounds.minY },
              { x: e.worldBounds.maxX, y: e.worldBounds.maxY }
            ]
    );
    let bounds: SpatialMeta["bounds"] = null;
    for (const p of coordinates) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
        throw new Error("spatial_nonfinite_geometry");
      if (!bounds) bounds = { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y };
      else {
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y);
        bounds.maxY = Math.max(bounds.maxY, p.y);
      }
    }
    const meta: SpatialMeta = {
      scope: layout.scope.source,
      scopeId: layout.scope.id,
      bandSize: SPATIAL_BAND_SIZE,
      widthHint: Math.max(1800, bounds ? bounds.maxX - bounds.minX : 0),
      bounds: bounds
        ? { ...bounds, maxX: bounds.maxX - bounds.minX, minX: 0 }
        : null,
      entityCount: layout.chartPlane.entities.length,
      unplaced: layout.unplaced,
      diagnostics: layout.diagnostics,
      objects: refs,
      index_key: index.key,
      index_sha256: index.sha256,
      sidecar_key: sidecar.key,
      sidecar_sha256: sidecar.sha256
    };
    const ref = add(`${scopePrefix}/meta.json`, meta);
    scopes.push({
      scope_id: layout.scope.id,
      canon_id: layout.scope.source.canon_id,
      meta_key: ref.key,
      sha256: ref.sha256
    });
  }
  const manifest: SpatialManifest = {
    format_version: 1,
    world_id: publication.world_id,
    served_revision: publication.served_revision,
    algorithm_version: PRESENTATION_LAYOUT_VERSION,
    publication_manifest_sha256: spatialDigest(publicationManifestBody),
    scopes
  };
  return {
    documents,
    manifestKey: `${prefix}/manifest.json`,
    manifestBody: JSON.stringify(manifest)
  };
}

export interface SpatialObjectStore {
  get(key: string): Promise<{ status: number; body: string | null }>;
  put(
    key: string,
    body: string,
    options?: { readonly immutable?: boolean }
  ): Promise<{ status: number }>;
}
/** Append-only extension: write objects before its manifest; never touch current.json. */
export async function publishSpatialArtifacts(
  store: SpatialObjectStore,
  bundle: SpatialBundle
): Promise<void> {
  for (const doc of [
    ...bundle.documents,
    { key: bundle.manifestKey, body: bundle.manifestBody }
  ]) {
    const written = await store.put(doc.key, doc.body, { immutable: true });
    if (written.status === 412) {
      const old = await store.get(doc.key);
      if (old.status !== 200 || old.body !== doc.body)
        throw new Error("spatial_immutable_conflict");
    } else if (written.status !== 200 && written.status !== 201)
      throw new Error("spatial_write_failed");
  }
}
