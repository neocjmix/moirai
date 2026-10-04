import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { projectV5WorldTemporal } from "@moirai/projections";
import { buildV5WorldLayout } from "../../../../../../../packages/graph-presentation/src/v5-world-layout";
import { scaleFixture } from "../../../../../../../scripts/ip011-a4-scale-fixture";
import { graphReadLoader } from "../../../../urdr-port/src/graph-read-loader";
import { graphShellViewportResponseSchema } from "../../../../urdr-port/shared/contracts";
import type { GraphShellViewportQuery } from "../../../../urdr-port/shared/contracts";
import { createV5GraphReadLoader } from "../../../../lib/v5-graph-read-loader";
import { V5_SHELL_QUERY_MAX_BYTES } from "../../../../lib/v5-shell-request";
const readObject = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/publication", () => ({
  readPublicationObject: readObject
}));
import { POST } from "./route";

it("exhausts dense10k's large continuation through the route and client without losing Event identity", async () => {
  const state = scaleFixture(10000, "dense");
  const { artifacts } = await buildV5WorldCompleteArtifacts(state, 31);
  const objects = new Map(
    [...artifacts.documents, ...artifacts.index, artifacts.root].map(
      ({ key, body }) => [key, body]
    )
  );
  objects.set(
    `worlds/${state.world.id}/current.json`,
    JSON.stringify({
      format_version: "v5-publication/1",
      world_id: state.world.id,
      served_revision: 31,
      current_revision: 31,
      publication_target_revision: 31,
      projection_status: "ready",
      manifest_key: artifacts.root.key,
      manifest_sha256: createHash("sha256")
        .update(artifacts.root.body)
        .digest("hex"),
      generated_at: "2026-09-27T00:00:00.000Z"
    })
  );
  readObject.mockImplementation(async (key: string) => ({
    status: objects.has(key) ? 200 : 404,
    body: objects.get(key) ?? null,
    etag: null
  }));
  const viewport: GraphShellViewportQuery = {
    canonIds: [state.world.id],
    // The actual 390×664 initial view plus the existing 1.5-screen read buffer.
    bbox: {
      minX: -1293.5145537436806,
      maxX: 266.4854462563193,
      minY: 202092.2481912702,
      maxY: 204748.2481912702
    },
    scale: 1,
    viewportWidth: 390,
    viewportHeight: 664,
    currentTimeLevel: "year",
    includeNeighbors: false,
    artifactClasses: ["point", "segment", "region"]
  };
  const collectionIds = state.collections.map((item) => item.id);
  const memberIds = new Set(
    state.eventCollectionMemberships.map((item) => item.event_id)
  );
  const expected = buildV5WorldLayout(
    state,
    projectV5WorldTemporal(state, 31),
    state.timeSystems[0]!.id
  )
    .shapes.filter(
      (shape) =>
        memberIds.has(shape.event_id) &&
        shape.kind === "point" &&
        shape.position.x >= viewport.bbox.minX &&
        shape.position.x <= viewport.bbox.maxX &&
        shape.position.y >= viewport.bbox.minY &&
        shape.position.y <= viewport.bbox.maxY
    )
    .map((shape) => shape.event_id)
    .sort();
  expect(expected.length).toBeGreaterThan(160);

  const batches: { requestBytes: number; ids: string[]; pending: boolean }[] =
    [];
  const fetcher: typeof fetch = async (_url, init) => {
    expect(batches.length).toBeLessThan(16);
    const requestBytes = Buffer.byteLength(String(init?.body));
    readObject.mockClear();
    const response = await POST(
      new Request("http://localhost/graph/v5/shell", init)
    );
    expect(response.status).toBe(200);
    // The public body fix must not raise the per-request publication IO cap.
    expect(readObject.mock.calls.length).toBeLessThanOrEqual(1024);
    const body = await response.clone().json();
    const parsed = graphShellViewportResponseSchema.parse(body);
    batches.push({
      requestBytes,
      ids: parsed.entities.map((entity) => entity.id),
      pending: body.next_cursor !== null
    });
    return response;
  };
  const loader = createV5GraphReadLoader({
    worldId: state.world.id,
    revision: 31,
    timeSystemId: state.timeSystems[0]!.id,
    collectionIds,
    relationTypes: [],
    workspace: await graphReadLoader.loadWorkspace("ko"),
    fetcher
  });
  try {
    const result = await loader.loadViewport("ko", viewport);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches[0]!.pending).toBe(true);
    expect(batches[1]!.requestBytes).toBeGreaterThan(V5_SHELL_QUERY_MAX_BYTES);
    expect(batches.at(-1)!.pending).toBe(false);
    const emittedIds = batches.flatMap((batch) => batch.ids);
    expect(new Set(emittedIds).size).toBe(emittedIds.length);
    expect(emittedIds.sort()).toEqual(expected);
    expect(result.entities.map((entity) => entity.id).sort()).toEqual(expected);
    expect(result.completeness).toMatchObject({ entities: true });
    const readCount = batches.length;
    expect(await loader.loadViewport("ko", viewport)).toBe(result);
    expect(batches).toHaveLength(readCount);
  } finally {
    loader.dispose?.();
  }
}, 30000);
