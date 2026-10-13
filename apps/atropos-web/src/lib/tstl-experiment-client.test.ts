import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  candidateExperimentPrimitives,
  createTstlExperimentClient
} from "./tstl-experiment-client";
import { createTstlGraphReadLoader } from "./tstl-experiment-loader";
import { workspaceWorldId } from "./graph-session-state";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "./tstl-experiment-pin";
import {
  tstlCandidate,
  type TstlExperimentArtifact,
  type TstlExperimentMode
} from "./tstl-experiment-types";
import type { GraphReadLoader } from "../urdr-port/src/graph-read-loader";
import type { GraphShellViewportQuery } from "../urdr-port/shared/contracts";

const body = readFileSync(
  `apps/atropos-web/public${TSTL_EXPERIMENT_ASSET_URL}`,
  "utf8"
);
const artifact = JSON.parse(body) as TstlExperimentArtifact;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const workspace = {
  menuItems: [],
  tabs: [],
  canons: [],
  defaultTabId: "r56",
  navigationScopes: [
    {
      canonId: artifact.source.worldId,
      widthHint: 1800,
      bounds: artifact.bounds,
      ready: true
    }
  ]
};
const query = (selectedEntityId?: string): GraphShellViewportQuery => {
  const b = artifact.bounds;
  const dx = b.maxX - b.minX,
    dy = b.maxY - b.minY;
  return {
    canonIds: [artifact.source.worldId],
    bbox: {
      minX: b.minX - dx * 1.5,
      maxX: b.maxX + dx * 1.5,
      minY: b.minY - dy * 1.5,
      maxY: b.maxY + dy * 1.5
    },
    scale: 390 / dx,
    viewportWidth: 390,
    viewportHeight: 844,
    includeNeighbors: false,
    ...(selectedEntityId ? { selectedEntityId } : {})
  };
};
const detail = vi.fn(async () => {
  throw Error("test_detail_delegate");
});
const detailLoader: GraphReadLoader = {
  loadWorkspace: async () => workspace,
  loadViewport: async () => {
    throw Error("test_no_semantic_viewport");
  },
  loadEventDetail: detail
};
function setup() {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
  const client = createTstlExperimentClient({ fetcher });
  const loader = (
    mode: TstlExperimentMode,
    collectionIds = artifact.collections.map((c) => c.id)
  ) =>
    createTstlGraphReadLoader({
      client,
      mode,
      workspace,
      worldId: artifact.source.worldId,
      revision: artifact.source.revision,
      timeSystemId: artifact.source.timeSystemId,
      collectionIds,
      relationTypes: [],
      detailLoader
    });
  return { client, fetcher, loader };
}

it("pins the immutable asset and keeps actual B0 primitives byte-for-byte in the payload", () => {
  expect(hash(body)).toBe(TSTL_EXPERIMENT_SHA256);
  const baseline = JSON.parse(
    readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
  );
  expect(artifact.b0Primitives).toEqual(baseline.primitives);
  expect(artifact.source.sourceRootDigest).toBe(
    baseline.provenance.sourceRootDigest
  );
  expect(artifact.stats).toEqual({
    events: 539,
    composites: 109,
    candidateAreaComposites: 105,
    candidateFragments: 1207,
    multiRunBands: 518
  });
});

