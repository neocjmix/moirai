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
    expect(manifest.algorithms.subject).toBe("m4-subject-v1");
    expect(
      manifest.documents.find(
        (document: { key: string }) => document.key === timeline!.key
      )?.sha256
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("publishes stable Subject documents and Canon references", () => {
    const subjectView = {
      ...view,
      events: [
        view.events[0]!,
        { ...view.events[0]!, id: "event-2", title: "Event continued" }
      ],
      relations: [
        {
          id: "identity",
          canon_id: "canon",
          type: "identity_continues" as const,
          source_event_id: "event",
          target_event_id: "event-2",
          direction: "directed" as const,
          attributes: {}
        }
      ]
    };
    const artifacts = buildPublicationArtifacts(
      subjectView,
      5,
      "2026-01-05T00:00:00.000Z"
    );
    const canon = JSON.parse(
      artifacts.documents.find((document) =>
        document.key.endsWith("/canons/canon.json")
      )!.body
    );
    const reference = canon.subject_artifacts[0];
    const subject = JSON.parse(
      artifacts.documents.find((document) => document.key === reference.key)!
        .body
    );

    expect(reference).toMatchObject({ member_count: 2 });
    expect(subject.subject).toMatchObject({
      projection_type: "subject",
      source_revision: 5,
      member_event_ids: ["event", "event-2"]
    });
  });

  it("publishes Process artifacts, duration evidence and Canon references", () => {
    const processView = {
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
      ],
      events: [
        {
          ...view.events[0]!,
          id: "process",
          kind: "composite" as const,
          title: "Process",
          roles: ["process"]
        },
        view.events[0]!,
        { ...view.events[0]!, id: "event-2", title: "Event 2" }
      ],
      temporalPlacements: [
        {
          id: "placement-1",
          event_id: "event",
          time_system_id: "time",
          kind: "point" as const,
          earliest_start: { value: 1 },
          latest_start: { value: 1 },
          earliest_end: null,
          latest_end: null,
          precision: "step",
          certainty: "exact" as const,
          display_label: "Step 1"
        },
        {
          id: "placement-2",
          event_id: "event-2",
          time_system_id: "time",
          kind: "point" as const,
          earliest_start: { value: 4 },
          latest_start: { value: 4 },
          earliest_end: null,
          latest_end: null,
          precision: "step",
          certainty: "exact" as const,
          display_label: "Step 4"
        }
      ],
      relations: [
        {
          id: "contains-1",
          canon_id: "canon",
          type: "contains" as const,
          source_event_id: "process",
          target_event_id: "event",
          direction: "directed" as const,
          attributes: {}
        },
        {
          id: "contains-2",
          canon_id: "canon",
          type: "contains" as const,
          source_event_id: "process",
          target_event_id: "event-2",
          direction: "directed" as const,
          attributes: {}
        }
      ]
    };
    const artifacts = buildPublicationArtifacts(
      processView,
      6,
      "2026-01-06T00:00:00.000Z"
    );
    const canon = JSON.parse(
      artifacts.documents.find((document) =>
        document.key.endsWith("/canons/canon.json")
      )!.body
    );
    const reference = canon.process_artifacts[0];
    const process = JSON.parse(
      artifacts.documents.find((document) => document.key === reference.key)!
        .body
    );
    const processEvent = JSON.parse(
      artifacts.documents.find((document) =>
        document.key.endsWith("/events/process.json")
      )!.body
    );
    const manifest = JSON.parse(artifacts.manifestBody);

    expect(reference).toMatchObject({
      process_event_id: "process",
      direct_child_count: 2,
      descendant_count: 2
    });
    expect(process).toMatchObject({
      projection_type: "process",
      source_revision: 6,
      durations: [{ minimum: 3, maximum: 3, kind: "exact" }]
    });
    expect(processEvent.time_systems).toEqual([
      expect.objectContaining({ id: "time", title: "Time" })
    ]);
    expect(manifest.algorithms.process).toBe("m4-process-v1");
  });

  it("publishes the Canon State artifact and its rule algorithm", () => {
    const stateView = {
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
      ],
      events: [
        view.events[0]!,
        { ...view.events[0]!, id: "event-2", title: "Event continued" },
        {
          ...view.events[0]!,
          id: "state",
          kind: "composite" as const,
          title: "Membership",
          roles: ["state", "state:membership"],
          attributes: { state_value: "guild" }
        }
      ],
      temporalPlacements: [
        {
          id: "placement-1",
          event_id: "event",
          time_system_id: "time",
          kind: "point" as const,
          earliest_start: { value: 1 },
          latest_start: { value: 1 },
          earliest_end: null,
          latest_end: null,
          precision: "step",
          certainty: "exact" as const,
          display_label: "Step 1"
        },
        {
          id: "placement-2",
          event_id: "event-2",
          time_system_id: "time",
          kind: "point" as const,
          earliest_start: { value: 4 },
          latest_start: { value: 4 },
          earliest_end: null,
          latest_end: null,
          precision: "step",
          certainty: "exact" as const,
          display_label: "Step 4"
        }
      ],
      relations: [
        {
          id: "identity",
          canon_id: "canon",
          type: "identity_continues" as const,
          source_event_id: "event",
          target_event_id: "event-2",
          direction: "directed" as const,
          attributes: {}
        },
        {
          id: "starts",
          canon_id: "canon",
          type: "starts" as const,
          source_event_id: "event",
          target_event_id: "state",
          direction: "directed" as const,
          attributes: {}
        },
        {
          id: "ends",
          canon_id: "canon",
          type: "ends" as const,
          source_event_id: "event-2",
          target_event_id: "state",
          direction: "directed" as const,
          attributes: {}
        }
      ]
    };
    const artifacts = buildPublicationArtifacts(
      stateView,
      7,
      "2026-01-07T00:00:00.000Z"
    );
    const canon = JSON.parse(
      artifacts.documents.find((document) =>
        document.key.endsWith("/canons/canon.json")
      )!.body
    );
    const states = JSON.parse(
      artifacts.documents.find(
        (document) => document.key === canon.state_artifact.key
      )!.body
    );
    const manifest = JSON.parse(artifacts.manifestBody);

    expect(canon.state_artifact).toMatchObject({ item_count: 1 });
    expect(states).toMatchObject({
      projection_type: "state",
      source_revision: 7,
      items: [{ duration: { minimum: 3, maximum: 3, kind: "exact" } }]
    });
    expect(manifest.algorithms.state).toBe("m4-state-membership-v1");
  });
});
