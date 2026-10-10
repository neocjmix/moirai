import { createHash } from "node:crypto";
import { createSyntheticLabState } from "../../apps/atropos-web/src/labs/layout/fixtures.js";
import { projectV5WorldTemporal } from "../../packages/projections/src/index.js";
import { prepareV5LayoutInput } from "../../packages/graph-presentation/src/v5-world-layout.js";
import {
  snapshotDigestPayload,
  type LabSnapshot
} from "../../apps/atropos-web/src/labs/layout/types.js";
import type {
  CanonicalState,
  Relation
} from "../../packages/contracts/src/v5.js";
import { hashUnit } from "./engine.js";

const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function snapshotFromState(state: CanonicalState): LabSnapshot {
  const temporal = projectV5WorldTemporal(state, 1);
  const input = prepareV5LayoutInput(state, temporal, state.timeSystems[0]!.id);
  const relations = state.relations
    .flatMap((r) =>
      r.source_ref.kind === "event" && r.target_ref.kind === "event"
        ? [
            {
              id: r.id,
              sourceId: r.source_ref.event_id,
              targetId: r.target_ref.event_id,
              type: r.type
            }
          ]
        : []
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const children = new Map<string, string[]>();
  for (const r of relations)
    if (r.type === "contains") {
      const cs = children.get(r.sourceId) ?? [];
      cs.push(r.targetId);
      children.set(r.sourceId, cs);
    }
  const memberships = new Map<string, string[]>();
  const coll = new Map<string, string[]>();
  for (const m of state.eventCollectionMemberships) {
    const cs = memberships.get(m.event_id) ?? [];
    cs.push(m.collection_id);
    memberships.set(m.event_id, cs);
    const es = coll.get(m.collection_id) ?? [];
    es.push(m.event_id);
    coll.set(m.collection_id, es);
  }
  const events = state.events
    .map((e) => ({
      id: e.id,
      title: e.title,
      childIds: (children.get(e.id) ?? []).sort(),
      collectionIds: [...new Set(memberships.get(e.id) ?? [])].sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const collections = state.collections
    .map((c) => ({
      id: c.id,
      title: c.title,
      eventIds: [...new Set(coll.get(c.id) ?? [])].sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const payload = { input, events, relations, collections };
  return {
    formatVersion: "layout-lab-snapshot/1",
    worldId: state.world.id,
    worldTitle: state.world.title,
    sourceRevision: 1,
    servedRevision: 1,
    timeSystemId: input.timeSystemId,
    sourceRootDigest: digest(state),
    inputDigest: createHash("sha256")
      .update(snapshotDigestPayload(payload))
      .digest("hex"),
    ...payload
  };
}

/** Seeded realistic synthetic history, explicitly not national history rules.
 * Id hashes prevent Collection-ordered IDs from doing the layout's work. */
export function createFixtureState(
  mode: "changing" | "independent" | "dense-shared" = "changing",
  add = false,
  seed = 13013
): CanonicalState {
  const base = createSyntheticLabState();
  const world = base.world.id;
  const system = base.timeSystems[0]!.id;
  const events: CanonicalState["events"][number][] = [];
  const relations: Relation[] = [];
  const memberships: CanonicalState["eventCollectionMemberships"][number][] =
    [];
  const event = (key: string, title: string, cs: string[]) => {
    const id = "e" + digest([seed, key]).slice(0, 16);
    events.push({
      id,
      world_id: world,
      slug: null,
      title,
      summary: "결정적 합성 사례; 역사적 사실 아님",
      roles: [],
      attributes: {}
    });
    for (const c of cs) memberships.push({ event_id: id, collection_id: c });
    return id;
  };
  const link = (
    type: "contains" | "causes" | "precedes",
    a: string,
    b: string
  ) =>
    relations.push({
      id: type + ":" + a + ":" + b,
      world_id: world,
      type,
      direction: "directed",
      source_ref: { kind: "event", event_id: a },
      target_ref: { kind: "event", event_id: b },
      attributes: {}
    });
  const date = (id: string, year: number, month: number, day: number) =>
    relations.push({
      id: "date:" + id,
      world_id: world,
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: id },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: system },
        definition_version: "1",
        coordinate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000000000000Z`
      },
      attributes: {}
    });
  const counts = [240, 110, 48, 24];
  const epochs = [1380, 1460, 1592, 1650, 1790];
  const clusters = new Map<string, string[]>();
  const all: string[][] = [];
  for (let c = 0; c < counts.length; c++) {
    const group: string[] = [];
    for (let i = 0; i < counts[c]!; i++) {
      const key = `context-${c}-${i}`;
      const u = hashUnit(`${seed}:${key}:epoch`);
      const phase = Math.min(4, Math.floor(u * u * 5));
      const year =
        epochs[phase]! +
        Math.floor(hashUnit(key + seed + ":year") * (phase === 2 ? 7 : 40));
      const cs = ["context-" + c];
      if (c < 3) cs.push("overview");
      if ((c === 0 || c === 1) && phase === 2 && i % 3 !== 0)
        cs.push("contact-subset");
      const id = event(
        key,
        `맥락 ${String.fromCharCode(65 + c)} · ${year} · 사건 ${i + 1}`,
        cs
      );
      date(
        id,
        year,
        1 + Math.floor(hashUnit(key + ":month") * 12),
        1 + Math.floor(hashUnit(key + ":day") * 27)
      );
      group.push(id);
      const ck = c + ":" + phase;
      const es = clusters.get(ck) ?? [];
      es.push(id);
      clusters.set(ck, es);
    }
    all.push(group);
  }
  const shared: string[] = [];
  if (mode !== "independent")
    for (let i = 0; i < (mode === "dense-shared" ? 100 : 28); i++) {
      const three = i % 4 === 0;
      const pair = i < 18 ? [0, 1] : [1, 2];
      const cs = (three ? [0, 1, 2] : pair).map((c) => "context-" + c);
      cs.push("overview", "contact-subset");
      const id = event(
        "shared-" + i,
        `공유 사건 · ${three ? "세 맥락" : "두 맥락"} · ${i + 1}`,
        cs
      );
      date(
        id,
        i < 18 ? 1592 + (i % 7) : 1650 + (i % 9),
        1 + (i % 12),
        2 + (i % 25)
      );
      shared.push(id);
      const targetA = all[pair[0]!]![(i * 2) % all[pair[0]!]!.length]!,
        targetB = all[pair[1]!]![i % all[pair[1]!]!.length]!;
      link("causes", id, targetA);
      link("causes", id, targetB);
    }
  // Three levels: context root -> time phase -> episode -> ordinary Events.
  for (let c = 0; c < 4; c++) {
    const root = event(
      "root-" + c,
      `맥락 ${String.fromCharCode(65 + c)} · 장기 과정`,
      ["context-" + c]
    );
    for (let phase = 0; phase < 5; phase++) {
      const members = clusters.get(c + ":" + phase) ?? [];
      if (!members.length) continue;
      const parent = event(
        `phase-${c}-${phase}`,
        `맥락 ${String.fromCharCode(65 + c)} · ${epochs[phase]}년대 과정`,
        ["context-" + c]
      );
      link("contains", root, parent);
      for (let i = 0; i < members.length; i += 12) {
        const episode = event(
          `episode-${c}-${phase}-${i}`,
          `하위 과정 · ${epochs[phase]} · ${c}/${i}`,
          ["context-" + c]
        );
        link("contains", parent, episode);
        for (const id of members.slice(i, i + 12))
          link("contains", episode, id);
        for (let j = i; j < Math.min(i + 11, members.length - 1); j++)
          if (j % 3 === 0) link("causes", members[j]!, members[j + 1]!);
      }
    }
  }
  if (shared.length) {
    const parent = event("shared-composite", "공유 접촉 과정", [
      "context-0",
      "context-1",
      "contact-subset"
    ]);
    for (const s of shared) link("contains", parent, s);
  }
  const undated = event("undated", "미배치 사건 · 날짜 없음", ["context-3"]);
  void undated;
  if (add) {
    const id = event("increment", "나중에 추가된 사건 · 1594", [
      "context-1",
      "overview"
    ]);
    date(id, 1594, 6, 15);
    link("causes", all[1]![20]!, id);
  }
  const names = [
    ...counts.map((_, c) => [
      "context-" + c,
      "맥락 " + String.fromCharCode(65 + c)
    ]),
    ["overview", "넓은 선택 집합 · A/B/C"],
    ["contact-subset", "부분 중첩 하위 선택 · 접촉"]
  ];
  const collections = names.map(([id, title]) => ({
    id: id!,
    title: title!,
    world_id: world,
    slug: id!,
    description: "합성 Collection; 부모·자식 관계가 아님"
  }));
  const narratives = [
    ...events.map((e) => ({ scope_type: "event" as const, scope_id: e.id })),
    ...collections.map((c) => ({
      scope_type: "collection" as const,
      scope_id: c.id
    }))
  ].map((scope) => ({
    ...scope,
    id: "narrative:" + scope.scope_id,
    world_id: world,
    locale: "ko",
    title: null,
    body: "합성 실험",
    public_references: [],
    notes: []
  }));
  return {
    ...base,
    world: {
      ...base.world,
      title: `시간별 관계 변화 · ${mode} · seed ${seed}`
    },
    events,
    collections,
    relations,
    eventCollectionMemberships: memberships,
    narratives,
    collectionTimeSystems: collections.map((c) => ({
      id: "cts:" + c.id,
      collection_id: c.id,
      time_system_id: system
    }))
  };
}
