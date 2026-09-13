import { expect, it } from "vitest";
import {
  assertSameIdentitySet,
  assertReadbackRevision
} from "./public-readback.js";

it("compares full immutable identity sets, including later additive refinements", () => {
  const expected = [{ id: "coarse" }, { id: "reused" }, { id: "detail" }];
  expect(() =>
    assertSameIdentitySet(
      "Events",
      [expected[2]!, expected[0]!, expected[1]!],
      expected
    )
  ).not.toThrow();
  expect(() =>
    assertSameIdentitySet("Events", expected.slice(0, 2), expected)
  ).toThrow();
  expect(() =>
    assertSameIdentitySet(
      "Events",
      [expected[0]!, expected[0]!, expected[2]!],
      expected
    )
  ).toThrow();
  expect(() =>
    assertSameIdentitySet("Events", [...expected, { id: "invented" }], expected)
  ).toThrow();
});

it("rejects mixed World/revision readbacks without pinning smoke forever to revision one", () => {
  expect(() =>
    assertReadbackRevision("world", 7, {
      world_id: "world",
      served_revision: 7
    })
  ).not.toThrow();
  expect(() =>
    assertReadbackRevision("world", 7, {
      world_id: "world",
      served_revision: 8
    })
  ).toThrow();
  expect(() =>
    assertReadbackRevision("world", 7, {
      world_id: "other",
      served_revision: 7
    })
  ).toThrow();
  expect(() =>
    assertReadbackRevision("world", 0, {
      world_id: "world",
      served_revision: 0
    })
  ).toThrow();
});
