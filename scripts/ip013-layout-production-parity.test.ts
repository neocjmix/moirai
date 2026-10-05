import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectV5WorldTemporal } from "@moirai/projections";
import { buildV5WorldLayout } from "@moirai/graph-presentation/server";
import {
  createSyntheticLabState,
  SYNTHETIC_LAB_REVISION,
  SYNTHETIC_LAB_TIME_SYSTEM_ID
} from "../apps/atropos-web/src/labs/layout/fixtures";

/** These digests were produced independently by BOTH v5-world-layout.ts and
 * urdr-chart-plane.ts taken verbatim from starting main 4c72666, before their
 * temporary copies were removed. They include shape coordinates, ordering,
 * diagnostics, version and temporal digest, not only counts. */
describe("IP-013 exact starting-main publication layout parity", () => {
  it("preserves /1 all-pair and /2 bounded default JSON bytes", () => {
    const state = createSyntheticLabState();
    const additional = Array.from({ length: 400 }, (_, index) => ({
      ...state.events.find((event) => event.id === "shared")!,
      id: `additional-${index}`
    }));
    const grown = {
      ...state,
      events: [...state.events, ...additional],
      narratives: [
        ...state.narratives,
        ...additional.map((event) => ({
          ...state.narratives.find(
            (narrative) => narrative.scope_id === "shared"
          )!,
          id: `n-${event.id}`,
          scope_id: event.id
        }))
      ]
    };
    for (const [input, version, digest] of [
      [
        state,
        "v5-world-layout/1",
        "da51cf271d35718a7c79aa7baa99bf3907d69cedbd8260acd9125522db8bb53b"
      ],
      [
        grown,
        "v5-world-layout/2",
        "7826d4ff3b493bb1707b1eade484c6d147f35ba58d65612e8e229c35f5f92d95"
      ]
    ] as const) {
      const output = buildV5WorldLayout(
        input,
        projectV5WorldTemporal(input, SYNTHETIC_LAB_REVISION),
        SYNTHETIC_LAB_TIME_SYSTEM_ID
      );
      expect(output.algorithm_version).toBe(version);
      expect(
        createHash("sha256").update(JSON.stringify(output)).digest("hex")
      ).toBe(digest);
    }
  });
});
