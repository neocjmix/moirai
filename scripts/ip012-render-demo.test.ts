import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import demo from "../apps/atropos-web/src/lib/v5-render-demo.json";
import { POST } from "../apps/atropos-web/src/app/graph/v5/render-demo/route.js";
import { createV5RenderTileClient } from "../apps/atropos-web/src/lib/v5-render-tile-client.js";
import { prepareV5PublicationFixture } from "./prepare-v5-publication-fixture.js";

describe("public synthetic Render demo", () => {
  it("matches deterministic compiler output and loads through the browser tile client", async () => {
    const root = await mkdtemp(join(tmpdir(), "moirai-render-demo-"));
    try {
      await prepareV5PublicationFixture(root, { renderPublication: true });
      const prefix = `worlds/${demo.manifest.worldId}/revisions/${demo.manifest.revision}/v5/render/${demo.manifest.timeSystemId}/`;
      expect(
        JSON.parse(await readFile(join(root, `${prefix}manifest.json`), "utf8"))
      ).toEqual(demo.manifest);
      for (const ref of [...demo.manifest.tiles, ...demo.manifest.geometry]) {
        const body = await readFile(join(root, ref.key), "utf8");
        expect(createHash("sha256").update(body).digest("hex")).toBe(
          ref.sha256
        );
        expect(
          (demo.assets as Record<string, { sha256: string; body: unknown }>)[
            ref.key
          ]
        ).toEqual({ sha256: ref.sha256, body: JSON.parse(body) });
      }
      const client = createV5RenderTileClient({
        worldId: demo.manifest.worldId,
        revision: demo.manifest.revision,
        timeSystemId: demo.manifest.timeSystemId,
        endpoint: "/graph/v5/render-demo",
        fetcher: ((url: string, init: RequestInit) =>
          POST(new Request(`http://localhost${url}`, init))) as typeof fetch
      });
      const scene = await client.load(demo.manifest.bounds!, 0, [
        "019f3b00-0000-7000-8000-000000000a02"
      ]);
      expect(scene.primitives.length).toBeGreaterThan(0);
      expect(
        (
          await POST(
            new Request("http://localhost/graph/v5/render-demo", {
              method: "POST",
              body: JSON.stringify({
                kind: "assets",
                world_id: demo.manifest.worldId,
                revision: 31,
                time_system_id: demo.manifest.timeSystemId,
                assets: [{ kind: "tile", level: 16, x: 0, y: 0 }]
              })
            })
          )
        ).status
      ).toBe(404);
      client.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
