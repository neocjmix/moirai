import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { describe, expect, it } from "vitest";
import {
  assertPublicId,
  readCanon,
  readEvent,
  readRelationalTime,
  readSubject,
  readWorld,
  selectPublication
} from "./publication";

describe("Atropos Revision-pinned Event/Relation reader", () => {
  it("reads Canon, Event and relational time from one immutable Revision", async () => {
    const selected = await selectPublication(SYNTHETIC_FIXTURE.worldId);
    const world = await readWorld(SYNTHETIC_FIXTURE.worldId, selected);
    const canon = await readCanon(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId
    );
    const event = await readEvent(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      SYNTHETIC_FIXTURE.eventId
    );
    const temporal = await readRelationalTime(
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      canon.temporalArtifact!,
      selected
    );
    expect(world.pointer.served_revision).toBe(2);
    expect(event.pointer.served_revision).toBe(2);
    expect(event.event.title).toBe(SYNTHETIC_FIXTURE.eventTitle);
    expect(
      event.relations.every(
        (relation) => relation.source_ref && relation.target_ref
      )
    ).toBe(true);
    expect(temporal.source_revision).toBe(2);
    expect(temporal.projection_type).toBe("event_relational_time");
  });

  it("reads a Subject derived from tagged Event endpoints", async () => {
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
    expect(subject.document.subject?.member_event_ids).toEqual(
      expect.arrayContaining([
        SYNTHETIC_FIXTURE.eventId,
        SYNTHETIC_FIXTURE.secondEventId
      ])
    );
  });

  it("rejects path-like public identifiers", () => {
    expect(() => assertPublicId("../../private")).toThrow();
  });
});
