import {
  MOIRAI_GRAPH_CONTRACT_VERSION,
  MOIRAI_GRAPH_RELATION_TYPES,
  MOIRAI_GRAPH_URL_STATE_VERSION,
  type MoiraiGraphQuery,
  type MoiraiGraphSource,
  type MoiraiGraphTimeSystemIdentity,
  type MoiraiGraphUrlState
} from "@moirai/contracts";

export const MOIRAI_GRAPH_QUERY_URL_PARAM = "mq";

export type GraphSourceCanonOption = {
  readonly id: string;
  readonly label: Readonly<Record<"ko" | "en", string>>;
};

export type GraphSourceWorldOption = {
  readonly id: string;
  readonly label: Readonly<Record<"ko" | "en", string>>;
  readonly description: Readonly<Record<"ko" | "en", string>>;
  readonly servedRevision: number;
  readonly timeSystem: MoiraiGraphTimeSystemIdentity;
  readonly canons: readonly GraphSourceCanonOption[];
};

export type GraphTemporalFrameOption = {
  readonly id: string;
  readonly label: Readonly<Record<"ko" | "en", string>>;
  readonly description: Readonly<Record<"ko" | "en", string>>;
  readonly target: MoiraiGraphTimeSystemIdentity;
};

export type GraphSourceCatalog = {
  readonly frames: readonly GraphTemporalFrameOption[];
  readonly worlds: readonly GraphSourceWorldOption[];
};

export type GraphSourceCompatibility = {
  readonly compatible: boolean;
  readonly status: "native" | "incompatible" | "definition_version_mismatch";
  readonly reasonCode: string;
};

// MOCK: synthetic public source discovery until Publication composition is
// implemented in M4.5-E. These values are display-safe and are not canonical facts.
export const MOCK_GRAPH_SOURCE_CATALOG: GraphSourceCatalog = {
  frames: [
    {
      id: "gregorian-utc-v1",
      label: { ko: "그레고리력 · UTC", en: "Gregorian · UTC" },
      description: {
        ko: "UTC instant에서 손실 없이 비교하는 운영 프레임",
        en: "Operational frame compared losslessly on UTC instants"
      },
      target: {
        time_system_id: "frame:gregorian-utc",
        definition_version: "1",
        adapter_identity: "proleptic-gregorian-utc",
        comparison_domain: "utc-instant"
      }
    },
    {
      id: "regnal-era-v1",
      label: {
        ko: "왕조 연호 · 서사 순서",
        en: "Regnal era · narrative order"
      },
      description: {
        ko: "연호 경계와 서사 순서로 비교하는 별도 운영 프레임",
        en: "Separate operational frame based on regnal boundaries and narrative order"
      },
      target: {
        time_system_id: "frame:regnal-era",
        definition_version: "1",
        adapter_identity: "regnal-era-order",
        comparison_domain: "narrative-era-order"
      }
    }
  ],
  worlds: [
    {
      id: "world:reality-observatory",
      label: { ko: "현실 세계 관측소", en: "Reality Observatory" },
      description: {
        ko: "공개 역사 사건과 관측 기록",
        en: "Public historical events and observations"
      },
      servedRevision: 7,
      timeSystem: {
        time_system_id: "time:reality-gregorian",
        definition_version: "1",
        adapter_identity: "proleptic-gregorian-utc",
        comparison_domain: "utc-instant"
      },
      canons: [
        {
          id: "canon:recorded-history",
          label: { ko: "기록된 역사", en: "Recorded history" }
        },
        {
          id: "canon:archival-observations",
          label: { ko: "기록 보완", en: "Archival observations" }
        }
      ]
    },
    {
      id: "world:marvel-cinematic",
      label: { ko: "마블 시네마틱 월드", en: "Marvel Cinematic World" },
      description: {
        ko: "현실 UTC 프레임에 대응되는 공개 합성 fixture",
        en: "Public synthetic fixture aligned to the UTC frame"
      },
      servedRevision: 42,
      timeSystem: {
        time_system_id: "time:marvel-earth-199999",
        definition_version: "1",
        adapter_identity: "proleptic-gregorian-utc",
        comparison_domain: "utc-instant"
      },
      canons: [
        {
          id: "canon:earth-199999",
          label: { ko: "Earth-199999", en: "Earth-199999" }
        }
      ]
    },
    {
      id: "world:three-kingdoms-romance",
      label: { ko: "삼국지연의 월드", en: "Romance of the Three Kingdoms" },
      description: {
        ko: "동일한 날짜 표기가 있어도 별도 연호 adapter를 사용하는 합성 fixture",
        en: "Synthetic fixture using a distinct regnal-era adapter despite similar date labels"
      },
      servedRevision: 19,
      timeSystem: {
        time_system_id: "time:three-kingdoms-regnal",
        definition_version: "1",
        adapter_identity: "regnal-era-order",
        comparison_domain: "narrative-era-order"
      },
      canons: [
        {
          id: "canon:romance-main",
          label: { ko: "연의 본문", en: "Romance narrative" }
        }
      ]
    }
  ]
};