it.each([
  "A",
  "B",
  "C",
  "bubble",
  "ribbon",
  "lanes",
  "aligned",
  "anchored"
] as const)(
  "%s preserves single Event identities and every original Event Y and Composite time boundary",
  (mode) => {
    const shape = tstlCandidate(artifact, mode);
    const candidate = candidateExperimentPrimitives(artifact, mode);
    expect(candidate.map((p) => p.id)).toEqual(
      artifact.b0Primitives.map((p) => p.id)
    );
    const eventIds = candidate
      .filter((p) => p.entity.kind !== "relation")
      .map((p) => p.entity.id);
    expect(eventIds).toHaveLength(539);
    expect(new Set(eventIds).size).toBe(539);
    for (let i = 0; i < candidate.length; i++) {
      const a = candidate[i]!,
        b = artifact.b0Primitives[i]!;
      if (b.entity.kind === "composite") {
        expect(a.composite!.anchor!.y).toBe(b.composite!.anchor!.y);
        expect(a.composite!.anchor!.x).toBe(shape.xByEventId[a.entity.id]);
        expect(a.bounds.minX).toBeLessThanOrEqual(a.composite!.anchor!.x);
        expect(a.bounds.maxX).toBeGreaterThanOrEqual(a.composite!.anchor!.x);
        expect(a.bounds.minY).toBeLessThanOrEqual(a.composite!.anchor!.y);
        expect(a.bounds.maxY).toBeGreaterThanOrEqual(a.composite!.anchor!.y);
        expect(a.composite!.worldBounds.minY).toBe(
          b.composite!.worldBounds.minY
        );
        expect(a.composite!.worldBounds.maxY).toBe(
          b.composite!.worldBounds.maxY
        );
        if (shape.noAreaCompositeIds.includes(a.entity.id)) {
          expect(a.geometry.kind).toBe("point");
          expect(shape.contoursByCompositeId[a.entity.id]).toEqual([]);
        } else {
          expect(a.geometry).toEqual({
            kind: "polygon",
            rings: shape.contoursByCompositeId[a.entity.id]
          });
        }
      } else if (b.geometry.kind === "point" && a.geometry.kind === "point") {
        expect(a.geometry.xy.y).toBe(b.geometry.xy.y);
        expect(a.geometry.xy.x).toBe(shape.xByEventId[a.entity.id]);
      } else if (b.geometry.kind === "line" && a.geometry.kind === "line") {
        expect(a.geometry.paths.map((p) => p.map((v) => v.y))).toEqual(
          b.geometry.paths.map((p) => p.map((v) => v.y))
        );
      } else throw Error("unexpected fixture geometry");
    }
  }
);

it("fetches once across every experiment, camera reads and Collection toggles with production admission", async () => {
  const { client, fetcher, loader } = setup();
  const selected = artifact.b0Primitives.find((p) => p.entity.kind === "event")!
    .entity.id;
  const b0 = loader("B0"),
    a = loader("A");
  const aWorkspace = await a.loadWorkspace("ko");
  expect(workspaceWorldId(aWorkspace.buildRevision!)).toBe(
    artifact.source.worldId
  );
  expect(await b0.loadWorkspace("ko")).toEqual(aWorkspace);
  const first = await b0.loadViewport("ko", query(selected));
  const second = await a.loadViewport("ko", query(selected));
  for (const value of [first, second]) {
    const events = [...value.entities, ...value.regions];
    expect(events.length).toBeLessThanOrEqual(160);
    expect(events.some((event) => event.id === selected)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(value.revision).toBe(56);
  }
  expect(
    first.regions.every((region) => !("preparedContourMode" in region))
  ).toBe(true);
  expect(second.regions.length).toBeGreaterThan(0);
  for (const region of second.regions) {
    const original = artifact.b0Primitives.find(
      (primitive) => primitive.entity.id === region.id
    )!.composite!;
    expect(region).toMatchObject({
      preparedContourMode: "fixed",
      preparedWorldRings: artifact.a.contoursByCompositeId[region.id],
      preparedAnchor: {
        x: artifact.a.xByEventId[region.id],
        y: original.anchor!.y
      },
      validationState: "warning"
    });
  }
  for (const mode of [
    "B",
    "C",
    "bubble",
    "ribbon",
    "lanes",
    "aligned",
    "anchored"
  ] as const) {
    const alternative = await loader(mode).loadViewport("ko", query(selected));
    const candidate = tstlCandidate(artifact, mode);
    expect(
      alternative.entities.some((event) => event.id === selected) ||
        alternative.regions.some((event) => event.id === selected)
    ).toBe(true);
    for (const region of alternative.regions)
      expect(region).toMatchObject({
        preparedContourMode: "fixed",
        preparedWorldRings: candidate.contoursByCompositeId[region.id],
        preparedWorldTraces: candidate.tracesByCompositeId?.[region.id] ?? []
      });
    if (mode === "bubble" || mode === "ribbon")
      for (const region of alternative.regions)
        expect(region).toMatchObject({ preparedContourFillRule: "evenodd" });
    const off = await loader(mode, []).loadViewport("ko", query());
    expect([...off.entities, ...off.regions, ...off.edges]).toEqual([]);
  }
  const empty = await loader("A", []).loadViewport("ko", query());
  expect([...empty.entities, ...empty.regions, ...empty.edges]).toEqual([]);
  b0.dispose?.();
  await expect(b0.loadViewport("ko", query())).rejects.toMatchObject({
    name: "AbortError"
  });
  await a.loadViewport("ko", query(selected));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.inspect().requests).toBe(1);
  client.dispose();
});

