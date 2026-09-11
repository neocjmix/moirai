import {
  MOIRAI_GRAPH_CONTRACT_VERSION,
  MOIRAI_GRAPH_RELATION_TYPES,
  MOIRAI_GRAPH_URL_STATE_VERSION,
  type MoiraiGraphEntityReference,
  type MoiraiGraphEntityFilter,
  type MoiraiGraphEventReference,
  type MoiraiGraphQuery,
  type MoiraiGraphRelationFilter,
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
  readonly timeSystems: readonly MoiraiGraphTimeSystemIdentity[];
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

export type GraphSearchEntity = {
  readonly identity: string;
  readonly kind: "event" | "subject" | "state" | "narrative";
  readonly worldId: string;
  readonly title: Readonly<Record<"ko" | "en", string>>;
  readonly description: Readonly<Record<"ko" | "en", string>>;
  readonly canonMemberships: readonly string[];
  readonly eventKind?: "atomic" | "composite";
  readonly roles?: readonly string[];
  readonly subjectHandleId?: string;
  readonly compositeEventId?: string;
  readonly stateFamily?: string;
};

export type GraphSearchMatch = GraphSearchEntity & {
  readonly matchedCanonIds: readonly string[];
  readonly persisted: boolean;
  readonly reference: MoiraiGraphEntityReference;
};

export type GraphRelationFamily =
  "structural" | "temporal" | "causal" | "identity" | "provenance";

export const GRAPH_RELATION_FAMILIES: Readonly<
  Record<
    GraphRelationFamily,
    readonly (typeof MOIRAI_GRAPH_RELATION_TYPES)[number][]
  >
> = {
  structural: ["contains"],
  temporal: ["precedes", "not_after", "coincides", "starts", "ends"],
  causal: ["causes", "enables", "prevents", "influences"],
  identity: [
    "identity_continues",
    "identity_instance_of",
    "identity_splits",
    "identity_merges"
  ],
  provenance: ["derives_from", "transfers"]
};

export type GraphRelationMatch = {
  readonly id: string;
  readonly worldId: string;
  readonly type: (typeof MOIRAI_GRAPH_RELATION_TYPES)[number];
  readonly sourceIdentity: string;
  readonly targetIdentity: string;
  readonly canonMemberships: readonly string[];
  readonly matchedCanonIds: readonly string[];
  readonly endpointEvidence: readonly string[];
  readonly timeSystemEvidence: readonly string[];
};

export type GraphDiagnostic = {
  readonly code:
    | "contradiction"
    | "unplaced"
    | "unresolved"
    | "cycle"
    | "incompatibility"
    | "truncation"
    | "renderer_loss";
  readonly severity: "knowledge" | "informational" | "warning";
  readonly invalid: false;
  readonly message: Readonly<Record<"ko" | "en", string>>;
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
      timeSystems: [
        {
          time_system_id: "time:reality-gregorian",
          definition_version: "1",
          adapter_identity: "proleptic-gregorian-utc",
          comparison_domain: "utc-instant"
        }
      ],
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
      timeSystems: [
        {
          time_system_id: "time:marvel-earth-199999",
          definition_version: "1",
          adapter_identity: "proleptic-gregorian-utc",
          comparison_domain: "utc-instant"
        }
      ],
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
      timeSystems: [
        {
          time_system_id: "time:three-kingdoms-regnal",
          definition_version: "1",
          adapter_identity: "regnal-era-order",
          comparison_domain: "narrative-era-order"
        }
      ],
      canons: [
        {
          id: "canon:romance-main",
          label: { ko: "연의 본문", en: "Romance narrative" }
        }
      ]
    }
  ]
};

