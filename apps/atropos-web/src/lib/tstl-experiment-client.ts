import {
  createV5RenderViewportClient,
  type RenderViewportMetadata
} from "./v5-render-viewport-client";
import type { ResolvedRenderPrimitive } from "./v5-render-density";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "./tstl-experiment-pin";
import {
  TSTL_EXPERIMENT_WORLD_ID,
  TSTL_EXPERIMENT_REVISION,
  TSTL_EXPERIMENT_TIME_SYSTEM_ID,
  tstlCandidate,
  type TstlCandidateMode,
  type TstlExperimentArtifact,
  type TstlExperimentMode,
  type TstlExperimentPoint
} from "./tstl-experiment-types";

const pointBounds = (points: readonly TstlExperimentPoint[]) => ({
  minX: Math.min(...points.map((p) => p.x)),
  maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y))
});

/** Replaces X and supplied outlines only; all Event and span Y values stay exact. */
export function candidateExperimentPrimitives(
  artifact: TstlExperimentArtifact,
  mode: TstlCandidateMode = "A"
): ResolvedRenderPrimitive[] {
  const a = tstlCandidate(artifact, mode);
  return artifact.b0Primitives.map((primitive): ResolvedRenderPrimitive => {
    const geometry = primitive.geometry;
    if (geometry.kind === "external" || primitive.entity.kind === "cluster")
      throw Error("tstl_experiment_unresolved_primitive");
    const id = primitive.entity.id;
    if (primitive.entity.kind === "composite") {
      if (!primitive.composite?.anchor)
        throw Error("tstl_experiment_composite_missing");
      const rings = a.contoursByCompositeId[id]!;
      const worldBounds = a.worldBoundsByCompositeId[id]!;
      const anchor = {
        x: a.xByEventId[id]!,
        y: primitive.composite.anchor.y
      };
      const support = [
        ...rings.flat(),
        ...(a.tracesByCompositeId?.[id] ?? []).flatMap((trace) => trace.points)
      ];
      const hullBounds = pointBounds(support.length ? support : [anchor]);
      return {
        ...primitive,
        geometry: rings.length
          ? { kind: "polygon", rings }
          : { kind: "point", xy: anchor },
        bounds: hullBounds,
        composite: { ...primitive.composite, worldBounds, hullBounds, anchor }
      };
    }
    if (primitive.entity.kind === "relation") {
      if (geometry.kind !== "line" || !primitive.endpointIds)
        throw Error("tstl_experiment_relation_missing");
      const [from, to] = primitive.endpointIds.map(
        (eventId) => a.xByEventId[eventId]!
      );
      const paths = geometry.paths.map((path) =>
        path.map((point, index) => ({
          x: from! + ((to! - from!) * index) / Math.max(1, path.length - 1),
          y: point.y
        }))
      );
      return {
        ...primitive,
        geometry: { kind: "line", paths },
        bounds: pointBounds(paths.flat())
      };
    }
    const x = a.xByEventId[id]!;
    if (geometry.kind === "point") {
      const xy = { x, y: geometry.xy.y };
      return {
        ...primitive,
        geometry: { kind: "point", xy },
        bounds: pointBounds([xy])
      };
    }
    if (geometry.kind !== "line") throw Error("tstl_experiment_event_geometry");
    const oldX = (primitive.bounds.minX + primitive.bounds.maxX) / 2;
    const paths = geometry.paths.map((path) =>
      path.map((point) => ({ x: point.x + x - oldX, y: point.y }))
    );
    return {
      ...primitive,
      geometry: { kind: "line", paths },
      bounds: pointBounds(paths.flat())
    };
  });
}

