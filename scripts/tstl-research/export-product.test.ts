import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadHistorySnapshot, replayBaseline, sha256 } from "./baseline.js";
import { buildTstlComparison } from "./candidate.js";
import { exportProductExperiment } from "./export-product.js";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "../../apps/atropos-web/src/lib/tstl-experiment-pin.js";

it("reproduces every shipped experiment from unchanged history-r56", () => {
  const snapshot = loadHistorySnapshot();
  const baseline = replayBaseline(snapshot).artifact;
  const comparison = buildTstlComparison(snapshot, baseline).artifact;
  const value = exportProductExperiment(baseline, comparison);
  const body = JSON.stringify(value) + "\n";
  expect(body).toBe(
    readFileSync(`apps/atropos-web/public${TSTL_EXPERIMENT_ASSET_URL}`, "utf8")
  );
  expect(sha256(body)).toBe(TSTL_EXPERIMENT_SHA256);
  for (const candidate of [value.b, value.c]) {
    expect(candidate.diagnostics!.leafMemberships).toBe(1390);
    expect(
      candidate.diagnostics!.leafRoutedMemberships! +
        candidate.diagnostics!.leafListMemberships!
    ).toBe(1390);
  }
  for (const candidate of [value.bubble, value.ribbon]) {
    expect(candidate.fillRule).toBe("evenodd");
    expect(candidate.diagnostics!.leafMemberships).toBe(1390);
    expect(
      candidate.diagnostics!.leafAreaMemberships! +
        candidate.diagnostics!.leafListMemberships!
    ).toBe(1390);
    expect(candidate.diagnostics!.nonmemberIntersections).toBe(0);
    expect(candidate.diagnostics!.selfIntersections).toBe(0);
  }
}, 30_000);