// MOCK: identity-aware D1 fixture. Shared Event rows intentionally carry more
// than one Canon membership while remaining one candidate each.
export const MOCK_GRAPH_SEARCH_ENTITIES: readonly GraphSearchEntity[] = [
  {
    identity: "event:observatory-a",
    kind: "event",
    worldId: "world:reality-observatory",
    title: { ko: "관측 사건 A", en: "Observation event A" },
    description: {
      ko: "두 Canon이 공유하는 원자 Event",
      en: "Atomic Event shared by two Canons"
    },
    canonMemberships: ["canon:recorded-history", "canon:archival-observations"],
    eventKind: "atomic",
    roles: ["observation"]
  },
  {
    identity: "event:observatory-b",
    kind: "event",
    worldId: "world:reality-observatory",
    title: { ko: "관측 사건 B", en: "Observation event B" },
    description: {
      ko: "두 Canon이 공유하는 복합 Event",
      en: "Composite Event shared by two Canons"
    },
    canonMemberships: ["canon:recorded-history", "canon:archival-observations"],
    eventKind: "composite",
    roles: ["process"]
  },
  {
    identity: "subject:observatory",
    kind: "subject",
    worldId: "world:reality-observatory",
    title: { ko: "관측 대상", en: "Observed subject" },
    description: {
      ko: "Event에서 투영된 Subject",
      en: "Subject projected from Events"
    },
    canonMemberships: ["canon:recorded-history", "canon:archival-observations"],
    subjectHandleId: "subject:observatory"
  },
  {
    identity: "state:observatory-b:phase",
    kind: "state",
    worldId: "world:reality-observatory",
    title: { ko: "관측 단계", en: "Observation phase" },
    description: {
      ko: "복합 Event에서 유도된 State",
      en: "State derived from a composite Event"
    },
    canonMemberships: ["canon:recorded-history"],
    subjectHandleId: "subject:observatory",
    compositeEventId: "event:observatory-b",
    stateFamily: "phase"
  },
  {
    identity: "narrative:observatory-note",
    kind: "narrative",
    worldId: "world:reality-observatory",
    title: { ko: "관측 기록", en: "Observation account" },
    description: { ko: "저작된 Narrative", en: "Authored Narrative" },
    canonMemberships: ["canon:archival-observations"]
  },
  {
    identity: "event:marvel-arrival",
    kind: "event",
    worldId: "world:marvel-cinematic",
    title: { ko: "도착 사건", en: "Arrival event" },
    description: {
      ko: "별도 World의 원자 Event",
      en: "Atomic Event in another World"
    },
    canonMemberships: ["canon:earth-199999"],
    eventKind: "atomic",
    roles: ["arrival"]
  }
];

const MOCK_GRAPH_RELATIONS: readonly Omit<
  GraphRelationMatch,
  "matchedCanonIds"
>[] = [
  {
    id: "relation:observatory-shared-influences",
    worldId: "world:reality-observatory",
    type: "influences",
    sourceIdentity: "event:observatory-a",
    targetIdentity: "event:observatory-b",
    canonMemberships: ["canon:recorded-history", "canon:archival-observations"],
    endpointEvidence: ["endpoint:A@K1,K2", "endpoint:B@K1,K2"],
    timeSystemEvidence: ["time:reality-gregorian@definition:1"]
  },
  {
    id: "relation:observatory-k1-causes",
    worldId: "world:reality-observatory",
    type: "causes",
    sourceIdentity: "event:observatory-a",
    targetIdentity: "event:observatory-b",
    canonMemberships: ["canon:recorded-history"],
    endpointEvidence: ["endpoint:A@K1", "endpoint:B@K1"],
    timeSystemEvidence: ["time:reality-gregorian@definition:1"]
  },
  {
    id: "relation:observatory-k2-prevents",
    worldId: "world:reality-observatory",
    type: "prevents",
    sourceIdentity: "event:observatory-a",
    targetIdentity: "event:observatory-b",
    canonMemberships: ["canon:archival-observations"],
    endpointEvidence: ["endpoint:A@K2", "endpoint:B@K2"],
    timeSystemEvidence: ["time:reality-gregorian@definition:1"]
  }
];

export const MOCK_GRAPH_DIAGNOSTICS: readonly GraphDiagnostic[] = [
  {
    code: "contradiction",
    severity: "knowledge",
    invalid: false,
    message: {
      ko: "K1 causes와 K2 prevents는 서로 다른 유효 assertion이며 구조 오류가 아닙니다.",
      en: "K1 causes and K2 prevents are distinct valid assertions, not a structural error."
    }
  },
  {
    code: "unplaced",
    severity: "informational",
    invalid: false,
    message: {
      ko: "배치되지 않은 시간 항목을 숨기지 않습니다.",
      en: "Unplaced temporal items remain visible."
    }
  },
  {
    code: "unresolved",
    severity: "warning",
    invalid: false,
    message: {
      ko: "해결되지 않은 endpoint를 명시합니다.",
      en: "Unresolved endpoints are reported."
    }
  },
  {
    code: "cycle",
    severity: "warning",
    invalid: false,
    message: {
      ko: "시간 제약 cycle을 진단합니다.",
      en: "Temporal constraint cycles are diagnosed."
    }
  },
  {
    code: "incompatibility",
    severity: "warning",
    invalid: false,
    message: {
      ko: "Time System 비호환을 명시합니다.",
      en: "Time System incompatibility is explicit."
    }
  },
  {
    code: "truncation",
    severity: "informational",
    invalid: false,
    message: {
      ko: "Query budget 절단을 명시합니다.",
      en: "Query budget truncation is explicit."
    }
  },
  {
    code: "renderer_loss",
    severity: "informational",
    invalid: false,
    message: {
      ko: "Renderer 표현 손실을 추적합니다.",
      en: "Renderer representation loss is tracked."
    }
  }
];

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
  const compatibleWorlds = catalog.worlds.filter((world) =>
    world.timeSystems.some(
      (system) => getGraphSourceCompatibility(system, frame.target).compatible
    )
  );

  return {
    version: MOIRAI_GRAPH_URL_STATE_VERSION,
    query: createQuery(
      frame.target,
      compatibleWorlds.map((world) => ({
        world_id: world.id,
        served_revision: world.servedRevision,
        canon_ids: world.canons.map((canon) => canon.id),
        time_systems: world.timeSystems.filter(
          (system) =>
            getGraphSourceCompatibility(system, frame.target).compatible
        )
      }))
    ),
    focus: null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? [...new Set(value)]
    : null;
}

