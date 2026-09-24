import { describe, expect, it } from "vitest";
import {
  buildV5ContentAndTemporalStagedArtifacts,
  buildV5ContentStagedArtifacts,
  buildV5StagedIndex,
  publishV5StagedArtifacts,
  readV5StagedDocument,
  verifyV5StagedIndex
} from "./v5-staging.js";

const prefix = "worlds/world-1/revisions/31/v5/";
const input = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `${prefix}content/events/${index.toString().padStart(6, "0")}.json`,
    body: JSON.stringify({ event_id: index })
  }));

describe("inactive v5 hierarchical integrity index", () => {
  it("uploads a complete immutable rehearsal tree without changing the public pointer", async () => {
    const built = buildV5StagedIndex("world-1", 31, input(129));
    const objects = new Map<string, string>([
      ["worlds/world-1/current.json", "v4-pointer"]
    ]);
    const store = {
      get: async (key: string) => ({
        status: objects.has(key) ? 200 : 404,
        body: objects.get(key) ?? null,
        etag: null
      }),
      put: async (
        key: string,
        body: string,
        options?: { immutable?: boolean }
      ) => {
        expect(options?.immutable).toBe(true);
        if (objects.has(key)) return { status: 412, etag: null };
        objects.set(key, body);
        return { status: 201, etag: null };
      }
    };
    expect(await publishV5StagedArtifacts(store, built)).toBe(built.root.key);
    expect(await publishV5StagedArtifacts(store, built)).toBe(built.root.key);
    expect(objects.get("worlds/world-1/current.json")).toBe("v4-pointer");
    objects.set(built.documents[0]!.key, "tampered");
    await expect(publishV5StagedArtifacts(store, built)).rejects.toThrow(
      "v5_immutable_conflict"
    );
    expect(() =>
      verifyV5StagedIndex({ ...built, documents: built.documents.slice(1) })
    ).toThrow();
  });
  it("indexes actual World content without touching the served pointer", () => {
    const built = buildV5ContentStagedArtifacts(
      {
        world: {
          id: "world-1",
          slug: "history",
          title: "실제 세계사",
          description: null
        },
        collections: [],
        events: [],
        relations: [],
        narratives: [],
        eventCollectionMemberships: [],
        timeSystems: [],
        collectionTimeSystems: []
      },
      31
    );
    verifyV5StagedIndex(built);
    expect(built.documents.map((document) => document.key)).toEqual([
      `${prefix}content/world.json`
    ]);
    expect(
      [...built.documents, ...built.index, built.root].some((document) =>
        document.key.endsWith("/current.json")
      )
    ).toBe(false);
  });

  it("indexes World temporal detail separately from the active Publication", async () => {
    const state = {
      world: {
        id: "world-1",
        slug: "history",
        title: "실제 세계사",
        description: null
      },
      collections: [],
      events: [],
      relations: [],
      narratives: [],
      eventCollectionMemberships: [],
      timeSystems: [],
      collectionTimeSystems: []
    };
    const built = buildV5ContentAndTemporalStagedArtifacts(state, 31);
    verifyV5StagedIndex(built);
    expect(JSON.parse(built.root.body)).toMatchObject({
      completeness: "content-and-temporal-detail-only",
      document_count: 2
    });
    const temporalKey = `${prefix}temporal/world.json`;
    const objects = new Map(
      [...built.documents, ...built.index].map(({ key, body }) => [key, body])
    );
    expect(
      JSON.parse(
        (await readV5StagedDocument(
          built.root.body,
          temporalKey,
          async (key) => objects.get(key) ?? null
        ))!
      )
    ).toMatchObject({
      position_count: 0,
      completeness: "temporal-detail-only"
    });
    expect(built.root.key).not.toContain("current.json");
  });
  it("bounds the root and every index page even when document count grows", () => {
    const small = buildV5StagedIndex("world-1", 31, input(4));
    const large = buildV5StagedIndex("world-1", 31, input(20_000).reverse());
    verifyV5StagedIndex(small);
    verifyV5StagedIndex(large);
    expect(JSON.parse(large.root.body).entries.length).toBeLessThanOrEqual(128);
    expect(large.root.body.length).toBeLessThan(16_000);
    expect(
      large.index.every((item) => JSON.parse(item.body).entries.length <= 128)
    ).toBe(true);
    expect(large.root.body).not.toContain("000001.json");
    expect(large.root.body).toContain('"completeness":"content-only"');
    expect(large.root.key).not.toBe("worlds/world-1/current.json");
    expect(buildV5StagedIndex("world-1", 31, input(20_000)).root).toEqual(
      large.root
    );
  });

  it("finds distant details with only one branch per level", async () => {
    const built = buildV5StagedIndex("world-1", 31, input(20_000));
    const objects = new Map(
      [...built.documents, ...built.index].map(({ key, body }) => [key, body])
    );
    const reads: string[] = [];
    const get = async (key: string) => {
      reads.push(key);
      return objects.get(key) ?? null;
    };
    const target = input(20_000)[19_999]!;
    expect(await readV5StagedDocument(built.root.body, target.key, get)).toBe(
      target.body
    );
    expect(reads.length).toBeLessThanOrEqual(4);
    expect(reads.at(-1)).toBe(target.key);
    reads.length = 0;
    expect(
      await readV5StagedDocument(
        built.root.body,
        `${prefix}content/events/999999.json`,
        get
      )
    ).toBeNull();
    expect(reads).toEqual([]);
    reads.length = 0;
    objects.set(target.key, "altered");
    await expect(
      readV5StagedDocument(built.root.body, target.key, get)
    ).rejects.toThrow("v5_index_digest_mismatch");
  });

  it("uses ordinal key ranges rather than locale collation", async () => {
    const mixed = ["a", "A", "-"].map((name) => ({
      key: `${prefix}content/events/${name}.json`,
      body: name
    }));
    const built = buildV5StagedIndex("world-1", 31, mixed);
    verifyV5StagedIndex(built);
    const objects = new Map(
      [...built.documents, ...built.index].map(({ key, body }) => [key, body])
    );
    expect(
      await readV5StagedDocument(
        built.root.body,
        `${prefix}content/events/A.json`,
        async (key) => objects.get(key) ?? null
      )
    ).toBe("A");
  });

  it("rejects altered, missing, extra, duplicate and cross-revision documents", () => {
    const built = buildV5StagedIndex("world-1", 31, input(129));
    expect(() =>
      verifyV5StagedIndex({
        ...built,
        documents: [
          { ...built.documents[0]!, body: "modified" },
          ...built.documents.slice(1)
        ]
      })
    ).toThrow("v5_index_digest_mismatch");
    expect(() =>
      verifyV5StagedIndex({ ...built, documents: built.documents.slice(1) })
    ).toThrow("v5_index_digest_mismatch");
    expect(() =>
      verifyV5StagedIndex({
        ...built,
        root: {
          ...built.root,
          body: JSON.stringify({
            ...JSON.parse(built.root.body),
            index_depth: 19
          })
        }
      })
    ).toThrow("v5_index_depth_invalid");
    expect(() =>
      verifyV5StagedIndex({
        ...built,
        documents: [
          ...built.documents,
          { key: `${prefix}extra.json`, body: "{}" }
        ]
      })
    ).toThrow("v5_index_incomplete");
    expect(() =>
      buildV5StagedIndex("world-1", 31, [input(1)[0]!, input(1)[0]!])
    ).toThrow("v5_index_document_invalid");
    expect(() =>
      buildV5StagedIndex("world-1", 31, [
        { key: "worlds/world-1/revisions/32/v5/x", body: "{}" }
      ])
    ).toThrow("v5_index_document_invalid");
  });
});