export function getGraphSourceCompatibility(
  source: MoiraiGraphTimeSystemIdentity,
  target: MoiraiGraphTimeSystemIdentity
): GraphSourceCompatibility {
  if (source.definition_version !== target.definition_version) {
    return {
      compatible: false,
      status: "definition_version_mismatch",
      reasonCode: "definition_version_mismatch"
    };
  }

  if (
    source.adapter_identity === target.adapter_identity &&
    source.comparison_domain === target.comparison_domain
  ) {
    return {
      compatible: true,
      status: "native",
      reasonCode: "same_adapter_domain_and_definition"
    };
  }

  return {
    compatible: false,
    status: "incompatible",
    reasonCode: "adapter_identity_or_domain_mismatch"
  };
}

export function isSameGraphTimeSystemIdentity(
  left: MoiraiGraphTimeSystemIdentity,
  right: MoiraiGraphTimeSystemIdentity
): boolean {
  return (
    left.time_system_id === right.time_system_id &&
    left.definition_version === right.definition_version &&
    left.adapter_identity === right.adapter_identity &&
    left.comparison_domain === right.comparison_domain
  );
}

function createQuery(
  target: MoiraiGraphTimeSystemIdentity,
  sources: readonly MoiraiGraphSource[]
): MoiraiGraphQuery {
  return {
    contract_version: MOIRAI_GRAPH_CONTRACT_VERSION,
    temporal_frame: { target },
    sources,
    scope: { kind: "overview" },
    entity_filter: {
      event_kinds: ["atomic", "composite"],
      roles: [],
      subject_handle_ids: [],
      include_states: true,
      include_narratives: true,
      include_virtual_time_events: true
    },
    relation_filter: {
      types: MOIRAI_GRAPH_RELATION_TYPES,
      directions: ["directed", "undirected"]
    },
    diagnostics_filter: {
      include_codes: [],
      include_unplaced: true,
      include_unresolved: true
    },
    budget: {
      detail_level: "overview",
      max_entities: 1000,
      max_relations: 2000,
      max_evidence: 4000
    }
  };
}