function normalizeEntityFilter(value: unknown): MoiraiGraphEntityFilter | null {
  if (!isRecord(value)) return null;
  const eventKinds = stringArray(value.event_kinds);
  const roles = stringArray(value.roles);
  const subjectHandleIds = stringArray(value.subject_handle_ids);
  if (
    !eventKinds ||
    eventKinds.some((kind) => kind !== "atomic" && kind !== "composite") ||
    !roles ||
    !subjectHandleIds ||
    typeof value.include_states !== "boolean" ||
    typeof value.include_narratives !== "boolean" ||
    typeof value.include_virtual_time_events !== "boolean"
  ) {
    return null;
  }
  return {
    event_kinds: eventKinds as ("atomic" | "composite")[],
    roles,
    subject_handle_ids: subjectHandleIds,
    include_states: value.include_states,
    include_narratives: value.include_narratives,
    include_virtual_time_events: value.include_virtual_time_events
  };
}

function normalizeRelationFilter(
  value: unknown
): MoiraiGraphRelationFilter | null {
  if (!isRecord(value)) return null;
  const types = stringArray(value.types);
  const directions = stringArray(value.directions);
  if (
    !types ||
    types.some(
      (type) => !MOIRAI_GRAPH_RELATION_TYPES.includes(type as never)
    ) ||
    !directions ||
    directions.some(
      (direction) => direction !== "directed" && direction !== "undirected"
    )
  ) {
    return null;
  }
  return {
    types: types as MoiraiGraphRelationFilter["types"],
    directions: directions as MoiraiGraphRelationFilter["directions"]
  };
}

function normalizeDiagnosticsFilter(
  value: unknown
): MoiraiGraphQuery["diagnostics_filter"] | null {
  if (!isRecord(value)) return null;
  const includeCodes = stringArray(value.include_codes);
  if (
    !includeCodes ||
    typeof value.include_unplaced !== "boolean" ||
    typeof value.include_unresolved !== "boolean"
  ) {
    return null;
  }
  return {
    include_codes: includeCodes,
    include_unplaced: value.include_unplaced,
    include_unresolved: value.include_unresolved
  };
}

function referenceForEntity(
  entity: GraphSearchEntity,
  canonId: string,
  servedRevision: number
): MoiraiGraphEntityReference {
  const address = {
    world_id: entity.worldId,
    canon_id: canonId,
    served_revision: servedRevision
  };
  if (entity.kind === "event") {
    return {
      ...address,
      kind: "event",
      event_ref: { kind: "event", event_id: entity.identity }
    };
  }
  if (entity.kind === "subject") {
    return {
      ...address,
      kind: "subject",
      subject_handle_id: entity.subjectHandleId!
    };
  }
  if (entity.kind === "state") {
    return {
      ...address,
      kind: "state",
      composite_event_id: entity.compositeEventId!,
      subject_handle_id: entity.subjectHandleId!,
      state_family: entity.stateFamily!
    };
  }
  return { ...address, kind: "narrative", narrative_id: entity.identity };
}

