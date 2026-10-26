import {
  ALGORITHM,
  RUN_FORMAT,
  DEFAULT_CONFIG,
  MAX_TICK,
  createXSimulation,
  stateDigest,
  type SimulationInput,
  type SimulationConfig,
  type SimulationState
} from "@moirai/layout-simulation";

/** Validate untrusted replay metadata without synchronously replaying a World. */
export function prepareGraphRunImport(input: SimulationInput, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid imported run");
  const run = value as Record<string, unknown>;
  const fields = [
    "format",
    "algorithm",
    "input",
    "config",
    "tick",
    "stateDigest",
    "state"
  ];
  if (
    Object.keys(run).some((key) => !fields.includes(key)) ||
    run.format !== RUN_FORMAT ||
    run.algorithm !== ALGORITHM
  )
    throw Error("Unsupported imported run");
  if (
    typeof run.tick !== "number" ||
    !Number.isInteger(run.tick) ||
    run.tick < 0 ||
    run.tick > MAX_TICK
  )
    throw Error("Invalid imported tick");
  if (
    !run.config ||
    typeof run.config !== "object" ||
    Array.isArray(run.config) ||
    Object.keys(DEFAULT_CONFIG).some((key) => !(key in (run.config as object)))
  )
    throw Error("Import requires the complete force configuration");
  if (
    typeof run.stateDigest !== "string" ||
    !run.state ||
    typeof run.state !== "object"
  )
    throw Error("Import requires a result state and digest");
  const simulation = createXSimulation(
    run.input as SimulationInput,
    run.config as SimulationConfig
  );
  const canonicalInput = createXSimulation(input).exportRun().input;
  if (
    JSON.stringify(simulation.exportRun().input) !==
    JSON.stringify(canonicalInput)
  )
    throw Error(
      "Import belongs to a different World, revision or initial state"
    );
  const expectedState = JSON.stringify(run.state);
  const expectedDigest = run.stateDigest;
  return {
    simulation,
    tick: run.tick,
    verify(state: SimulationState) {
      if (
        state.tick !== run.tick ||
        stateDigest(state) !== expectedDigest ||
        JSON.stringify(state) !== expectedState
      )
        throw Error("Imported result does not reproduce exactly");
      return expectedDigest;
    }
  };
}
