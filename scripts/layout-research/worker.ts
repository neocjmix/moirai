import { solve, defaults, type Candidate, type Parameters } from "./engine.js";
import { metrics } from "./metrics.js";
import { layoutGeometry } from "../../apps/atropos-web/src/labs/layout/geometry.js";
import { validateLabSnapshot } from "../../apps/atropos-web/src/labs/layout/snapshot-validation.js";
import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
import type { LayoutOutput } from "../../packages/graph-presentation/src/layout-engine.js";
interface Request {
  generation: number;
  snapshot: LabSnapshot;
  candidate: Candidate;
  parameters: Parameters;
  primary: string[];
  previous?: LayoutOutput;
}
self.onmessage = (e: MessageEvent<Request>) => {
  try {
    const { generation, snapshot, candidate, parameters, primary, previous } =
      e.data;
    const valid = validateLabSnapshot(snapshot);
    const result = solve(valid, candidate, parameters, previous);
    const geometryStart = performance.now();
    const geometry = layoutGeometry(valid, result.output);
    const geometryMs = performance.now() - geometryStart;
    const quality = metrics(valid, result.output, defaults, primary);
    self.postMessage({
      generation,
      candidate,
      result,
      geometry,
      geometryMs,
      quality
    });
  } catch (error) {
    self.postMessage({
      generation: e.data.generation,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