export function createDefaultGraphUrlState(
  catalog: GraphSourceCatalog = MOCK_GRAPH_SOURCE_CATALOG
): MoiraiGraphUrlState {
  const frame = catalog.frames[0]!;
  const compatibleWorlds = catalog.worlds.filter(
    (world) =>
      getGraphSourceCompatibility(world.timeSystem, frame.target).compatible
  );

  return {
    version: MOIRAI_GRAPH_URL_STATE_VERSION,
    query: createQuery(
      frame.target,
      compatibleWorlds.map((world) => ({
        world_id: world.id,
        served_revision: world.servedRevision,
        canon_ids: world.canons.map((canon) => canon.id),
        time_systems: [world.timeSystem]
      }))
    ),
    focus: null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGraphUrlState(
  value: unknown,
  catalog: GraphSourceCatalog = MOCK_GRAPH_SOURCE_CATALOG
): MoiraiGraphUrlState | null {
  if (
    !isRecord(value) ||
    value.version !== MOIRAI_GRAPH_URL_STATE_VERSION ||
    !isRecord(value.query)
  ) {
    return null;
  }

  const query = value.query;
  if (
    query.contract_version !== MOIRAI_GRAPH_CONTRACT_VERSION ||
    !isRecord(query.temporal_frame)
  ) {
    return null;
  }
  const targetCandidate = query.temporal_frame.target;
  if (
    !isRecord(targetCandidate) ||
    typeof targetCandidate.time_system_id !== "string" ||
    typeof targetCandidate.definition_version !== "string" ||
    typeof targetCandidate.adapter_identity !== "string" ||
    typeof targetCandidate.comparison_domain !== "string"
  ) {
    return null;
  }
  const target: MoiraiGraphTimeSystemIdentity = {
    time_system_id: targetCandidate.time_system_id,
    definition_version: targetCandidate.definition_version,
    adapter_identity: targetCandidate.adapter_identity,
    comparison_domain: targetCandidate.comparison_domain
  };
  const frame = catalog.frames.find((candidate) =>
    isSameGraphTimeSystemIdentity(candidate.target, target)
  );
  if (!frame || !Array.isArray(query.sources)) {
    return null;
  }

  const sources: MoiraiGraphSource[] = [];
  const seenWorlds = new Set<string>();
  for (const candidate of query.sources) {
    if (
      !isRecord(candidate) ||
      typeof candidate.world_id !== "string" ||
      seenWorlds.has(candidate.world_id)
    ) {
      return null;
    }
    const world = catalog.worlds.find(
      (entry) => entry.id === candidate.world_id
    );
    if (
      !world ||
      candidate.served_revision !== world.servedRevision ||
      !getGraphSourceCompatibility(world.timeSystem, frame.target).compatible ||
      !Array.isArray(candidate.canon_ids)
    ) {
      return null;
    }
    const canonIds = candidate.canon_ids.filter(
      (id): id is string =>
        typeof id === "string" && world.canons.some((canon) => canon.id === id)
    );
    if (
      canonIds.length === 0 ||
      canonIds.length !== candidate.canon_ids.length
    ) {
      return null;
    }
    seenWorlds.add(world.id);
    sources.push({
      world_id: world.id,
      served_revision: world.servedRevision,
      canon_ids: [...new Set(canonIds)],
      time_systems: [world.timeSystem]
    });
  }

  if (sources.length === 0) {
    return null;
  }

  return {
    version: MOIRAI_GRAPH_URL_STATE_VERSION,
    query: createQuery(frame.target, sources),
    focus: null
  };
}

export function parseGraphUrlState(
  search: string,
  catalog: GraphSourceCatalog = MOCK_GRAPH_SOURCE_CATALOG
): MoiraiGraphUrlState | null {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get(MOIRAI_GRAPH_QUERY_URL_PARAM);
  if (!raw) {
    return null;
  }
  try {
    return normalizeGraphUrlState(JSON.parse(raw), catalog);
  } catch {
    return null;
  }
}

export function buildGraphUrlSearch(
  baseSearch: string,
  state: MoiraiGraphUrlState
): string {
  const params = new URLSearchParams(
    baseSearch.startsWith("?") ? baseSearch.slice(1) : baseSearch
  );
  params.set(MOIRAI_GRAPH_QUERY_URL_PARAM, JSON.stringify(state));
  const next = params.toString();
  return next.length > 0 ? `?${next}` : "";
}

export function replaceGraphSources(
  state: MoiraiGraphUrlState,
  target: MoiraiGraphTimeSystemIdentity,
  sources: readonly MoiraiGraphSource[]
): MoiraiGraphUrlState {
  return {
    version: MOIRAI_GRAPH_URL_STATE_VERSION,
    query: createQuery(target, sources),
    focus: state.focus
  };
}
