import { expect, it } from "vitest";
import {
  parseTstlLayoutChoice,
  tstlLayoutAvailable,
  tstlLayoutStorageKey
} from "./tstl-layout-preference";
import {
  TSTL_EXPERIMENT_REVISION,
  TSTL_EXPERIMENT_TIME_SYSTEM_ID,
  TSTL_EXPERIMENT_WORLD_ID
} from "./tstl-experiment-types";

it("restores named and previous candidates without converting unknown values to an experiment", () => {
  for (const mode of [
    "current",
    "B0",
    "A",
    "B",
    "C",
    "bubble",
    "ribbon",
    "lanes",
    "aligned",
    "anchored",
    "organic"
  ] as const) {
    const url = new URL(`https://example.test/graph/v5?layoutLab=${mode}`);
    expect(parseTstlLayoutChoice(url.searchParams.get("layoutLab"))).toBe(mode);
  }
  for (const value of [
    null,
    "",
    "b",
    "c",
    "D",
    "B0,A",
    "A ",
    "Bubble",
    "Ribbon"
  ]) {
    expect(parseTstlLayoutChoice(value) ?? "current").toBe("current");
  }
});

it("restricts all experiment choices to the pinned World, revision and time system", () => {
  const scope = {
    worldId: TSTL_EXPERIMENT_WORLD_ID,
    revision: TSTL_EXPERIMENT_REVISION,
    timeSystemId: TSTL_EXPERIMENT_TIME_SYSTEM_ID
  };
  expect(tstlLayoutAvailable(scope)).toBe(true);
  expect(tstlLayoutAvailable({ ...scope, worldId: "other-world" })).toBe(false);
  expect(tstlLayoutAvailable({ ...scope, revision: scope.revision + 1 })).toBe(
    false
  );
  expect(tstlLayoutAvailable({ ...scope, timeSystemId: "other-time" })).toBe(
    false
  );
  expect(tstlLayoutStorageKey(scope.worldId)).not.toBe(
    tstlLayoutStorageKey("other-world")
  );
  expect(tstlLayoutStorageKey(scope.worldId)).toContain(
    `:r${TSTL_EXPERIMENT_REVISION}`
  );
});
