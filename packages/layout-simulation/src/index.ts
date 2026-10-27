import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from "d3-force";

export const ALGORITHM = "d3-fixed-y/2";
export const RUN_FORMAT = "layout-lab-v2-run/1";
/** A synchronous replay safety limit, not a cooling or convergence horizon. */
export const MAX_TICK = 10_000;
/** World-size guard; interactive callers run physics in a Worker. */
export const MAX_NODES = 2_000;
export const MAX_LINKS = 16_000;
export interface InputNode {
  id: string;
  y: number;
  radius?: number;
  x?: number;
}
export interface InputLink {
  id: string;
  source: string;
  target: string;
  kind?: string;
  distance?: number;
  strength?: number;
}
export interface SimulationInput {
  nodes: readonly InputNode[];
  links: readonly InputLink[];
  groups?: readonly { id: string; members: readonly string[] }[];
  source?: { worldId: string; revision: number; digest: string };
}
export interface SimulationConfig {
  seed: number;
  initialSpread: number;
  alphaInitial: number;
  alphaTarget: number;
  alphaDecay: number;
  velocityDecay: number;
  repulsionStrength: number;
  compositeAttraction: number;
  compositeRepulsion: number;
  linkStrength: number;
  linkDistance: number;
  centerStrength: number;
  centerX: number;
  collisionStrength: number;
  collisionIterations: number;
  stabilityWindow: number;
  displacementTolerance: number;
  forceTolerance: number;
}
export const DEFAULT_CONFIG: Readonly<SimulationConfig> = Object.freeze({
  seed: 1,
  initialSpread: 160,
  alphaInitial: 1,
  alphaTarget: 1,
  alphaDecay: 0,
  velocityDecay: 0.4,
  repulsionStrength: 24,
  compositeAttraction: 0.04,
  compositeRepulsion: 24,
  linkStrength: 0.04,
  linkDistance: 40,
  centerStrength: 0.008,
  centerX: 0,
  collisionStrength: 0.8,
  collisionIterations: 1,
  stabilityWindow: 20,
  displacementTolerance: 0.01,
  forceTolerance: 0.02
});
export interface SimulationState {
  algorithm: typeof ALGORITHM;
  tick: number;
  alpha: number;
  nodes: { id: string; x: number; y: number; vx: number }[];
  hubs?: { id: string; x: number; y: number; vx: number }[];
}
export interface Movement {
  rmsDisplacement: number;
  maxDisplacement: number;
  rmsVelocity: number;
  rmsForceImpulse: number;
  maxForceImpulse: number;
}
export interface Diagnostics {
  movement: Movement;
  quality: {
    collisionCount: number;
    maxPenetration: number;
    relationStrain: {
      kind: string;
      count: number;
      rms: number;
      impossibleYCount: number;
    }[];
    xVariance: number;
    xSpan: number;
  };
  stability: {
    status: "warming-up" | "moving" | "balanced" | "damping-stalled" | "cooled";
    windowTicks: number;
    rmsTrend: number;
  };
  /** Timing is deliberately excluded from physical state and replay identity. */
  elapsedMs: number;
}
export interface ExportedRun {
  format: typeof RUN_FORMAT;
  algorithm: typeof ALGORITHM;
  input: SimulationInput;
  config: SimulationConfig;
  tick: number;
  stateDigest: string;
  state: SimulationState;
}
interface Node extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fy: number;
  radius: number;
}
interface Link extends SimulationLinkDatum<Node> {
  id: string;
  source: string | Node;
  target: string | Node;
  kind: string;
  distance: number;
  strength: number;
}
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const rms = (values: number[]): number =>
  Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / (values.length || 1));
