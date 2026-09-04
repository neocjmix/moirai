import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  assertPublicId,
  readCanon,
  readEvent,
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
    expect(event.relations).toHaveLength(2);
    expect(event.temporalPlacements).toHaveLength(1);
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
    expect(timeline.items).toHaveLength(3);
    expect(timeline.items.map((item) => item.event_id)).toEqual([
      SYNTHETIC_FIXTURE.eventId,
      SYNTHETIC_FIXTURE.secondEventId,
      SYNTHETIC_FIXTURE.thirdEventId
    ]);
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
});
