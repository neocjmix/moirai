import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as OrganicSurfaceModule from "../lib/organic-surface";
import type { TstlExperimentClient } from "../lib/tstl-experiment-client";
import type { TstlExperimentArtifact } from "../lib/tstl-experiment-types";
import {
  TSTL_EXPERIMENT_WORLD_ID,
  TSTL_EXPERIMENT_REVISION,
  TSTL_EXPERIMENT_TIME_SYSTEM_ID
} from "../lib/tstl-experiment-types";
import {
  DEFAULT_ORGANIC_PARAMETERS,
  ORGANIC_SURFACE_VERSION,
  type OrganicSurfaceParameters
} from "../lib/organic-surface";
import { organicReproduction } from "../lib/organic-experiment";
import { useTstlLayout } from "./use-tstl-layout";

const observed = vi.hoisted(() => ({
  states: [] as unknown[],
  build: vi.fn()
}));
// Execute the hook's real async actions and ref/ticket ownership without a DOM.
// State commits are observable; no mount effect is needed for explicit restores.
vi.mock("react", () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: () => undefined,
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(initial: T | (() => T)) => {
    const index = observed.states.length;
    const value =
      typeof initial === "function" ? (initial as () => T)() : initial;
    observed.states.push(value);
    return [
      value,
      (next: T | ((current: T) => T)) => {
        observed.states[index] =
          typeof next === "function"
            ? (next as (current: T) => T)(observed.states[index] as T)
            : next;
      }
    ];
  }
}));
vi.mock("../lib/organic-surface", async (importOriginal) => ({
  ...(await importOriginal<typeof OrganicSurfaceModule>()),
  buildOrganicSurfaces: observed.build
}));

let url: URL;
const source = { b0Primitives: [] } as unknown as TstlExperimentArtifact;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let version = 0;
  const client = {
    load: vi.fn(async () => source),
    primitives: vi.fn(async () => []),
    setOrganic: vi.fn(() => ++version)
  };
  const layout = useTstlLayout(
    {
      worldId: TSTL_EXPERIMENT_WORLD_ID,
      revision: TSTL_EXPERIMENT_REVISION,
      timeSystemId: TSTL_EXPERIMENT_TIME_SYSTEM_ID
    },
    client as unknown as TstlExperimentClient
  );
  return { client, layout };
}
async function apply(action: Promise<unknown>) {
  await vi.runAllTimersAsync();
  await action;
}
async function activeOrganic() {
  const result = setup();
  await result.layout.choose("anchored");
  await apply(result.layout.choose("organic"));
  expect(observed.build).toHaveBeenCalledTimes(1);
  return result;
}
beforeEach(() => {
  vi.useFakeTimers();
  observed.states.length = 0;
  observed.build
    .mockReset()
    .mockImplementation(
      ({ parameters }: { parameters: OrganicSurfaceParameters }) => ({
        algorithmVersion: ORGANIC_SURFACE_VERSION,
        parameters,
        baseContoursByCompositeId: {},
        paddedContoursByCompositeId: {},
        composites: [],
        diagnostics: {}
      })
    );
  url = new URL(
    `https://example.test/graph/v5?world=${TSTL_EXPERIMENT_WORLD_ID}`
  );
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    location: {
      get href() {
        return url.href;
      },
      get search() {
        return url.search;
      }
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _unused: string, next: string | URL) => {
        url = new URL(next);
      }
    },
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      }
    }
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("camera and selection history restores keep the applied Organic generation", async () => {
  const { client, layout } = await activeOrganic();
  for (const [key, value] of [
    ["gsViewport", "260,223420,650,1800"],
    ["gsEvent", "shared-event"],
    ["gsCanons", "a,b"]
  ]) {
    url.searchParams.set(key!, value!);
    await layout.choose("organic", false);
  }
  expect(observed.build).toHaveBeenCalledTimes(1);
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
  expect(observed.states[0]).toBe("organic");
  expect(observed.states[5]).toBe(1);
});

