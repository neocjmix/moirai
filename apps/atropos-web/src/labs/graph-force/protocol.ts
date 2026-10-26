import type {
  Diagnostics,
  SimulationConfig,
  SimulationState,
  ExportedRun
} from "@moirai/layout-simulation";
import type { GraphShellViewportResponse } from "../../urdr-port/shared/contracts";
import type { LayoutV2Snapshot } from "../../lib/layout-v2-types";
export type Scope = { collectionIds: string[]; relationTypes: string[] };
export type WorkerRequest =
  | {
      type: "init";
      sessionId: string;
      snapshot: LayoutV2Snapshot;
      scope: Scope;
    }
  | { type: "target"; requestId: number; tick: number }
  | { type: "play"; requestId: number; enabled: boolean }
  | { type: "config"; requestId: number; config: SimulationConfig }
  | { type: "import"; requestId: number; run: unknown }
  | { type: "scope"; scope: Scope }
  | { type: "ack"; frameId: number }
  | { type: "export" };
export type Frame = {
  type: "frame";
  sessionId: string;
  requestId: number;
  frameId: number;
  state: SimulationState;
  diagnostics: Diagnostics;
  viewport: GraphShellViewportResponse;
  config: SimulationConfig;
};
export type WorkerResponse =
  | Frame
  | { type: "error"; message: string }
  | { type: "export"; run: ExportedRun }
  | { type: "imported"; requestId: number; tick: number; stateDigest: string };
