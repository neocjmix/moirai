import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  assertPublicId,
  readCanon,
  readEvent,
  readProcess,
  readStates,
  readSubject,
  readTimeline,
  readWorld
} from "./publication";

describe("Atropos Revision-pinned reader", () => {
  it("reads World, Canon and Event from one Snapshot revision", async () => {
    const world = await readWorld(SYNTHETIC_FIXTURE.worldId);
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const event = await readEvent(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      SYNTHETIC_FIXTURE.eventId
    );
    expect(world.pointer.served_revision).toBe(2);
    expect(canon.pointer.served_revision).toBe(2);
    expect(event.pointer.served_revision).toBe(2);
    expect(event.event.title).toBe(SYNTHETIC_FIXTURE.eventTitle);
    expect(event.relations).toHaveLength(4);
    expect(event.temporalPlacements).toHaveLength(1);
    expect(event.parentProcessIds).toEqual([SYNTHETIC_FIXTURE.processEventId]);
  });

  it("rejects path-like public identifiers", () => {
    expect(() => assertPublicId("../../private")).toThrow();
  });

  it("reads a Timeline from the same immutable Revision", async () => {
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const timeline = await readTimeline(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      canon.timelineArtifacts[0]!
    );

    expect(timeline.source_revision).toBe(canon.pointer.served_revision);
    expect(timeline.items).toHaveLength(5);
    expect(timeline.items.map((item) => item.event_id)).toEqual(
      expect.arrayContaining([
        SYNTHETIC_FIXTURE.eventId,
        SYNTHETIC_FIXTURE.secondEventId,
        SYNTHETIC_FIXTURE.thirdEventId,
        SYNTHETIC_FIXTURE.processEventId,
        SYNTHETIC_FIXTURE.stateEventId
      ])
    );
  });

  it("reads a Subject handle and projection from the same immutable Revision", async () => {
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const reference = canon.subjectArtifacts[0]!;
    const subject = await readSubject(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      reference.subject_handle_id
    );

    expect(subject.document.subject).toMatchObject({
      source_revision: canon.pointer.served_revision,
      member_event_ids: [
        SYNTHETIC_FIXTURE.eventId,
        SYNTHETIC_FIXTURE.secondEventId
      ]
    });
  });

  it("reads a Process and its Duration from the same immutable Revision", async () => {
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const reference = canon.processArtifacts[0]!;
    const process = await readProcess(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      reference
    );
    const event = await readEvent(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      SYNTHETIC_FIXTURE.processEventId
    );

    expect(process).toMatchObject({
      source_revision: canon.pointer.served_revision,
      process_event_id: SYNTHETIC_FIXTURE.processEventId,
      direct_child_event_ids: [
        SYNTHETIC_FIXTURE.eventId,
        SYNTHETIC_FIXTURE.secondEventId,
        SYNTHETIC_FIXTURE.thirdEventId
      ],
      durations: [{ minimum: 2, maximum: 3, kind: "range" }]
    });
    expect(event.process?.semantic_digest).toBe(process.semantic_digest);
  });

  it("reads resolved membership State from the same immutable Revision", async () => {
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const states = await readStates(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      canon.stateArtifact!
    );

    expect(states).toMatchObject({
      source_revision: canon.pointer.served_revision,
      projection_type: "state",
      algorithm_version: "m4-state-membership-v1",
      items: [
        {
          state_event_id: SYNTHETIC_FIXTURE.stateEventId,
          value: "archive keeper",
          duration: { minimum: 1, maximum: 1, kind: "exact" }
        }
      ]
    });
  });
});