it.each(["bubble", "ribbon"] as const)(
  "%s changes only Composite ink at exact B0 coordinates",
  (mode) => {
    const candidate = candidateExperimentPrimitives(artifact, mode);
    const shape = tstlCandidate(artifact, mode);
    expect(shape.fillRule).toBe("evenodd");
    expect(shape.diagnostics!.leafMemberships).toBe(1390);
    for (let index = 0; index < candidate.length; index++) {
      const actual = candidate[index]!,
        original = artifact.b0Primitives[index]!;
      if (original.entity.kind !== "composite")
        expect(actual).toEqual(original);
      else {
        expect(actual.composite!.anchor).toEqual(original.composite!.anchor);
        expect(actual.composite!.worldBounds).toEqual(
          original.composite!.worldBounds
        );
      }
    }
    const older = JSON.parse(
      readFileSync(
        "apps/atropos-web/public/labs/tstl/r56-cc8a5617fc632dad.json",
        "utf8"
      )
    );
    for (const oldMode of ["a", "b", "c"] as const)
      expect(artifact[oldMode]).toEqual(older[oldMode]);
  }
);

it.each(["coordinates", "fill-rule", "time-bounds", "membership"])(
  "rejects rehashed smooth %s corruption",
  async (kind) => {
    const corrupt = structuredClone(artifact);
    if (kind === "coordinates")
      corrupt.bubble.xByEventId[Object.keys(corrupt.bubble.xByEventId)[0]!]! +=
        1;
    if (kind === "fill-rule") delete corrupt.bubble.fillRule;
    if (kind === "time-bounds")
      corrupt.ribbon.worldBoundsByCompositeId[
        Object.keys(corrupt.ribbon.worldBoundsByCompositeId)[0]!
      ]!.minY += 1;
    if (kind === "membership") corrupt.ribbon.memberships!.shift();
    const payload = JSON.stringify(corrupt);
    const client = createTstlExperimentClient({
      fetcher: async () => new Response(payload),
      expectedSha256: hash(payload)
    });
    await expect(client.load()).rejects.toThrow(/tstl_experiment_/);
    client.dispose();
  }
);

it("checks Collection membership before admission and delegates details without changing their identity", async () => {
  const { client, loader } = setup();
  const collection = artifact.collections[0]!;
  const value = await loader("A", [collection.id]).loadViewport("ko", query());
  const expected = new Set(collection.eventIds);
  expect(
    [...value.entities, ...value.regions].every((event) =>
      expected.has(event.id)
    )
  ).toBe(true);
  const id = collection.eventIds[0]!;
  await expect(loader("A").loadEventDetail("ko", id)).rejects.toThrow(
    "test_detail_delegate"
  );
  expect(detail).toHaveBeenLastCalledWith("ko", id, expect.any(AbortSignal));
  client.dispose();
});

it("rejects tampered bytes and a rehashed different source revision", async () => {
  const tampered = createTstlExperimentClient({
    fetcher: async () => new Response(body + " ")
  });
  await expect(tampered.load()).rejects.toThrow(
    "tstl_experiment_digest_mismatch"
  );
  tampered.dispose();
  const wrong = JSON.stringify({
    ...artifact,
    source: { ...artifact.source, revision: 57 }
  });
  const other = createTstlExperimentClient({
    fetcher: async () => new Response(wrong),
    expectedSha256: hash(wrong)
  });
  await expect(other.load()).rejects.toThrow("tstl_experiment_source_mismatch");
  other.dispose();
});

it("refuses a mixed World/revision adapter before starting an asset request", () => {
  const { client, fetcher } = setup();
  expect(() =>
    createTstlGraphReadLoader({
      client,
      mode: "A",
      workspace,
      worldId: artifact.source.worldId,
      revision: 57,
      timeSystemId: artifact.source.timeSystemId,
      collectionIds: [],
      relationTypes: [],
      detailLoader
    })
  ).toThrow("tstl_experiment_scope_mismatch");
  expect(fetcher).not.toHaveBeenCalled();
  client.dispose();
});

