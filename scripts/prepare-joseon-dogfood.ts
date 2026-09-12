/** One-time, user-requested public dogfood corpus. Never imported at startup. */
import { writeFileSync } from "node:fs";
import {
  resolveCreateOperations,
  validateCandidateChangeSet
} from "../packages/domain/src/index.js";
import type {
  ChangePlan,
  ChangeOperation,
  CreateChangeSet
} from "../packages/contracts/src/index.js";

const world = "01995c2a-7b00-7000-8000-000000000101";
const id = (n: number) =>
  `019f5b00-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const canon = id(2),
  time = id(3);
const sources = {
  taejo: {
    label: "우리역사넷 — 태조 이성계",
    url: "https://contents.history.go.kr/mobile/kc/view.do?code=kc_age_30&levelId=kc_n312600"
  },
  land: {
    label: "우리역사넷 — 전제 개혁과 고려 왕조의 멸망",
    url: "https://contents.history.go.kr/mobile/mid/ta_m71_0050_0030_0030_0030"
  },
  taejong: {
    label: "한국민족문화대백과사전 — 태종",
    url: "https://encykorea.aks.ac.kr/Article/E0059039"
  },
  sejong: {
    label: "한국민족문화대백과사전 — 세종",
    url: "https://encykorea.aks.ac.kr/Article/E0029857"
  },
  hall: {
    label: "한국민족문화대백과사전 — 집현전",
    url: "https://encykorea.aks.ac.kr/Article/E0055081"
  },
  hangul: {
    label: "국립국어원 — 훈민정음 기록과 한글날",
    url: "https://www.korean.go.kr/hangeul/origin/001.html"
  },
  munjong: {
    label: "한국민족문화대백과사전 — 문종",
    url: "https://encykorea.aks.ac.kr/Article/E0019665"
  },
  danjong: {
    label: "한국민족문화대백과사전 — 단종",
    url: "https://encykorea.aks.ac.kr/Article/E0013661"
  },
  sejo: {
    label: "한국민족문화대백과사전 — 세조",
    url: "https://encykorea.aks.ac.kr/Article/E0029849"
  },
  jikjeon: {
    label: "한국민족문화대백과사전 — 직전",
    url: "https://encykorea.aks.ac.kr/Article/E0054533"
  }
};
type Source = keyof typeof sources;
// Year precision is intentional: no lunar month/day is relabelled as Gregorian.
// All selected milestones fall within the stated Western calendar year.
const facts: [string, number, string, string, Source][] = [
  [
    "hwangsan",
    1380,
    "황산대첩",
    "이성계 등이 남원 일대에서 왜구를 격퇴했다.",
    "taejo"
  ],
  [
    "wihwado",
    1388,
    "위화도 회군",
    "이성계와 조민수가 요동 정벌군을 돌려 개경으로 돌아왔다.",
    "taejo"
  ],
  [
    "gwajeon",
    1391,
    "과전법 시행",
    "토지 수조권을 재편하는 과전법이 시행되었다.",
    "land"
  ],
  ["mongju", 1392, "정몽주 피살", "이방원 측이 정몽주를 살해했다.", "taejo"],
  [
    "founding",
    1392,
    "조선 건국·태조 즉위",
    "이성계가 왕위에 오르며 새 왕조가 시작되었다.",
    "taejo"
  ],
  [
    "name",
    1393,
    "국호 조선 사용",
    "새 왕조의 국호를 조선으로 정해 사용하기 시작했다.",
    "taejo"
  ],
  ["hanyang", 1394, "한양 천도", "새 왕조의 수도를 한양으로 옮겼다.", "taejo"],
  [
    "palace",
    1395,
    "경복궁·종묘 준공",
    "새 수도의 궁궐과 종묘가 완공되었다.",
    "taejo"
  ],
  [
    "wall",
    1396,
    "한양 도성 축조",
    "한양 도성을 두 차례에 걸쳐 축조했다.",
    "taejo"
  ],
  [
    "first-strife",
    1398,
    "제1차 왕자의 난",
    "이방원이 정도전과 이방석 등을 제거하고 실권을 장악했다.",
    "taejong"
  ],
  ["jeongjong", 1398, "정종 즉위", "태조가 이방과에게 왕위를 넘겼다.", "taejo"],
  [
    "second-strife",
    1400,
    "제2차 왕자의 난",
    "이방원과 이방간의 권력 다툼에서 이방원이 승리했다.",
    "taejong"
  ],
  [
    "taejong",
    1400,
    "태종 즉위",
    "정종의 양위로 이방원이 왕위에 올랐다.",
    "taejong"
  ],
  [
    "return-hanyang",
    1405,
    "한양 재천도",
    "태종이 개경에서 한양으로 수도를 다시 옮겼다.",
    "taejo"
  ],
  [
    "six-ministries",
    1414,
    "육조직계제 시행",
    "육조가 국왕에게 직접 보고하는 체제를 시행했다.",
    "sejong"
  ],
  [
    "sejong",
    1418,
    "세종 즉위",
    "태종의 양위로 충녕대군이 왕위에 올랐다.",
    "sejong"
  ],
  [
    "jiphyeonjeon",
    1420,
    "집현전 설치",
    "궁중 학문 연구와 정책 자문을 위한 집현전을 설치했다.",
    "hall"
  ],
  [
    "council",
    1436,
    "의정부서사제로 전환",
    "세종이 의정부를 통한 국정 심의 체제로 전환했다.",
    "sejong"
  ],
  [
    "hunminjeongeum",
    1446,
    "훈민정음 반포",
    "훈민정음의 완성을 알리는 기록이 실록 음력 9월조에 남아 있다.",
    "hangul"
  ],
  [
    "munjong",
    1450,
    "문종 즉위",
    "세종 사후 왕세자 이향이 왕위를 이었다.",
    "munjong"
  ],
  [
    "danjong",
    1452,
    "단종 즉위",
    "문종 사후 어린 왕세자가 왕위에 올랐다.",
    "danjong"
  ],
  [
    "gyeyu",
    1453,
    "계유정난",
    "수양대군이 김종서·황보인 등을 제거하고 권력을 장악했다.",
    "sejo"
  ],
  [
    "sejo",
    1455,
    "세조 즉위",
    "수양대군이 단종에게 양위를 강요하여 왕위에 올랐다.",
    "sejo"
  ],
  [
    "restoration",
    1456,
    "사육신의 단종 복위 시도",
    "성삼문 등은 단종 복위를 추진했으나 발각되어 처형되었다.",
    "sejo"
  ],
  [
    "abolish-hall",
    1456,
    "집현전 폐지",
    "단종 복위 사건 뒤 세조가 집현전을 폐지했다.",
    "hall"
  ],
  [
    "exile",
    1457,
    "단종 영월 유배",
    "단종은 노산군으로 강등되어 영월로 유배되었다.",
    "sejo"
  ],
  [
    "danjong-death",
    1457,
    "단종 죽음",
    "영월에 유배된 단종이 죽임을 당했다.",
    "danjong"
  ],
  [
    "hojeon",
    1460,
    "경국대전 호전 반행",
    "경국대전 편찬 과정에서 호전이 반행되었다.",
    "sejo"
  ],
  [
    "hyeongjeon",
    1461,
    "경국대전 형전 반행",
    "호전에 이어 형전이 반행되었다. 전체 법전의 최종 완성을 뜻하지 않는다.",
    "sejo"
  ],
  [
    "jikjeon",
    1466,
    "직전법 시행",
    "현직 관리에게 수조권을 지급하는 직전법이 시행되었다.",
    "jikjeon"
  ],
  [
    "yi-siae",
    1467,
    "이시애의 난",
    "함길도에서 이시애가 일으킨 반란을 조정이 진압했다.",
    "sejo"
  ],
  [
    "sejo-end",
    1468,
    "세조 양위",
    "세조가 예종에게 왕위를 넘겼다. 이 연표는 세조 치세까지 다룬다.",
    "sejo"
  ]
];
const operations: ChangeOperation[] = [];
let sequence = 0x1000;
const origin_refs = [{ field: "*", origin_index: 0 }];
function create(
  entity_type: string,
  value: unknown,
  entity_id = id(sequence++)
) {
  operations.push({
    kind: "create",
    entity_type,
    entity_id,
    value,
    origin_refs
  } as ChangeOperation);
  return entity_id;
}
function member(entity_type: "event" | "relation", entity_id: string) {
  operations.push(
    entity_type === "event"
      ? {
          kind: "add",
          entity_type: "event_canon_membership",
          value: { event_id: entity_id, canon_id: canon },
          origin_refs
        }
      : {
          kind: "add",
          entity_type: "relation_canon_membership",
          value: { relation_id: entity_id, canon_id: canon },
          origin_refs
        }
  );
}
const eventRef = (event_id: string) => ({ kind: "event", event_id });
function relation(type: string, source_ref: unknown, target_ref: unknown) {
  const rid = create("relation", {
    world_id: world,
    type,
    source_ref,
    target_ref,
    direction: type === "coincides" ? "undirected" : "directed",
    attributes: {}
  });
  member("relation", rid);
}
create(
  "world",
  {
    slug: "early-joseon",
    title: "조선 전기 — 건국에서 세조까지",
    description:
      "황산대첩(1380)부터 세조 치세 말(1468)까지의 주요 사건. 공개 역사 자료를 바탕으로 만든 실사용 연표. 사건 시점은 서력 연도 정밀도로만 기재하며 정확한 월일이나 지속시간을 주장하지 않는다."
  },
  world
);
create(
  "canon",
  {
    world_id: world,
    slug: "chronicle",
    title: "조선 전기 연표",
    description: "건국·왕위 계승·제도·문화의 흐름을 함께 읽는 연표."
  },
  canon
);
create(
  "time_system",
  {
    world_id: world,
    slug: "gregorian",
    title: "서력 (그레고리력)",
    kind: "calendar",
    definition_version: "1",
    definition: {
      coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
      calendar: "proleptic-gregorian",
      timezone: "UTC",
      fractional_digits: 12,
      leap_second_policy: "reject",
      interval_policy: "half-open",
      capabilities: [
        "canonicalize",
        "equality",
        "compare",
        "boundary",
        "difference"
      ]
    }
  },
  time
);
create("canon_time_system", { canon_id: canon, time_system_id: time });
const events = new Map<string, string>();
facts.forEach(([slug, year, title, summary, source], i) => {
  const eid = create(
    "event",
    {
      world_id: world,
      slug,
      kind: "atomic",
      title,
      summary,
      roles: [],
      attributes: {
        historical_year: year,
        date_precision: "year",
        source_references: [sources[source]]
      }
    },
    id(0x100 + i)
  );
  events.set(slug, eid);
  member("event", eid);
  const yearBoundary = (y: number) => ({
    kind: "time_event",
    time_system_ref: { time_system_id: time },
    definition_version: "1",
    coordinate: `${y}-01-01T00:00:00.000000000000Z`
  });
  relation("not_after", yearBoundary(year), eventRef(eid));
  relation("precedes", eventRef(eid), yearBoundary(year + 1));
  create("narrative", {
    canon_id: canon,
    scope_type: "event",
    scope_id: eid,
    locale: "ko",
    kind: "primary",
    title,
    body: `${summary}\n\n시점: 서력 ${year}년 범위. 월일은 확정하지 않았다. 음력 월일을 그레고리력 날짜로 옮겨 적은 값이 아니다.`,
    public_references: [sources[source]]
  });
});
const periods: [string, string, string][] = [
  ["건국 과정", "hwangsan", "founding"],
  ["태조 치세", "founding", "jeongjong"],
  ["정종 치세", "jeongjong", "taejong"],
  ["태종 치세", "taejong", "sejong"],
  ["세종 치세", "sejong", "munjong"],
  ["문종 치세", "munjong", "danjong"],
  ["단종 치세", "danjong", "sejo"],
  ["세조 치세", "sejo", "sejo-end"]
];
periods.forEach(([title, start, end], i) => {
  const eid = create(
    "event",
    {
      world_id: world,
      slug: `period-${i}`,
      kind: "composite",
      title,
      summary:
        "선별한 사건으로 구성한 역사적 흐름. 경계 사건도 연도 정밀도이므로 정확한 재위 일수는 주장하지 않는다.",
      roles: ["process"],
      attributes: { curation: "선별 연표의 편집상 묶음" }
    },
    id(0x200 + i)
  );
  member("event", eid);
  const a = facts.findIndex((f) => f[0] === start),
    b = facts.findIndex((f) => f[0] === end);
  for (let j = a; j <= b; j++)
    relation("contains", eventRef(eid), eventRef(events.get(facts[j]![0])!));
  relation("starts", eventRef(events.get(start)!), eventRef(eid));
  relation("ends", eventRef(events.get(end)!), eventRef(eid));
});
// Only same-year ordering that is explicit in the cited accounts needs an edge.
for (const [a, b] of [
  ["mongju", "founding"],
  ["first-strife", "jeongjong"],
  ["second-strife", "taejong"],
  ["restoration", "abolish-hall"],
  ["exile", "danjong-death"]
] as const)
  relation("precedes", eventRef(events.get(a)!), eventRef(events.get(b)!));
const plan: ChangePlan = {
  contract_version: 4,
  change_set_id: id(1),
  world_id: world,
  expected_revision: 0,
  intent:
    "사용자 승인: 모든 기존 샘플을 정리한 뒤 조선 건국 과정부터 세조 치세까지의 공개 역사 연표로 교체한다. 기존 작업 World의 접근권한만 유지하며 인증 설정은 바꾸지 않는다.",
  origins: [
    {
      kind: "human_instruction",
      summary:
        "사용자가 기존 샘플 전체 삭제 및 조선 전기 도그푸딩 데이터 작성을 명시 승인했다."
    },
    {
      kind: "source_explicit",
      summary:
        "각 사건의 공개 참고문헌을 Narrative에 보존했다. 서력 연도 정밀도만 사용하며 음력 월일의 미검증 변환은 하지 않는다."
    },
    {
      kind: "llm_inference",
      summary:
        "사건 선별과 건국 과정·치세의 Composite 묶음은 도그푸딩을 위한 편집이다. 원인 관계를 추측해 추가하지 않는다."
    }
  ],
  operations
};
const command = { ...plan, actor: id(0x99) } as CreateChangeSet;
const resolved = resolveCreateOperations(command, () => {
  throw Error("All IDs must be fixed");
});
validateCandidateChangeSet(command, resolved.operations, {
  world: null,
  canons: [],
  timeSystems: [],
  canonTimeSystems: [],
  events: [],
  relations: [],
  narratives: [],
  eventCanonMemberships: [],
  relationCanonMemberships: []
});
writeFileSync(
  new URL(
    "../docs/implementation/fixtures/joseon-dogfood.change-plan.json",
    import.meta.url
  ),
  JSON.stringify(plan, null, 2) + "\n"
);
console.log(
  JSON.stringify({
    events: facts.length + periods.length,
    operations: operations.length,
    world,
    canon,
    time
  })
);