function normalizeEntityReference(
  value: unknown,
  sources: readonly MoiraiGraphSource[]
): MoiraiGraphEntityReference | null {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    typeof value.world_id !== "string" ||
    typeof value.canon_id !== "string" ||
    typeof value.served_revision !== "number"
  ) {
    return null;
  }
  const source = sources.find(
    (entry) =>
      entry.world_id === value.world_id &&
      entry.served_revision === value.served_revision &&
      entry.canon_ids.includes(value.canon_id as string)
  );
  if (!source) return null;
  if (value.kind === "event") {
    if (
      !isRecord(value.event_ref) ||
      (value.event_ref.kind !== "event" &&
        value.event_ref.kind !== "time_event")
    )
      return null;
    if (
      value.event_ref.kind === "event" &&
      typeof value.event_ref.event_id !== "string"
    )
      return null;
    if (
      value.event_ref.kind === "time_event" &&
      (!isRecord(value.event_ref.time_system_ref) ||
        typeof value.event_ref.time_system_ref.time_system_id !== "string" ||
        typeof value.event_ref.definition_version !== "string" ||
        typeof value.event_ref.coordinate !== "string")
    )
      return null;
  } else if (
    value.kind === "subject" &&
    typeof value.subject_handle_id !== "string"
  )
    return null;
  else if (
    value.kind === "state" &&
    (typeof value.composite_event_id !== "string" ||
      typeof value.subject_handle_id !== "string" ||
      typeof value.state_family !== "string")
  )
    return null;
  else if (value.kind === "narrative" && typeof value.narrative_id !== "string")
    return null;
  else if (!["event", "subject", "state", "narrative"].includes(value.kind))
    return null;
  return value as unknown as MoiraiGraphEntityReference;
}

function normalizeEventReference(
  value: unknown,
  sources: readonly MoiraiGraphSource[]
): MoiraiGraphEventReference | null {
  if (!isRecord(value)) return null;
  const normalized = normalizeEntityReference(
    { ...value, kind: "event" },
    sources
  );
  if (!normalized || normalized.kind !== "event") return null;
  return {
    world_id: normalized.world_id,
    canon_id: normalized.canon_id,
    served_revision: normalized.served_revision,
    event_ref: normalized.event_ref
  };
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
      !world.timeSystems.some(
        (system) => getGraphSourceCompatibility(system, frame.target).compatible
      ) ||
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
      time_systems: world.timeSystems.filter(
        (system) => getGraphSourceCompatibility(system, frame.target).compatible
      )
    });
  }

  if (sources.length === 0) {
    return null;
  }

  const entityFilter = normalizeEntityFilter(query.entity_filter);
  const relationFilter = normalizeRelationFilter(query.relation_filter);
  const diagnosticsFilter = normalizeDiagnosticsFilter(
    query.diagnostics_filter
  );
  if (!entityFilter || !relationFilter || !diagnosticsFilter) return null;
  const focus =
    value.focus === null
      ? null
      : normalizeEntityReference(value.focus, sources);
  if (value.focus !== null && !focus) return null;
  const scopeCandidate = query.scope;
  let scope: MoiraiGraphQuery["scope"] = { kind: "overview" };
  if (isRecord(scopeCandidate) && scopeCandidate.kind === "selection") {
    if (!Array.isArray(scopeCandidate.references)) return null;
    const references = scopeCandidate.references.map((reference) =>
      normalizeEntityReference(reference, sources)
    );
    if (references.some((reference) => !reference)) return null;
    scope = {
      kind: "selection",
      references: references as MoiraiGraphEntityReference[]
    };
  } else if (
    isRecord(scopeCandidate) &&
    scopeCandidate.kind === "neighborhood"
  ) {
    const event = normalizeEventReference(scopeCandidate.event, sources);
    if (
      !event ||
      !Number.isSafeInteger(scopeCandidate.depth) ||
      (scopeCandidate.depth as number) < 0 ||
      (scopeCandidate.depth as number) > 8
    )
      return null;
    scope = {
      kind: "neighborhood",
      event,
      depth: scopeCandidate.depth as number
    };
  } else if (isRecord(scopeCandidate) && scopeCandidate.kind === "subject") {
    const reference = normalizeEntityReference(scopeCandidate, sources);
    if (!reference || reference.kind !== "subject") return null;
    scope = reference;
  } else if (isRecord(scopeCandidate) && scopeCandidate.kind === "composite") {
    const event = normalizeEventReference(scopeCandidate.event, sources);
    if (!event) return null;
    scope = { kind: "composite", event };
  } else if (isRecord(scopeCandidate) && scopeCandidate.kind === "state") {
    const reference = normalizeEntityReference(scopeCandidate, sources);
    if (!reference || reference.kind !== "state") return null;
    scope = reference;
  } else if (!isRecord(scopeCandidate) || scopeCandidate.kind !== "overview") {
    return null;
  }

  const detailLevel = isRecord(query.budget) ? query.budget.detail_level : null;
  if (
    detailLevel !== "overview" &&
    detailLevel !== "standard" &&
    detailLevel !== "full"
  )
    return null;
  const baseQuery = createQuery(frame.target, sources);

  return {
    version: MOIRAI_GRAPH_URL_STATE_VERSION,
    query: {
      ...baseQuery,
      scope,
      entity_filter: entityFilter,
      relation_filter: relationFilter,
      diagnostics_filter: diagnosticsFilter,
      budget: { ...baseQuery.budget, detail_level: detailLevel }
    },
    focus
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
    query: {
      ...state.query,
      temporal_frame: { target },
      sources,
      scope: { kind: "overview" }
    },
    focus: null
  };
}