function validateArtifact(value: TstlExperimentArtifact) {
  if (
    value.formatVersion !== "tstl-product-experiment/2" ||
    value.source?.worldId !== TSTL_EXPERIMENT_WORLD_ID ||
    value.source.revision !== TSTL_EXPERIMENT_REVISION ||
    value.source.timeSystemId !== TSTL_EXPERIMENT_TIME_SYSTEM_ID ||
    !Array.isArray(value.b0Primitives) ||
    !Array.isArray(value.collections)
  )
    throw Error("tstl_experiment_source_mismatch");
  const ids = value.b0Primitives
    .filter((p) => p.entity.kind !== "relation")
    .map((p) => p.entity.id);
  const composites = value.b0Primitives.filter(
    (p) => p.entity.kind === "composite"
  );
  if (
    ids.length !== 539 ||
    new Set(ids).size !== ids.length ||
    composites.length !== 109
  )
    throw Error("tstl_experiment_identity_mismatch");
  const eventIds = new Set(ids);
  const primitiveByEvent = new Map(
    value.b0Primitives
      .filter((p) => p.entity.kind !== "relation")
      .map((p) => [p.entity.id, p])
  );
  const compositeIds = new Set(composites.map((p) => p.entity.id));
  const validPoint = (point: TstlExperimentPoint) =>
    Number.isFinite(point.x) && Number.isFinite(point.y);
  for (const mode of ["A", "B", "C"] as const) {
    const candidate = tstlCandidate(value, mode);
    if (
      !candidate ||
      Object.keys(candidate.xByEventId).length !== ids.length ||
      ids.some(
        (id) =>
          !Number.isFinite(candidate.xByEventId[id]) ||
          candidate.xByEventId[id] !== value.a.xByEventId[id]
      )
    )
      throw Error("tstl_experiment_identity_mismatch");
    if (
      composites.some(
        (p) =>
          !Array.isArray(candidate.contoursByCompositeId[p.entity.id]) ||
          !candidate.worldBoundsByCompositeId[p.entity.id]
      )
    )
      throw Error("tstl_experiment_composite_mismatch");
    for (const rings of Object.values(candidate.contoursByCompositeId))
      for (const ring of rings)
        if (ring.length < 3 || ring.some((point) => !validPoint(point)))
          throw Error("tstl_experiment_contour_invalid");
    for (const [owner, traces] of Object.entries(
      candidate.tracesByCompositeId ?? {}
    )) {
      if (!compositeIds.has(owner)) throw Error("tstl_experiment_trace_owner");
      for (const trace of traces)
        if (
          !["spine", "membership", "route"].includes(trace.kind) ||
          trace.points.length < 2 ||
          trace.points.some((point) => !validPoint(point)) ||
          (trace.eventId !== undefined &&
            !primitiveByEvent
              .get(trace.eventId)
              ?.ancestorCompositeIds?.includes(owner))
        )
          throw Error("tstl_experiment_trace_invalid");
    }
    const pairs = new Set<string>();
    for (const membership of candidate.memberships ?? []) {
      const key = `${membership.compositeId}:${membership.eventId}`;
      const primitive = primitiveByEvent.get(membership.eventId);
      if (
        !compositeIds.has(membership.compositeId) ||
        !eventIds.has(membership.eventId) ||
        !primitive?.ancestorCompositeIds?.includes(membership.compositeId) ||
        !["route", "list"].includes(membership.status) ||
        pairs.has(key) ||
        (membership.status === "list" && !membership.reason)
      )
        throw Error("tstl_experiment_membership_invalid");
      pairs.add(key);
    }
    if (mode !== "A")
      for (const primitive of primitiveByEvent.values()) {
        if (primitive.entity.kind !== "event") continue;
        for (const owner of primitive.ancestorCompositeIds ?? [])
          if (!pairs.has(`${owner}:${primitive.entity.id}`))
            throw Error("tstl_experiment_membership_missing");
      }
  }
}

