/** Disposable browser artifacts. No database or operational store access. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { publishV5CompleteArtifacts } from "@moirai/publication/v5";

export const lifecycleWorldId = (n: number) =>
  `019f5000-2200-7000-8000-${String(n).padStart(12, "0")}`;
export async function prepareWorldLifecycleFixture(root: string) {
  for (const n of [1, 2, 3]) {
    const worldId = lifecycleWorldId(n);
    const eventId = lifecycleWorldId(10);
    const state: CanonicalState = {
      world: {
        id: worldId,
        slug: `world-fixture-${n}`,
        title: `Lifecycle World ${n}`,
        description: "Synthetic browser fixture"
      },
      collections: [],
      timeSystems: [],
      collectionTimeSystems: [],
      relations: [],
      eventCollectionMemberships: [],
      events:
        n === 1
          ? [
              {
                id: eventId,
                world_id: worldId,
                slug: null,
                title: "Unplaced first Event",
                summary: "Visible without time or membership",
                roles: [],
                attributes: {}
              }
            ]
          : [],
      narratives:
        n === 1
          ? [
              {
                id: lifecycleWorldId(11),
                world_id: worldId,
                scope_type: "event",
                scope_id: eventId,
                locale: "ko",
                title: null,
                body: "Synthetic narrative remains readable without a Collection.",
                public_references: [
                  {
                    label: "Synthetic reference",
                    url: "https://example.test/source"
                  }
                ],
                notes: [
                  {
                    title: "Synthetic uncertainty",
                    body: "The exact time is deliberately unspecified.",
                    public_references: [
                      {
                        label: "Note reference",
                        url: "https://example.test/note"
                      }
                    ]
                  }
                ]
              }
            ]
          : []
    };
    const { artifacts } = await buildV5WorldCompleteArtifacts(state, 1);
    const objects = new Map<string, string>();
    await publishV5CompleteArtifacts(
      {
        get: async (key) => ({
          status: objects.has(key) ? 200 : 404,
          body: objects.get(key) ?? null,
          etag: objects.has(key)
            ? createHash("sha256").update(objects.get(key)!).digest("hex")
            : null
        }),
        put: async (key, body) => {
          objects.set(key, body);
          return {
            status: 201,
            etag: createHash("sha256").update(body).digest("hex")
          };
        }
      },
      artifacts,
      "2026-10-04T00:00:00.000Z",
      undefined,
      n === 3
    );
    for (const [key, body] of objects) {
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }
  }
  // Artifacts uploaded, complete pointer not yet swapped.
  const pending = join(
    root,
    "worlds",
    lifecycleWorldId(4),
    "pending-fixture.json"
  );
  await mkdir(dirname(pending), { recursive: true });
  await writeFile(pending, "{}");
}