it("keeps old A geometry and B0 exactly while B/C share A coordinates and complete real leaf membership", () => {
  const old = JSON.parse(
    readFileSync(
      "apps/atropos-web/public/labs/tstl/r56-be1265468d3f0a32.json",
      "utf8"
    )
  ) as TstlExperimentArtifact;
  expect(artifact.a).toEqual(old.a);
  expect(artifact.b0Primitives).toEqual(old.b0Primitives);
  for (const mode of ["B", "C"] as const) {
    const candidate = tstlCandidate(artifact, mode);
    expect(candidate.xByEventId).toEqual(artifact.a.xByEventId);
    const memberships = candidate.memberships!;
    const actual = new Set(
      memberships.map((m) => `${m.compositeId}:${m.eventId}`)
    );
    expect(actual.size).toBe(memberships.length);
    for (const leaf of artifact.b0Primitives.filter(
      (p) => p.entity.kind === "event"
    ))
      for (const owner of leaf.ancestorCompositeIds!)
        expect(actual.has(`${owner}:${leaf.entity.id}`)).toBe(true);
    expect(
      memberships
        .filter((m) => m.status === "list")
        .every((m) => Boolean(m.reason))
    ).toBe(true);
    expect(candidate.limitations!.length).toBeGreaterThan(0);
    expect(
      Object.values(candidate.contoursByCompositeId).flat().length
    ).toBeGreaterThan(0);
    expect(Object.values(candidate.contoursByCompositeId).flat()).not.toEqual(
      Object.values(artifact.a.contoursByCompositeId).flat()
    );
  }
});

it.each([
  "coordinates",
  "membership",
  "missing-membership",
  "trace-owner",
  "trace"
])("rejects rehashed alternative %s corruption", async (kind) => {
  const corrupt = structuredClone(artifact);
  if (kind === "coordinates") {
    const id = Object.keys(corrupt.b.xByEventId)[0]!;
    corrupt.b.xByEventId[id]! += 1;
  } else if (kind === "membership") {
    corrupt.c.memberships![0]!.compositeId = corrupt.c.memberships![0]!.eventId;
  } else if (kind === "missing-membership") {
    corrupt.b.memberships!.shift();
  } else if (kind === "trace-owner") {
    const owner = Object.keys(corrupt.c.tracesByCompositeId!).find(
      (id) => corrupt.c.tracesByCompositeId![id]!.length > 0
    )!;
    corrupt.c.tracesByCompositeId![owner]![0]!.eventId = owner;
  } else {
    const owner = Object.keys(corrupt.c.tracesByCompositeId!).find(
      (id) => corrupt.c.tracesByCompositeId![id]!.length > 0
    )!;
    corrupt.c.tracesByCompositeId![owner]![0]!.points[0]!.x = NaN;
  }
  const payload = JSON.stringify(corrupt);
  const client = createTstlExperimentClient({
    fetcher: async () => new Response(payload),
    expectedSha256: hash(payload)
  });
  await expect(client.load()).rejects.toThrow(/tstl_experiment_/);
  client.dispose();
});

it("retains every previous candidate byte-for-byte while new X modes regenerate geometry", () => {
  const previous = JSON.parse(
    readFileSync(
      "apps/atropos-web/public/labs/tstl/r56-5d8e2b32d0b5895c.json",
      "utf8"
    )
  );
  for (const key of [
    "a",
    "b",
    "c",
    "bubble",
    "ribbon",
    "b0Primitives",
    "source",
    "collections"
  ] as const)
    expect(artifact[key]).toEqual(previous[key]);
  for (const mode of ["lanes", "aligned", "anchored"] as const) {
    expect(artifact[mode].xByEventId).not.toEqual(artifact.a.xByEventId);
    expect(artifact[mode].contoursByCompositeId).not.toEqual(
      artifact.bubble.contoursByCompositeId
    );
    expect(artifact[mode].fillRule).toBe("evenodd");
    expect(artifact[mode].memberships).toHaveLength(1390);
  }
});

it.each([
  "missing-x",
  "nonfinite-x",
  "temporal-bound",
  "membership",
  "fill-rule"
])("rejects rehashed positioned candidate %s corruption", async (kind) => {
  const corrupt = structuredClone(artifact);
  const id = Object.keys(corrupt.anchored.xByEventId)[0]!;
  if (kind === "missing-x") delete corrupt.anchored.xByEventId[id];
  if (kind === "nonfinite-x") corrupt.anchored.xByEventId[id] = NaN;
  if (kind === "temporal-bound")
    corrupt.anchored.worldBoundsByCompositeId[
      Object.keys(corrupt.anchored.worldBoundsByCompositeId)[0]!
    ]!.minY++;
  if (kind === "membership") corrupt.anchored.memberships!.shift();
  if (kind === "fill-rule") delete corrupt.anchored.fillRule;
  const body = JSON.stringify(corrupt);
  const client = createTstlExperimentClient({
    fetcher: vi.fn(async () => new Response(body)),
    expectedSha256: hash(body)
  });
  await expect(client.load()).rejects.toThrow();
  client.dispose();
});