export function replaceGraphEntityFilter(
  state: MoiraiGraphUrlState,
  entityFilter: MoiraiGraphEntityFilter
): MoiraiGraphUrlState {
  return {
    ...state,
    query: { ...state.query, entity_filter: entityFilter }
  };
}

export function replaceGraphRelationFilter(
  state: MoiraiGraphUrlState,
  relationFilter: MoiraiGraphRelationFilter
): MoiraiGraphUrlState {
  return {
    ...state,
    query: { ...state.query, relation_filter: relationFilter }
  };
}

export function searchGraphRelations(
  state: MoiraiGraphUrlState,
  relations: readonly (
    GraphRelationMatch | Omit<GraphRelationMatch, "matchedCanonIds">
  )[] = MOCK_GRAPH_RELATIONS
): readonly GraphRelationMatch[] {
  return relations.flatMap((relation) => {
    const source = state.query.sources.find(
      (entry) => entry.world_id === relation.worldId
    );
    if (!source || !state.query.relation_filter.types.includes(relation.type))
      return [];
    const matchedCanonIds = relation.canonMemberships.filter((id) =>
      source.canon_ids.includes(id)
    );
    return matchedCanonIds.length > 0 ? [{ ...relation, matchedCanonIds }] : [];
  });
}

export function graphDiagnostics(
  state: MoiraiGraphUrlState,
  diagnostics: readonly GraphDiagnostic[] = MOCK_GRAPH_DIAGNOSTICS
) {
  return diagnostics.filter((diagnostic) => {
    if (diagnostic.code === "unplaced")
      return state.query.diagnostics_filter.include_unplaced;
    if (diagnostic.code === "unresolved")
      return state.query.diagnostics_filter.include_unresolved;
    return (
      state.query.diagnostics_filter.include_codes.length === 0 ||
      state.query.diagnostics_filter.include_codes.includes(diagnostic.code)
    );
  });
}

export function focusGraphEntity(
  state: MoiraiGraphUrlState,
  reference: MoiraiGraphEntityReference
): MoiraiGraphUrlState {
  return {
    ...state,
    query: {
      ...state.query,
      scope: { kind: "selection", references: [reference] }
    },
    focus: reference
  };
}

export function searchGraphEntities(
  state: MoiraiGraphUrlState,
  term = "",
  entities: readonly GraphSearchEntity[] = MOCK_GRAPH_SEARCH_ENTITIES
): readonly GraphSearchMatch[] {
  const normalizedTerm = term.trim().toLocaleLowerCase();
  const filter = state.query.entity_filter;
  return entities.flatMap((entity) => {
    const source = state.query.sources.find(
      (entry) => entry.world_id === entity.worldId
    );
    if (!source) return [];
    const matchedCanonIds = entity.canonMemberships.filter((id) =>
      source.canon_ids.includes(id)
    );
    if (matchedCanonIds.length === 0) return [];
    if (
      entity.kind === "event" &&
      !filter.event_kinds.includes(entity.eventKind!)
    )
      return [];
    if (entity.kind === "state" && !filter.include_states) return [];
    if (entity.kind === "narrative" && !filter.include_narratives) return [];
    if (
      filter.roles.length > 0 &&
      entity.kind === "event" &&
      !entity.roles?.some((role) => filter.roles.includes(role))
    )
      return [];
    if (
      filter.subject_handle_ids.length > 0 &&
      !entity.subjectHandleId &&
      entity.kind !== "event"
    )
      return [];
    if (
      filter.subject_handle_ids.length > 0 &&
      entity.subjectHandleId &&
      !filter.subject_handle_ids.includes(entity.subjectHandleId)
    )
      return [];
    const searchable =
      `${entity.identity} ${entity.title.ko} ${entity.title.en} ${entity.description.ko} ${entity.description.en}`.toLocaleLowerCase();
    if (normalizedTerm && !searchable.includes(normalizedTerm)) return [];
    return [
      {
        ...entity,
        matchedCanonIds,
        persisted: entity.kind === "event" || entity.kind === "narrative",
        reference: referenceForEntity(
          entity,
          matchedCanonIds[0]!,
          source.served_revision
        )
      }
    ];
  });
}
