import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import { assertPublicId, readCanon, readEvent, readWorld } from "./publication";

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
    expect(world.pointer.served_revision).toBe(1);
    expect(canon.pointer.served_revision).toBe(1);
    expect(event.pointer.served_revision).toBe(1);
    expect(event.event.title).toBe(SYNTHETIC_FIXTURE.eventTitle);
  });

  it("rejects path-like public identifiers", () => {
    expect(() => assertPublicId("../../private")).toThrow();
  });
});
