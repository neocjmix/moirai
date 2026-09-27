import { createHash } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { scaleFixture } from "./ip011-a4-scale-fixture";
const fixture = vi.hoisted(() => new Map<string, string>());
vi.mock("../apps/atropos-web/src/lib/publication", () => ({
  readPublicationObject: async (key: string) => ({
    status: fixture.has(key) ? 200 : 404,
    body: fixture.get(key) ?? null
  })
}));
import { POST } from "../apps/atropos-web/src/app/graph/v5/shell/route";
import { v5ShellReader } from "../apps/atropos-web/src/lib/v5-shell-reader";
const world = "019f5000-1300-7000-8000-000000000001";
const time = "019f5000-1300-7000-8005-000000000001";
beforeAll(async () => {
  const { artifacts } = await buildV5WorldCompleteArtifacts(
    scaleFixture(1000, "sustained"),
    31
  );
  for (const item of [
    ...artifacts.documents,
    ...artifacts.index,
    artifacts.root
  ])
    fixture.set(item.key, item.body);
  fixture.set(
    `worlds/${world}/current.json`,
    JSON.stringify({
      format_version: "v5-publication/1",
      world_id: world,
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
}, 30000);
const read = async (bbox: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}) => {
  const response = await POST(
    new Request("http://fixture/graph/v5/shell", {
      method: "POST",
      body: JSON.stringify({
        kind: "viewport",
        world_id: world,
        revision: 31,
        time_system_id: time,
        collection_ids: ["019f5000-1300-7000-8004-000000000001"],
        viewport: {
          canonIds: [world],
          bbox,
          scale: 1,
          viewportWidth: 390,
          viewportHeight: 664
        }
      })
    })
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    regions: { id: string }[];
    entities: unknown[];
    truncated: boolean;
  }>;
};
it("does not assume a capped world query enumerates all neighborhoods", async () => {
  const shell = await v5ShellReader(world),
    all = (await shell.reader.spatialSummary(time)).bounds!;
  const capped = await read(all);
  expect(capped.truncated).toBe(true);
  expect(capped.regions.length).toBeLessThan(30);
  const ids = new Set<string>();
  for (let band = 0; band < 32; band++) {
    const result = await read({
      ...all,
      minY: all.minY + ((all.maxY - all.minY) * band) / 32,
      maxY: all.minY + ((all.maxY - all.minY) * (band + 1)) / 32
    });
    result.regions.forEach((region) => ids.add(region.id));
  }
  expect(ids.size).toBeGreaterThanOrEqual(30);
}, 30000);
it("uses a populated viewport for this fixture's server benchmark", async () => {
  expect(
    (await read({ minX: -100000, maxX: 100000, minY: 203419, maxY: 203422 }))
      .entities.length
  ).toBeGreaterThan(0);
});
