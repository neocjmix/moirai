import type { ResolvedOperation } from "../packages/contracts/src/v5.js";

export const worldId = "01995c2a-7b00-7000-8000-000000000101";
export const calendarId = "019f5b00-0000-7000-8000-000000000003";
export const corpusId = (n: number) =>
  `019f9280-a500-7000-8000-${n.toString(16).padStart(12, "0")}`;
export const collectionId = (group: number) => corpusId(100 + group);
const eventId = (group: number, i: number) => corpusId(1000 + group * 100 + i);
export const themes = [
  "항구의 교역",
  "산맥의 길",
  "강 유역의 도시",
  "왕위의 계승",
  "장인의 공방",
  "수로의 건설",
  "해양의 탐사",
  "학문의 교류",
  "시장과 화폐",
  "변경의 협약",
  "식량과 농업",
  "인쇄와 기록",
  "도시의 재건",
  "섬들의 연합",
  "운송과 역참",
  "광산과 금속",
  "의술의 전파",
  "관측과 달력",
  "음악과 축제",
  "법과 재판",
  "서신과 외교",
  "숲과 자원",
  "이주와 정착",
  "공동의 구호"
] as const;
const actions = [
  "모임",
  "첫 제안",
  "현장 조사",
  "협의",
  "시범 시행",
  "갈등",
  "중재",
  "합의",
  "확장",
  "정착"
];

/** Development-only fictional occurrences, deliberately not historical claims.
 * Fixed IDs make both membership sharing and exact recovery inspectable. */
export function corpusBatch(group: number): ResolvedOperation[] {
  if (!Number.isInteger(group) || group < 0 || group >= themes.length)
    throw Error("invalid group");
  const operations: ResolvedOperation[] = [];
  const origin_refs = [{ field: "*", origin_index: 0 }];
  const create = (entity_type: string, entity_id: string, value: unknown) => {
    operations.push({
      kind: "create",
      entity_type,
      entity_id,
      value,
      origin_refs
    } as ResolvedOperation);
  };
  const membership = (event_id: string) =>
    operations.push({
      kind: "add",
      entity_type: "event_collection_membership",
      value: { event_id, collection_id: collectionId(group) },
      origin_refs
    });
  const narrative = (
    id: string,
    scope_type: "event" | "collection",
    scope_id: string,
    body: string
  ) =>
    create("narrative", id, {
      world_id: worldId,
      scope_type,
      scope_id,
      locale: "ko",
      title: null,
      body,
      public_references: [],
      notes: []
    });
  const theme = themes[group]!;
  const prefix = `[A5 실험 ${String(group + 1).padStart(2, "0")}]`;
  create("collection", collectionId(group), {
    world_id: worldId,
    slug: `a5-lab-${group + 1}`,
    title: `${prefix} ${theme}`,
    description:
      "출시 전 탐색 실험용 합성 콘텐츠. 실제 역사에 대한 주장이 아닙니다."
  });
  narrative(
    corpusId(200 + group),
    "collection",
    collectionId(group),
    `${theme}의 제안부터 갈등과 정착까지 이어지는 가상의 연대기다. 이웃 주제와 공동의 사건을 공유한다.\n\n[A5 실험] 실제 역사와 무관한 탐색용 콘텐츠다.`
  );
  create("collection_time_system", corpusId(300 + group), {
    collection_id: collectionId(group),
    time_system_id: calendarId
  });
  let relation = 0;
  const edge = (
    type: string,
    source: string,
    target: unknown,
    direction = "directed"
  ) =>
    create("relation", corpusId(100000 + group * 1000 + relation++), {
      world_id: worldId,
      type,
      direction,
      source_ref: { kind: "event", event_id: source },
      target_ref:
        typeof target === "string"
          ? { kind: "event", event_id: target }
          : target,
      attributes: {}
    });
  for (let i = 0; i < 23; i++) {
    const composite = i >= 20;
    const title = composite
      ? ["시작과 협상", "확장과 정착", "전체 과정"][i - 20]!
      : `${actions[i % 10]} ${Math.floor(i / 10) + 1}`;
    create("event", eventId(group, i), {
      world_id: worldId,
      slug: `a5-lab-${group + 1}-${i}`,
      title: `${prefix} ${theme} — ${title}`,
      summary: "실제 역사와 무관한 합성 탐색 사건",
      roles: [],
      attributes: { synthetic: true }
    });
    narrative(
      corpusId(10000 + group * 100 + i),
      "event",
      eventId(group, i),
      composite
        ? `${theme}을 둘러싼 여러 행동이 ${title}을 이루었다. 구성 사건을 따라가면 참여자들의 선택과 결과를 읽을 수 있다.\n\n[A5 실험] 가상의 과정이다.`
        : `${theme}에 참여한 주민과 대표들은 ${title}을 진행했다. 자원의 배분과 이동 경로를 둘러싼 의견 차이 때문에 협의가 필요했다.\n\n합의된 방식은 다음 활동의 출발점이 되었고 이웃 집단에도 영향을 주었다. [A5 실험] 실제 역사와 무관한 가상 사건이다.`
    );
    membership(eventId(group, i));
    if (!composite) {
      // Alternating tight and long temporal bands, all near existing content.
      const year =
        1380 + (group % 6) * 40 + (group % 2 ? i * 2 : Math.floor(i / 5));
      edge(
        "coincides",
        eventId(group, i),
        {
          kind: "time_event",
          time_system_ref: { time_system_id: calendarId },
          definition_version: "1",
          coordinate: `${year}-06-${String(1 + (i % 20)).padStart(2, "0")}T00:00:00.000000000000Z`
        },
        "undirected"
      );
      edge("contains", eventId(group, i < 10 ? 20 : 21), eventId(group, i));
    }
  }
  edge("contains", eventId(group, 22), eventId(group, 20));
  edge("contains", eventId(group, 22), eventId(group, 21));
  // Reuse occurrences rather than copying Event/Narrative or changing dates.
  if (group > 0) for (let i = 0; i < 4; i++) membership(eventId(group - 1, i));
  if (group > 1) for (let i = 0; i < 2; i++) membership(eventId(0, i));
  return operations;
}
