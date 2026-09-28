import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareV5PublicationFixture,
  V5_FIXTURE_WORLD_ID
} from "./prepare-v5-publication-fixture.js";
import { POST } from "../apps/atropos-web/src/app/graph/v5/render/route.js";

describe("complete Render Publication served fixture", () => {
  let root: string | undefined;
  const previous = process.env.LOCAL_PUBLICATION_FIXTURE_DIR;
  afterEach(async () => {
    if (previous === undefined)
      delete process.env.LOCAL_PUBLICATION_FIXTURE_DIR;
    else process.env.LOCAL_PUBLICATION_FIXTURE_DIR = previous;
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("publishes a pinned manifest and reads its immutable tile through the public route", async () => {
    root = await mkdtemp(join(tmpdir(), "moirai-ip012-"));
    await prepareV5PublicationFixture(root, { renderPublication: true });
    process.env.LOCAL_PUBLICATION_FIXTURE_DIR = root;
    const query = (body: object) =>
      POST(
        new Request("http://localhost/graph/v5/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            world_id: V5_FIXTURE_WORLD_ID,
            revision: 31,
            time_system_id: "019f3b00-0000-7000-8000-000000000a21",
            ...body
          })
        })
      );
    const manifestResponse = await query({ kind: "manifest" });
    expect(manifestResponse.status).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      tiles: { level: number; x: number; y: number; sha256: string }[];
    };
    expect(manifest.tiles.length).toBeGreaterThan(0);
    const first = manifest.tiles[0]!;
    const assetResponse = await query({
      kind: "assets",
      assets: [{ kind: "tile", level: first.level, x: first.x, y: first.y }]
    });
    expect(assetResponse.status).toBe(200);
    const payload = (await assetResponse.json()) as {
      assets: {
        sha256: string;
        body: { format: string; revision: number; primitives: unknown[] };
      }[];
    };
    expect(payload.assets[0]).toMatchObject({
      sha256: first.sha256,
      body: { format: "render-tile/1", revision: 31 }
    });
    expect(payload.assets[0]!.body.primitives.length).toBeGreaterThan(0);
    expect((await query({ kind: "manifest", revision: 30 })).status).toBe(409);
  });
});
