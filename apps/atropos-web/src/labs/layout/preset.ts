import {
  computeLayout,
  getLayoutAlgorithm,
  type LayoutSelection
} from "@moirai/graph-presentation/layout-engine";
import {
  REPRESENTATION_CONFIG_VERSION,
  DEFAULT_REPRESENTATION_CONFIG,
  validateRepresentationConfig,
  type RepresentationConfig,
  type RepresentationHistory
} from "./representation";
import { snapshotDigestPayload, type LabSnapshot } from "./types";
import { validateLabSnapshot } from "./snapshot-validation";

export interface LabCamera {
  x: number;
  y: number;
  spanX: number;
  spanY: number;
}
export interface LabCandidate {
  layout: LayoutSelection;
  representation: RepresentationConfig;
}
export interface LabPreset {
  formatVersion: "layout-lab-preset/2";
  algorithm: string;
  algorithmVersion: string;
  parameters: LayoutSelection["parameters"];
  seed: null;
  worldId: string;
  revision: number;
  servedRevision: number;
  inputDigest: string;
  representationConfigVersion: string;
  representation: RepresentationConfig;
  before: LabCandidate;
  camera: LabCamera;
  viewport: { width: number; height: number };
  activeCollectionIds: string[];
  includeUncollected: boolean;
  history: { before: RepresentationHistory; after: RepresentationHistory };
  /** A public immutable research input, so a later served revision cannot silently replace it. */
  snapshot: LabSnapshot;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("설정은 JSON object여야 합니다.");
  return value as Record<string, unknown>;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
const representation = validateRepresentationConfig;
function selection(value: unknown): LayoutSelection {
  const source = object(value);
  const algorithm = getLayoutAlgorithm(String(source.algorithm));
  if (
    !algorithm ||
    source.algorithmVersion !== algorithm.version ||
    source.seed !== null
  )
    throw Error("지원하지 않는 algorithm/version/seed입니다.");
  const values = object(source.parameters);
  if (Object.keys(values).length !== algorithm.parameters.length)
    throw Error("Algorithm parameter schema가 일치하지 않습니다.");
  for (const field of algorithm.parameters) {
    const v = values[field.key];
    if (field.kind === "number") {
      if (!finite(v) || v < field.min || v > field.max)
        throw Error(`Layout 값 범위 초과: ${field.key}`);
    } else if (!field.options.some((option) => option.value === v)) {
      throw Error(`잘못된 layout 값: ${field.key}`);
    }
  }
  return {
    algorithm: algorithm.id,
    algorithmVersion: algorithm.version,
    parameters: { ...values } as LayoutSelection["parameters"],
    seed: null
  };
}
function history(value: unknown, ids: Set<string>): RepresentationHistory {
  const source = object(value);
  for (const [id, raw] of Object.entries(source)) {
    const item = object(raw);
    if (
      !ids.has(id) ||
      typeof item.compact !== "boolean" ||
      typeof item.normal !== "boolean"
    )
      throw Error("전환 history가 snapshot과 일치하지 않습니다.");
  }
  return source as unknown as RepresentationHistory;
}

/** Import fails closed on a version/revision/digest mismatch. Never fetch a replacement World. */
export async function parseLabPreset(text: string): Promise<LabPreset> {
  if (text.length > 16 * 1024 * 1024)
    throw Error("설정 파일은 16 MiB 이하여야 합니다.");
  const raw = object(JSON.parse(text));
  if (
    (raw.formatVersion !== "layout-lab-preset/1" &&
      raw.formatVersion !== "layout-lab-preset/2") ||
    (raw.representationConfigVersion !== REPRESENTATION_CONFIG_VERSION &&
      raw.representationConfigVersion !== "lab-representation/1")
  )
    throw Error("지원하지 않는 preset/representation version입니다.");
  const snapshot = validateLabSnapshot(raw.snapshot);
  if (
    snapshot.formatVersion !== "layout-lab-snapshot/1" ||
    raw.worldId !== snapshot.worldId ||
    raw.revision !== snapshot.sourceRevision ||
    raw.servedRevision !== snapshot.servedRevision ||
    raw.inputDigest !== snapshot.inputDigest ||
    snapshot.input.worldId !== snapshot.worldId ||
    snapshot.input.revision !== snapshot.sourceRevision
  )
    throw Error("World/revision/snapshot이 일치하지 않습니다.");
  const payload = snapshotDigestPayload(snapshot);
  const digest = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))
    )
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== snapshot.inputDigest)
    throw Error("Snapshot digest가 일치하지 않습니다.");
  const afterLayout = selection(raw);
  const restoreRepresentation = (value: unknown) => {
    if (raw.representationConfigVersion !== "lab-representation/1")
      return representation(value);
    const legacy = object(value);
    const added = [
      "hullOpacityScale",
      "ordinaryPointOpacityScale",
      "smallPointOpacityScale",
      "hullLabelOpacity",
      "ordinaryLabelOpacity",
      "smallLabelOpacity"
    ];
    if (added.some((key) => key in legacy))
      throw Error("Invalid legacy representation version");
    // Version 1 had these exact fixed weights; migration preserves its view.
    return representation({
      ...Object.fromEntries(
        added.map((key) => [
          key,
          DEFAULT_REPRESENTATION_CONFIG[key as keyof RepresentationConfig]
        ])
      ),
      ...legacy
    });
  };
  const beforeRaw = object(raw.before);
  const before = {
    layout: selection(beforeRaw.layout),
    representation: restoreRepresentation(beforeRaw.representation)
  };
  const camera = object(raw.camera) as unknown as LabCamera;
  if (
    ![camera.x, camera.y, camera.spanX, camera.spanY].every(finite) ||
    camera.spanX <= 0 ||
    camera.spanY <= 0
  )
    throw Error("유효한 camera가 필요합니다.");
  const viewport = object(raw.viewport);
  if (
    !finite(viewport.width) ||
    viewport.width < 240 ||
    viewport.width > 2000 ||
    !finite(viewport.height) ||
    viewport.height < 200 ||
    viewport.height > 2000 ||
    (raw.formatVersion === "layout-lab-preset/1" && viewport.height !== 430)
  )
    throw Error("지원하지 않는 research viewport입니다.");
  const collectionIds = new Set(snapshot.collections.map((item) => item.id));
  if (
    !Array.isArray(raw.activeCollectionIds) ||
    !raw.activeCollectionIds.every(
      (id) => typeof id === "string" && collectionIds.has(id)
    ) ||
    typeof raw.includeUncollected !== "boolean"
  )
    throw Error("Collection 선택이 snapshot과 일치하지 않습니다.");
  const ids = new Set(snapshot.events.map((event) => event.id));
  const histories = object(raw.history);
  // The shared engine validates immutable computation input before it reaches the UI.
  computeLayout(snapshot.input, afterLayout);
  computeLayout(snapshot.input, before.layout);
  return {
    formatVersion: "layout-lab-preset/2",
    ...afterLayout,
    worldId: snapshot.worldId,
    revision: snapshot.sourceRevision,
    servedRevision: snapshot.servedRevision,
    inputDigest: snapshot.inputDigest,
    representationConfigVersion: REPRESENTATION_CONFIG_VERSION,
    representation: restoreRepresentation(raw.representation),
    before,
    camera,
    viewport: { width: viewport.width, height: viewport.height },
    activeCollectionIds: [...new Set(raw.activeCollectionIds as string[])],
    includeUncollected: raw.includeUncollected,
    history: {
      before: history(histories.before, ids),
      after: history(histories.after, ids)
    },
    snapshot
  };
}

export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
