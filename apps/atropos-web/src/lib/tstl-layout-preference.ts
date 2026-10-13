import {
  TSTL_EXPERIMENT_REVISION,
  TSTL_EXPERIMENT_TIME_SYSTEM_ID,
  TSTL_EXPERIMENT_WORLD_ID,
  type TstlExperimentMode
} from "./tstl-experiment-types";

export type TstlLayoutChoice = "current" | TstlExperimentMode;
export const TSTL_LAYOUT_QUERY = "layoutLab";

export function parseTstlLayoutChoice(
  value: string | null
): TstlLayoutChoice | null {
  return value === "current" ||
    value === "B0" ||
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "bubble" ||
    value === "ribbon"
    ? value
    : null;
}

export function tstlLayoutAvailable(scope: {
  worldId: string;
  revision: number;
  timeSystemId: string;
}) {
  return (
    scope.worldId === TSTL_EXPERIMENT_WORLD_ID &&
    scope.revision === TSTL_EXPERIMENT_REVISION &&
    scope.timeSystemId === TSTL_EXPERIMENT_TIME_SYSTEM_ID
  );
}

export function tstlLayoutStorageKey(worldId: string) {
  return `moirai:tstl-layout:${worldId}:r${TSTL_EXPERIMENT_REVISION}`;
}