it("camera-only restoration does not cancel a pending explicit parameter recompute", async () => {
  const { client, layout } = await activeOrganic();
  const replacement = layout.recomputeOrganic({
    ...DEFAULT_ORGANIC_PARAMETERS,
    threshold: 0.5
  });
  url.searchParams.set("gsViewport", "-10,220000,800,3000");
  await layout.choose("organic", false);
  await apply(replacement);
  expect(observed.build).toHaveBeenCalledTimes(2);
  expect(client.setOrganic).toHaveBeenCalledTimes(2);
  expect(observed.states[4]).toMatchObject({
    parameters: { threshold: 0.5 },
    busy: false,
    error: null
  });
  expect(
    JSON.parse(url.searchParams.get("organic")!).parameters.threshold
  ).toBe(0.5);
});

it.each([
  { baseline: "lanes" as const },
  { display: "overlay" as const },
  { parameters: { ...DEFAULT_ORGANIC_PARAMETERS, relationStrength: 2.1 } }
])("a changed replay specification still applies: %o", async (change) => {
  const { client, layout } = await activeOrganic();
  const repro = {
    ...organicReproduction(
      "anchored",
      DEFAULT_ORGANIC_PARAMETERS,
      "padded",
      ""
    ),
    ...change
  };
  url.searchParams.set("organic", JSON.stringify(repro));
  await apply(layout.choose("organic", false));
  expect(observed.build).toHaveBeenCalledTimes(2);
  expect(client.setOrganic).toHaveBeenCalledTimes(2);
  expect(observed.states[4]).toMatchObject({
    baseline: repro.baseline,
    display: repro.display,
    parameters: repro.parameters
  });
});

it("an Organic history restore supersedes a pending different mode", async () => {
  const { client, layout } = await activeOrganic();
  const pending = deferred<TstlExperimentArtifact>();
  client.load.mockImplementationOnce(() => pending.promise);
  const oldChoice = layout.choose("anchored");
  await apply(layout.choose("organic", false));
  pending.resolve(source);
  await oldChoice;
  expect(observed.states[0]).toBe("organic");
  expect(url.searchParams.get("layoutLab")).toBe("organic");
  expect(observed.states[3]).toHaveProperty("organic");
});

it("a superseded computation cannot commit its artifact after an awaited source read", async () => {
  const { client, layout } = await activeOrganic();
  const pending = deferred<TstlExperimentArtifact>();
  client.load.mockImplementationOnce(() => pending.promise);
  const replacement = layout.recomputeOrganic({
    ...DEFAULT_ORGANIC_PARAMETERS,
    radiusX: 65
  });
  await vi.runAllTimersAsync();
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
  await layout.choose("anchored");
  pending.resolve(source);
  await replacement;
  expect(observed.states[0]).toBe("anchored");
  expect(observed.states[3]).toBe(source);
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
});

it("camera restoration does not silently retry a failed replacement of a valid applied surface", async () => {
  const { client, layout } = await activeOrganic();
  observed.build.mockImplementationOnce(() => {
    throw Error("constructed_failure");
  });
  await apply(
    layout.recomputeOrganic({ ...DEFAULT_ORGANIC_PARAMETERS, threshold: 0.5 })
  );
  url.searchParams.set("gsEvent", "another-event");
  await layout.choose("organic", false);
  expect(observed.build).toHaveBeenCalledTimes(2);
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
  expect(observed.states[4]).toMatchObject({
    parameters: DEFAULT_ORGANIC_PARAMETERS,
    busy: false,
    error: "constructed_failure"
  });
});

it("an initial replay without an applied result still computes the pinned surface", async () => {
  const { client, layout } = setup();
  url.searchParams.set("organicBaseline", "anchored");
  await apply(layout.choose("organic", false));
  expect(observed.build).toHaveBeenCalledTimes(1);
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
  expect(observed.states[0]).toBe("organic");
});

it("a superseded display change cannot overwrite the newly selected mode's artifact", async () => {
  const { client, layout } = await activeOrganic();
  const pending = deferred<TstlExperimentArtifact>();
  client.load.mockImplementationOnce(() => pending.promise);
  const display = layout.setOrganicDisplay("overlay");
  await vi.runAllTimersAsync();
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
  await layout.choose("anchored");
  pending.resolve(source);
  await display;
  expect(observed.states[0]).toBe("anchored");
  expect(observed.states[3]).toBe(source);
  expect(client.setOrganic).toHaveBeenCalledTimes(1);
});