const zeroMovement = (): Movement => ({
  rmsDisplacement: 0,
  maxDisplacement: 0,
  rmsVelocity: 0,
  rmsForceImpulse: 0,
  maxForceImpulse: 0
});
function object(
  value: unknown,
  fields: readonly string[],
  label: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!fields.includes(key))
      throw new Error(`Unknown ${label} field: ${key}`);
  return result;
}
function number(value: unknown, label: string, min = -1e9, max = 1e9): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`Invalid ${label}`);
  return value;
}
function integer(
  value: unknown,
  label: string,
  min: number,
  max: number
): number {
  const result = number(value, label, min, max);
  if (!Number.isInteger(result)) throw new Error(`Invalid integer ${label}`);
  return result;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512)
    throw new Error(`Invalid ${label}`);
  return value;
}
function canonicalInput(value: unknown): SimulationInput {
  const input = object(value, ["nodes", "links", "groups", "source"], "input");
  if (
    !Array.isArray(input.nodes) ||
    input.nodes.length > MAX_NODES ||
    !Array.isArray(input.links) ||
    input.links.length > MAX_LINKS
  )
    throw new Error(
      `Input requires at most ${MAX_NODES} nodes and ${MAX_LINKS} links`
    );
  const ids = new Set<string>();
  const nodes = input.nodes
    .map((v): InputNode => {
      const n = object(v, ["id", "y", "radius", "x"], "node");
      const id = string(n.id, "node id");
      if (ids.has(id)) throw new Error(`Duplicate node: ${id}`);
      ids.add(id);
      return {
        id,
        y: number(n.y, "node y"),
        radius:
          n.radius === undefined ? 5 : number(n.radius, "node radius", 0, 1e4),
        ...(n.x === undefined ? {} : { x: number(n.x, "initial x") })
      };
    })
    .sort((a, b) => compare(a.id, b.id));
  const linkIds = new Set<string>();
  const links = input.links
    .map((v): InputLink => {
      const l = object(
        v,
        ["id", "source", "target", "kind", "distance", "strength"],
        "link"
      );
      const id = string(l.id, "link id"),
        source = string(l.source, "source"),
        target = string(l.target, "target");
      if (
        linkIds.has(id) ||
        !ids.has(source) ||
        !ids.has(target) ||
        source === target
      )
        throw new Error(`Invalid link: ${id}`);
      linkIds.add(id);
      return {
        id,
        source,
        target,
        kind: l.kind === undefined ? "link" : string(l.kind, "link kind"),
        ...(l.distance === undefined
          ? {}
          : { distance: number(l.distance, "link distance", 0, 1e6) }),
        ...(l.strength === undefined
          ? {}
          : { strength: number(l.strength, "link multiplier", 0, 1) })
      };
    })
    .sort((a, b) => compare(a.id, b.id));
  let groups: SimulationInput["groups"];
  if (input.groups !== undefined) {
    if (!Array.isArray(input.groups) || input.groups.length > MAX_NODES)
      throw Error("Invalid groups");
    const groupIds = new Set<string>();
    let memberships = 0;
    groups = input.groups
      .map((value) => {
        const group = object(value, ["id", "members"], "group");
        const id = string(group.id, "group id");
        if (
          ids.has(id) ||
          groupIds.has(id) ||
          !Array.isArray(group.members) ||
          !group.members.length
        )
          throw Error("Invalid group");
        groupIds.add(id);
        const members = group.members.map((member) => string(member, "member"));
        memberships += members.length;
        if (
          memberships > MAX_LINKS ||
          new Set(members).size !== members.length ||
          members.some((member) => !ids.has(member))
        )
          throw Error("Invalid group members");
        return { id, members: members.sort(compare) };
      })
      .sort((a, b) => compare(a.id, b.id));
  }
  const groupInput = groups === undefined ? {} : { groups };
  if (input.source === undefined) return { nodes, links, ...groupInput };
  const source = object(
    input.source,
    ["worldId", "revision", "digest"],
    "source"
  );
  return {
    nodes,
    links,
    ...groupInput,
    source: {
      worldId: string(source.worldId, "world id"),
      revision: integer(
        source.revision,
        "revision",
        0,
        Number.MAX_SAFE_INTEGER
      ),
      digest: string(source.digest, "source digest")
    }
  };
}
function configFor(value: unknown): SimulationConfig {
  const raw = object(value, Object.keys(DEFAULT_CONFIG), "config");
  const config = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(raw) as (keyof SimulationConfig)[])
    config[key] = number(
      raw[key],
      key,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER
    );
  integer(config.seed, "seed", 0, 0xffffffff);
  for (const key of [
    "alphaInitial",
    "alphaTarget",
    "alphaDecay",
    "velocityDecay",
    "compositeAttraction",
    "linkStrength",
    "centerStrength",
    "collisionStrength"
  ] as const)
    number(config[key], key, 0, 1);
  for (const key of [
    "initialSpread",
    "repulsionStrength",
    "compositeRepulsion",
    "linkDistance",
    "displacementTolerance",
    "forceTolerance"
  ] as const)
    number(config[key], key, 0, 1e6);
  integer(config.collisionIterations, "collisionIterations", 1, 8);
  integer(config.stabilityWindow, "stabilityWindow", 2, 1000);
  return config;
}
function randomSource(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
/** Compact replay checksum, not a cryptographic source/authenticity digest. */
export function stateDigest(state: SimulationState): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(state))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
export function createXSimulation(
  rawInput: SimulationInput,
  partialConfig: Partial<SimulationConfig> = {}
) {
  const input = canonicalInput(rawInput),
    config = configFor(partialConfig);
  let hubs: Node[] = [];
  let nodes: Node[] = [],
    links: Link[] = [];
  let tickIndex = 0,
    elapsedMs = 0;
  let movement = zeroMovement();
  let window: Movement[] = [];
  let beforeVelocity: number[] = [];
  let forceImpulses: number[] = [];
  function initialize() {
    const random = randomSource(config.seed);
    nodes = input.nodes.map((n) => ({
      id: n.id,
      x: n.x ?? (random() - 0.5) * config.initialSpread,
      y: n.y,
      fy: n.y,
      vx: 0,
      vy: 0,
      radius: n.radius ?? 5
    }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    links = input.links.map((l) => ({
      id: l.id,
      source: nodeById.get(l.source)!,
      target: nodeById.get(l.target)!,
      kind: l.kind ?? "link",
      distance: l.distance ?? config.linkDistance,
      strength: (l.strength ?? 1) * config.linkStrength
    }));
    hubs = (input.groups ?? []).map((g) => ({
      id: g.id,
      x: 0,
      y:
        g.members.reduce((sum, id) => sum + nodeById.get(id)!.y, 0) /
        g.members.length,
      fy:
        g.members.reduce((sum, id) => sum + nodeById.get(id)!.y, 0) /
        g.members.length,
      vx: 0,
      vy: 0,
      radius: 0
    }));
    const simulation = forceSimulation([...nodes, ...hubs])
      .stop()
      .randomSource(randomSource(config.seed ^ 0x9e3779b9))
      .alpha(config.alphaInitial)
      .alphaTarget(config.alphaTarget)
      .alphaDecay(config.alphaDecay)
      .velocityDecay(config.velocityDecay);
    if (config.repulsionStrength > 0)
      simulation.force(
        "repulsion",
        (() => {
          const force = forceManyBody<Node>().strength(
            -config.repulsionStrength
          );
          force.initialize(nodes, randomSource(config.seed ^ 0x12345678));
          return (alpha: number) => force(alpha);
        })()
      );
    if (config.compositeAttraction > 0)
      simulation.force("composite-hub-attraction", (alpha) => {
        for (let i = 0; i < hubs.length; i++) {
          const hub = hubs[i]!,
            group = input.groups![i]!;
          // X-only zero-rest-length springs. Equal total weight per Composite;
          // hub reaction uses its member count as mass. No leaf-to-leaf edges.
          for (const id of group.members) {
            const member = nodeById.get(id)!;
            const impulse =
              ((hub.x - member.x) * config.compositeAttraction * alpha) /
              group.members.length;
            member.vx += impulse;
            hub.vx -= impulse / group.members.length;
          }
        }
      });
    if (config.compositeRepulsion > 0 && hubs.length > 1) {
      const force = forceManyBody<Node>().strength(-config.compositeRepulsion);
      force.initialize(hubs, randomSource(config.seed ^ 0x87654321));
      simulation.force("composite-hub-repulsion", (alpha) => force(alpha));
    }
    // d3's standard link geometry uses full XY separation; fy projects Y back
    // each tick. |dy| > distance is an unavoidable strain, never a Y adjustment.
    if (config.linkStrength > 0)
      simulation.force(
        "attraction",
        forceLink<Node, Link>(links)
          .id((n) => n.id)
          .distance((l) => l.distance)
          .strength((l) => l.strength)
      );
    if (config.centerStrength > 0)
      simulation.force(
        "center",
        forceX<Node>(config.centerX).strength(config.centerStrength)
      );
    if (config.collisionStrength > 0)
      simulation.force("collision", () => {
        for (let pass = 0; pass < config.collisionIterations; pass++)
          for (let i = 0; i < nodes.length; i++)
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i]!,
                b = nodes[j]!,
                radius = a.radius + b.radius,
                dy = b.y - a.y;
              if (Math.abs(dy) >= radius) continue;
              const requiredX = Math.sqrt(radius * radius - dy * dy);
              const dx = b.x + b.vx - (a.x + a.vx);
              if (Math.abs(dx) >= requiredX) continue;
              // Equal mass, deterministic tie direction; no forbidden Y impulse.
              const impulse =
                ((requiredX - Math.abs(dx)) * config.collisionStrength) / 2;
              const direction = dx < 0 ? -1 : 1;
              a.vx -= direction * impulse;
              b.vx += direction * impulse;
            }
      });
    simulation.force("observe-before-damping", () => {
      forceImpulses = [...nodes, ...hubs].map(
        (n, i) => n.vx - (beforeVelocity[i] ?? 0)
      );
    });
    tickIndex = 0;
    elapsedMs = 0;
    movement = zeroMovement();
    window = [];
    return simulation;
  }
  let simulation = initialize();
  function state(): SimulationState {
    return {
      algorithm: ALGORITHM,
      tick: tickIndex,
      alpha: simulation.alpha(),
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, vx: n.vx })),
      ...(input.groups === undefined
        ? {}
        : { hubs: hubs.map((n) => ({ id: n.id, x: n.x, y: n.y, vx: n.vx })) })
    };
  }
  function tick(count = 1): SimulationState {
    integer(count, "tick count", 0, MAX_TICK);
    if (tickIndex + count > MAX_TICK)
      throw new Error(`P1 tick limit is ${MAX_TICK}`);
    const started = performance.now();
    for (let t = 0; t < count; t++) {
      const particles = [...nodes, ...hubs];
      const beforeX = particles.map((n) => n.x);
      beforeVelocity = particles.map((n) => n.vx);
      simulation.tick();
      if (
        particles.some((n) => !Number.isFinite(n.x) || !Number.isFinite(n.vx))
      )
        throw new Error("Simulation diverged: non-finite state");
      const displacement = particles.map((n, i) => n.x - beforeX[i]!);
      movement = {
        rmsDisplacement: rms(displacement),
        maxDisplacement: Math.max(0, ...displacement.map(Math.abs)),
        rmsVelocity: rms(particles.map((n) => n.vx)),
        rmsForceImpulse: rms(forceImpulses),
        maxForceImpulse: Math.max(0, ...forceImpulses.map(Math.abs))
      };
      window.push(movement);
      if (window.length > config.stabilityWindow) window.shift();
      tickIndex++;
    }
    elapsedMs += performance.now() - started;
    return state();
  }
  function seek(target: number): SimulationState {
    integer(target, "target tick", 0, MAX_TICK);
    if (target < tickIndex) simulation = initialize();
    return tick(target - tickIndex);
  }
  function diagnostics(): Diagnostics {
    const started = performance.now();
    let collisionCount = 0,
      maxPenetration = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!,
          b = nodes[j]!,
          penetration = a.radius + b.radius - Math.hypot(b.x - a.x, b.y - a.y);
        if (penetration > 1e-6) {
          collisionCount++;
          maxPenetration = Math.max(maxPenetration, penetration);
        }
      }
    const strains = new Map<
      string,
      { count: number; sum: number; impossibleYCount: number }
    >();
    for (const l of links) {
      const a = l.source as Node,
        b = l.target as Node;
      const strain = Math.hypot(b.x - a.x, b.y - a.y) - l.distance;
      const entry = strains.get(l.kind) ?? {
        count: 0,
        sum: 0,
        impossibleYCount: 0
      };
      entry.count++;
      entry.sum += strain * strain;
      if (Math.abs(b.y - a.y) > l.distance) entry.impossibleYCount++;
      strains.set(l.kind, entry);
    }
    const xs = nodes.map((n) => n.x),
      mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const still =
      window.length === config.stabilityWindow &&
      window.every((m) => m.maxDisplacement <= config.displacementTolerance);
    const balanced = window.every(
      (m) => m.maxForceImpulse <= config.forceTolerance
    );
    const half = Math.floor(window.length / 2);
    const average = (items: Movement[]) =>
      items.reduce((sum, m) => sum + m.rmsDisplacement, 0) /
      (items.length || 1);
    const rmsTrend =
      average(window.slice(half)) - average(window.slice(0, half));
    const stableTrend = Math.abs(rmsTrend) <= config.displacementTolerance / 2;
    const status: Diagnostics["stability"]["status"] =
      window.length < config.stabilityWindow
        ? "warming-up"
        : !still || !stableTrend
          ? "moving"
          : simulation.alpha() < 1
            ? "cooled"
            : balanced
              ? "balanced"
              : "damping-stalled";
    const result: Diagnostics = {
      movement: { ...movement },
      quality: {
        collisionCount,
        maxPenetration,
        relationStrain: [...strains]
          .sort(([a], [b]) => compare(a, b))
          .map(([kind, s]) => ({
            kind,
            count: s.count,
            rms: Math.sqrt(s.sum / s.count),
            impossibleYCount: s.impossibleYCount
          })),
        xVariance:
          xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (xs.length || 1),
        xSpan: xs.length ? Math.max(...xs) - Math.min(...xs) : 0
      },
      stability: {
        status,
        windowTicks: window.length,
        rmsTrend
      },
      elapsedMs: elapsedMs + performance.now() - started
    };
    return result;
  }
  function exportRun(): ExportedRun {
    return {
      format: RUN_FORMAT,
      algorithm: ALGORITHM,
      input: structuredClone(input),
      config: { ...config },
      tick: tickIndex,
      stateDigest: stateDigest(state()),
      state: state()
    };
  }
  return { state, tick, seek, diagnostics, exportRun };
}
export type XSimulation = ReturnType<typeof createXSimulation>;
export function importRun(value: unknown): XSimulation {
  const raw = object(
    value,
    ["format", "algorithm", "input", "config", "tick", "stateDigest", "state"],
    "run"
  );
  if (raw.format !== RUN_FORMAT || raw.algorithm !== ALGORITHM)
    throw new Error("Unsupported run format or algorithm");
  const tick = integer(raw.tick, "replay tick", 0, MAX_TICK);
  const rawConfig = object(raw.config, Object.keys(DEFAULT_CONFIG), "config");
  if (Object.keys(DEFAULT_CONFIG).some((key) => rawConfig[key] === undefined))
    throw new Error("Run must include the complete configuration");
  const input = canonicalInput(raw.input),
    config = configFor(rawConfig);
  // JSON is untrusted. Bound synchronous import work; ordinary UI stepping can
  // still explore the full tick range with small batches.
  if (
    (input.nodes.length * input.nodes.length * config.collisionIterations +
      (input.groups?.length ?? 0) ** 2 +
      (input.groups ?? []).reduce(
        (sum, group) => sum + group.members.length,
        0
      ) +
      input.links.length) *
      tick >
    25_000_000
  )
    throw new Error("Replay is too large for synchronous P1 import");
  const simulation = createXSimulation(input, config);
  simulation.seek(tick);
  if (
    stateDigest(simulation.state()) !==
      string(raw.stateDigest, "state digest") ||
    JSON.stringify(raw.state) !== JSON.stringify(simulation.state())
  )
    throw new Error("Replay state mismatch");
  return simulation;
}
export const SYNTHETIC_INPUT: SimulationInput = {
  nodes: Array.from({ length: 20 }, (_, i) => ({
    id: `event-${i.toString().padStart(2, "0")}`,
    y: Math.floor(i / 5) * 35,
    radius: 7
  })),
  links: Array.from({ length: 15 }, (_, i) => ({
    id: `link-${i}`,
    source: `event-${i.toString().padStart(2, "0")}`,
    target: `event-${(i + 5).toString().padStart(2, "0")}`,
    kind: "synthetic"
  }))
};
