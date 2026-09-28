import { describe, expect, it } from "vitest";
import demo from "../apps/atropos-web/src/lib/v5-render-demo.json";
import { POST } from "../apps/atropos-web/src/app/graph/v5/render-demo/route.js";
import { createV5RenderTileClient } from "../apps/atropos-web/src/lib/v5-render-tile-client.js";
import { buildV5RenderDemo } from "./v5-render-demo-fixture.js";

describe("public synthetic Render demo", () => {
  it("matches deterministic compiler output and loads through the browser tile client", async () => {
    expect(demo).toEqual(buildV5RenderDemo());
    expect(
      demo.manifest.bounds!.maxX - demo.manifest.bounds!.minX
    ).toBeGreaterThan(100);
    expect(demo.manifest.geometry.length).toBeGreaterThan(0);
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
    expect(scene.primitives.length).toBeGreaterThan(1);
    const near = await client.load(
      demo.manifest.bounds!,
      demo.manifest.maxLevel,
      [
        "019f3b00-0000-7000-8000-000000000a02",
        "019f3b00-0000-7000-8000-000000000a03"
      ]
    );
    expect(
      near.primitives.some((item) => item.geometry.kind === "polygon")
    ).toBe(true);
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
  });
});
