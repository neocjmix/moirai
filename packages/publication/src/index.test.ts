import { describe, expect, it } from "vitest";

import {
  buildPublicationArtifacts,
  currentKey,
  publishArtifacts,
  revisionPrefix,
  type ObjectRead,
  type ObjectStore,
  type ObjectWrite
} from "./index.js";

class MemoryStore implements ObjectStore {
  readonly values = new Map<string, { body: string; etag: string }>();
  private version = 0;

  async get(key: string): Promise<ObjectRead> {
    const value = this.values.get(key);
    return value
      ? { status: 200, body: value.body, etag: value.etag }
      : { status: 404, body: null, etag: null };
  }

  async put(
    key: string,
    body: string,
    options: {
      immutable?: boolean;
      ifMatch?: string;
      ifNoneMatch?: boolean;
    } = {}
  ): Promise<ObjectWrite> {
    const current = this.values.get(key);
    if ((options.immutable || options.ifNoneMatch) && current)
      return { status: 412, etag: current.etag };
    if (options.ifMatch && current?.etag !== options.ifMatch)
      return { status: 412, etag: current?.etag ?? null };
    const etag = `"${++this.version}"`;
    this.values.set(key, { body, etag });
    return { status: 200, etag };
  }
}

const view = {
  world: { id: "world", slug: "world", title: "World", description: null },
  canons: [
    {
      id: "canon",
      world_id: "world",
      slug: "canon",
      title: "Canon",
      description: null
    }
  ],
  events: [
    {
      id: "event",
      canon_id: "canon",
      slug: null,
      kind: "atomic" as const,
      title: "Event",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  timeSystems: [],
  canonTimeSystems: [],
  temporalPlacements: [],
  relations: [],
  narratives: []
};

describe("Publication artifact contract", () => {
  it("writes immutable documents before a conditional pointer swap", async () => {
    const store = new MemoryStore();
    const artifacts = buildPublicationArtifacts(
      view,
      1,
      "2026-01-01T00:00:00.000Z"
    );
    await expect(publishArtifacts(store, artifacts)).resolves.toBe(1);
    expect(
      store.values.has(`${revisionPrefix("world", 1)}/events/event.json`)
    ).toBe(true);
    expect(
      JSON.parse(store.values.get(currentKey("world"))!.body)
    ).toMatchObject({ served_revision: 1 });
  });

  it("does not let an older worker move the served pointer backward", async () => {
    const store = new MemoryStore();
    await publishArtifacts(
      store,
      buildPublicationArtifacts(view, 2, "2026-01-02T00:00:00.000Z")
    );
    await expect(
      publishArtifacts(
        store,
        buildPublicationArtifacts(view, 1, "2026-01-01T00:00:00.000Z")
      )
    ).resolves.toBe(2);
    expect(
      JSON.parse(store.values.get(currentKey("world"))!.body).served_revision
    ).toBe(2);
  });

  it("keeps private operational fields out of the artifact", () => {
    const serialized = JSON.stringify(
      buildPublicationArtifacts(view, 1, "2026-01-01T00:00:00.000Z")
    );
    expect(serialized).not.toContain("actor");
    expect(serialized).not.toContain("origins");
    expect(serialized).not.toContain("change_set");
  });

  it("indexes deterministic Timeline artifacts and their algorithm", () => {
    const timelineView = {
      ...view,
      timeSystems: [
        {
          id: "time",
          world_id: "world",
          slug: "time",
          title: "Time",
          kind: "ordinal" as const,
          definition_version: "1",
          definition: {}
        }
      ],
      canonTimeSystems: [
        { id: "canon-time", canon_id: "canon", time_system_id: "time" }
      ]
    };
    const artifacts = buildPublicationArtifacts(
      timelineView,
      4,
      "2026-01-04T00:00:00.000Z"
    );
    const timeline = artifacts.documents.find((document) =>
      document.key.endsWith("/graph/canons/canon/timeline-time.json")
    );
    const manifest = JSON.parse(artifacts.manifestBody);

    expect(JSON.parse(timeline!.body)).toMatchObject({
      source_revision: 4,
      projection_type: "timeline",
      canon_id: "canon",
      time_system_id: "time"
    });
    expect(manifest.algorithms.timeline).toBe("m4-timeline-v1");
    expect(
      manifest.documents.find(
        (document: { key: string }) => document.key === timeline!.key
      )?.sha256
    ).toMatch(/^[a-f0-9]{64}$/);
  });
});
