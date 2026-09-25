import { withGraphReturnContext } from "../apps/atropos-web/src/lib/event-reading-navigation";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareV5PublicationFixture,
  V5_FIXTURE_IDS as ids,
  V5_FIXTURE_WORLD_ID as world
} from "./prepare-v5-publication-fixture";
import {
  eventDetailResponseSchema,
  graphShellViewportResponseSchema
} from "../apps/atropos-web/src/urdr-port/shared/contracts";

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../apps/atropos-web/src/lib/publication", () => ({
  readPublicationObject: async (key: string) => {
    try {
      return {
        status: 200,
        body: await readFile(join(fixture.root, key), "utf8")
      };
    } catch {
      return { status: 404, body: null };
    }
  }
}));
import { v5ShellReader } from "../apps/atropos-web/src/lib/v5-shell-reader";
import { POST } from "../apps/atropos-web/src/app/graph/v5/shell/route";

beforeAll(async () => {
  fixture.root = await mkdtemp(join(tmpdir(), "moirai-ui-restore-"));
  await prepareV5PublicationFixture(fixture.root);
});
afterAll(async () => {
  await rm(fixture.root, { recursive: true, force: true });
});

describe("v5 adapter into the original Atropos shell", () => {
  it("retains one World node, stable coordinates and an empty all-off viewport", async () => {
    const shell = await v5ShellReader(world);
    const summary = await shell.reader.spatialSummary(ids.calendar);
    const read = async (collections: string[]) => {
      const response = await POST(
        new Request("http://fixture/graph/v5/shell", {
          method: "POST",
          body: JSON.stringify({
            kind: "viewport",
            world_id: world,
            revision: 31,
            time_system_id: ids.calendar,
            collection_ids: collections,
            viewport: {
              canonIds: [world],
              bbox: summary.bounds,
              scale: 1,
              viewportWidth: 390,
              viewportHeight: 844
            }
          })
        })
      );
      expect(response.status).toBe(200);
      return graphShellViewportResponseSchema.parse(await response.json());
    };
    const both = await read([ids.joseon, ids.japan]);
    const japan = await read([ids.japan]);
    expect(both.entities.map((e) => e.eventId)).toEqual([ids.battle]);
    expect(japan.entities).toEqual(both.entities);
    expect(both.regions[0]?.contains).toEqual([ids.battle]);
    expect(japan.regions).toEqual([]);
    const off = await read([]);
    expect([...off.entities, ...off.regions, ...off.edges]).toEqual([]);
  });
  it("maps one World relation to the existing line geometry without duplicating it", async () => {
    const shell = await v5ShellReader(world);
    const adjacency = vi
      .spyOn(shell.reader, "adjacency")
      .mockImplementation(async (eventId) => ({
        event_id: eventId,
        relation_ids: ["synthetic-cause"],
        next_page: null
      }));
    const relation = vi.spyOn(shell.reader, "relation").mockResolvedValue({
      id: "synthetic-cause",
      world_id: world,
      type: "causes",
      source_ref: { kind: "event", event_id: ids.battle },
      target_ref: { kind: "event", event_id: ids.war },
      direction: "directed",
      attributes: {}
    });
    const base = {
      canonId: world,
      geometryKind: "point" as const,
      validationState: "ok" as const,
      contains: [],
      diagnostics: [],
      viewportClass: "visible" as const
    };
    const result = await shell.edges([
      {
        ...base,
        id: ids.battle,
        eventId: ids.battle,
        label: "A",
        position: { x: 1, y: 2 }
      },
      {
        ...base,
        id: ids.war,
        eventId: ids.war,
        label: "B",
        position: { x: 3, y: 4 }
      }
    ]);
    expect(result.truncated).toBe(false);
    expect(result.edges).toMatchObject([
      {
        id: "synthetic-cause",
        label: "causes",
        contains: [ids.battle, ids.war],
        start: { x: 1, y: 2 },
        end: { x: 3, y: 4 }
      }
    ]);
    expect(result.edges).toHaveLength(1);
    adjacency.mockRestore();
    relation.mockRestore();
  });
  it("preserves separate Collection and Event Narratives, unplaced detail and child navigation", async () => {
    const shell = await v5ShellReader(world);
    const detail = eventDetailResponseSchema.parse(await shell.detail(ids.war));
    expect(detail.narrativeSections[0]?.narratives[0]?.body).toBe(
      "임진왜란 서사"
    );
    expect(detail.readingLinks?.items[0]?.href).toContain(ids.battle);
    expect(detail.placeEvents).toEqual([]);
    expect(() =>
      withGraphReturnContext(detail.readingContext!.stableEventHref!, "")
    ).not.toThrow();
    const collection = eventDetailResponseSchema.parse(
      await shell.collectionDetail(ids.japan)
    );
    expect(collection.narrativeSections[0]?.narratives[0]?.body).toBe(
      "일본사 컬렉션 서사"
    );
    expect(
      collection.readingLinks?.items.some((item) =>
        item.href.includes(ids.unplaced)
      )
    ).toBe(true);
    expect(
      (await shell.detail(ids.unplaced)).narrativeSections[0]?.narratives[0]
        ?.body
    ).toBe("연대 미상 사건 서사");
    expect(await shell.memberships(ids.war, [ids.joseon, ids.japan])).toEqual([
      ids.joseon
    ]);
  });
});