/** One immutable asset fetch, retained across B0/A/B/C and Collection switches. */
export function createTstlExperimentClient(
  input: { fetcher?: typeof fetch; url?: string; expectedSha256?: string } = {}
) {
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  let disposed = false;
  let pending: Promise<TstlExperimentArtifact> | undefined;
  const candidates = new Map<TstlCandidateMode, ResolvedRenderPrimitive[]>();
  let bytes = 0;
  let requests = 0;
  const readers = new Map<
    TstlExperimentMode,
    ReturnType<typeof createV5RenderViewportClient>
  >();
  const assertActive = () => {
    if (disposed) throw new DOMException("Experiment disposed", "AbortError");
  };
  const load = () => {
    assertActive();
    pending ??= (async () => {
      requests++;
      const response = await fetcher(input.url ?? TSTL_EXPERIMENT_ASSET_URL, {
        signal: controller.signal,
        cache: "force-cache"
      });
      if (!response.ok) throw Error("tstl_experiment_unavailable");
      const buffer = await response.arrayBuffer();
      assertActive();
      bytes = buffer.byteLength;
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== (input.expectedSha256 ?? TSTL_EXPERIMENT_SHA256))
        throw Error("tstl_experiment_digest_mismatch");
      const value = JSON.parse(
        new TextDecoder().decode(buffer)
      ) as TstlExperimentArtifact;
      validateArtifact(value);
      assertActive();
      return value;
    })().catch((cause: unknown) => {
      pending = undefined;
      throw cause;
    });
    return pending;
  };
  const primitives = async (mode: TstlExperimentMode) => {
    const artifact = await load();
    if (mode === "B0") return artifact.b0Primitives;
    let candidate = candidates.get(mode);
    if (!candidate) {
      candidate = candidateExperimentPrimitives(artifact, mode);
      candidates.set(mode, candidate);
    }
    return candidate;
  };
  const viewport = (mode: TstlExperimentMode) => {
    assertActive();
    let reader = readers.get(mode);
    if (!reader) {
      // The production admission, density hysteresis, outgoing fade and camera
      // policy run unchanged. This adapter reads memory, never publishes/fetches
      // a viewport or geometry tile. The only HTTP request is load() above.
      const memoryFetch: typeof fetch = async (_url, options) => {
        if (options?.signal?.aborted)
          throw new DOMException("Superseded experiment", "AbortError");
        const query = JSON.parse(String(options?.body)) as {
          kind: string;
          viewport: TstlExperimentArtifact["bounds"];
        };
        if (query.kind !== "viewport")
          throw Error("tstl_experiment_no_external_geometry");
        const artifact = await load();
        const metadata: RenderViewportMetadata = {
          format: "render-viewport/1",
          world_id: artifact.source.worldId,
          revision: artifact.source.revision,
          time_system_id: artifact.source.timeSystemId,
          generation: `tstl:${input.expectedSha256 ?? TSTL_EXPERIMENT_SHA256}:${mode}`,
          algorithmVersion: "render-compiler/4",
          level: 0,
          maxLevel: 0,
          bounds: artifact.bounds,
          coverage: [query.viewport],
          primitives: await primitives(mode),
          completeness: true
        };
        assertActive();
        if (options?.signal?.aborted)
          throw new DOMException("Superseded experiment", "AbortError");
        // Response.json would stringify and parse the entire frozen World for
        // every camera cache miss. Preserve the same validated in-memory value.
        return Object.assign(new Response(null, { status: 200 }), {
          json: async () => metadata
        });
      };
      reader = createV5RenderViewportClient({
        worldId: TSTL_EXPERIMENT_WORLD_ID,
        revision: TSTL_EXPERIMENT_REVISION,
        timeSystemId: TSTL_EXPERIMENT_TIME_SYSTEM_ID,
        fetcher: memoryFetch
      });
      readers.set(mode, reader);
    }
    return reader;
  };
  return {
    load,
    primitives,
    viewport,
    inspect: () => ({ bytes, requests, readers: readers.size }),
    dispose() {
      disposed = true;
      controller.abort();
      for (const reader of readers.values()) reader.dispose();
      readers.clear();
      candidates.clear();
      pending = undefined;
    }
  };
}
export type TstlExperimentClient = ReturnType<
  typeof createTstlExperimentClient
>;
