import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  solveTemporalConstraints,
  TemporalAdapterRegistry,
  createGregorianUtcAdapter,
  type TemporalConstraint
} from "../packages/domain/src/temporal.js";

it("preserves baseline solver output across ordered mixed temporal graphs", () => {
  let seed = 29103;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  const registry = new TemporalAdapterRegistry([
    createGregorianUtcAdapter("clock", "1")
  ]);
  const hash = createHash("sha256");
  for (let sample = 0; sample < 100; sample++) {
    const reference = () =>
      random() % 4 === 0
        ? {
            kind: "time_event" as const,
            time_system_ref: { time_system_id: "clock" },
            definition_version: "1",
            coordinate: `144${random() % 8}-01-01T00:00:00.000000000000Z`
          }
        : { kind: "event" as const, event_id: `event-${random() % 9}` };
    const constraints: TemporalConstraint[] = Array.from(
      { length: 24 },
      (_, i) => ({
        id: `constraint-${i}`,
        type: (["precedes", "not_after", "coincides"] as const)[random() % 3]!,
        source: reference(),
        target: reference()
      })
    );
    hash.update(
      JSON.stringify(solveTemporalConstraints(constraints, registry))
    );
  }
  // Captured from the unchanged solver at main 28c1d375, independently rerun.
  expect(hash.digest("hex")).toBe(
    "70520345d7adcfaf73af332ec70014ec195485202e2b8c30c13d083c710feae5"
  );
});
