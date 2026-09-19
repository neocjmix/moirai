---
id: TS-006
title: Atropos 공개 읽기와 그래프 탐색
status: accepted
layer: technical-specifications
traces:
  - CON-002
  - CON-003
  - CON-005
  - BR-003
  - BR-004
  - BR-007
  - JRN-003
  - JRN-004
  - JRN-005
  - JRN-007
---

# TS-006 — Atropos 공개 읽기와 그래프 탐색

> IP-005 승인 반영: 아래 Graph 중심 UI/URL 계약은 accepted 목표이며 runtime 구현은
> 아직 시작하지 않았다. 현재 배포 증거는 IP-004의 두 읽기 표면 기준이다.
> 실행 제한과 이전 단계는 [IP-005](../implementation/IP-005-graph-reader-consolidation.md),
> 실제 상태는 [CURRENT](../implementation/CURRENT.md)를 따른다.

## TS-006.1 목적

이 명세는 Atropos가 Publication Snapshot을 읽어 World, Canon, Event, Narrative와 파생 관점을 공개하고, 안정적인 URL과 단일·복수 World 그래프 탐색을 제공하는 방식을 정의한다.

Atropos는 유일한 공개 사용자 서비스다. 공개 화면은 정본 저장소의 관리 UI가 아니며 내부 데이터 구조를 그대로 노출하지 않는다.

## TS-006.2 기술 기준선

- web application: TypeScript + React + Next.js App Router
- graph interaction/rendering: 복사된 React/SVG graph shell과 pointer interaction
- text content: server-rendered HTML과 progressive enhancement
- graph surface: client component로 hydration
- styling: CSS Modules와 design token
- public data source: S3-compatible object storage와 CDN의 Revision별 불변 Publication Snapshot

Next.js의 데이터 cache를 Publication의 정본으로 사용하지 않는다. 모든 page와 graph document는 자신이 읽는 `served_revision`을 식별한다.

## TS-006.3 Publication Snapshot 구조

Publication Store는 S3-compatible object storage에 Revision별 artifact를 기록하고 CDN으로 제공한다. 논리적 경로는 다음과 같다.

선택한 object storage는 단일 object의 원자적 교체와 read-after-write consistency를 제공해야 한다. 이 성질을 제공하지 않는 구현에서는 versioned pointer object와 별도의 compare-and-swap metadata를 사용해 같은 보장을 만든다.

```text
/worlds/{worldId}/current.json
/worlds/{worldId}/revisions/{revision}/manifest.json
/worlds/{worldId}/revisions/{revision}/world.json
/worlds/{worldId}/revisions/{revision}/canons/{canonId}.json
/worlds/{worldId}/revisions/{revision}/events/{eventId}.json
/worlds/{worldId}/revisions/{revision}/subjects/{subjectHandleId}.json
/worlds/{worldId}/revisions/{revision}/correspondences/{correspondenceId}.json
/worlds/{worldId}/revisions/{revision}/search/{locale}.json
/worlds/{worldId}/revisions/{revision}/graph/{scope}/{artifact}.json
```

### `current.json`

- `world_id`
- `served_revision`
- manifest URL 또는 key
- format version
- 생성 시각

`current.json`은 포인터이며 짧게 cache하거나 revalidate한다. Revision 경로의 모든 document는 immutable이다.

### `manifest.json`

- World ID와 served Revision
- Publication format version
- 사용한 projection algorithm versions
- 지원 locale
- document와 graph artifact index
- content digest와 completeness
- 이전 Revision과의 public change summary

Event document는 `world_id`와 모든 active `canon_memberships`를 보존하며 Event ID당 하나다. Canon document와 Canon-specific graph/temporal artifact는 membership으로 Event를 선택하고 같은 Event ID를 참조한다.

IP-003 이후 생성하는 Publication format은 `3.0.0`이다. Atropos는 immutable `1.0.0`과
`2.0.0` artifact를 read boundary에서 Event·Relation의 기존 `canon_id`와 그 Canon의 World를
명시적인 `world_id` + 단일 membership으로만 변환한다. 새 v3 membership을 하나로 축소하거나
구 artifact를 덮어쓰지 않는다.

## TS-006.4 Revision 고정 읽기

1. Atropos는 World 진입 시 `current.json`을 한 번 읽는다.
2. 응답에서 얻은 Revision의 manifest를 읽는다.
3. 같은 page 요청과 graph session의 후속 document는 모두 그 Revision 경로에서 읽는다.
4. 탐색 중 새 `current.json`이 생겨도 이미 읽던 document와 섞지 않는다.
5. 사용자가 새 버전을 선택하거나 page를 새로 열 때 최신 Revision으로 이동한다.

Atropos server component와 client component가 각각 `current.json`을 읽어 서로 다른 Revision을 선택해서는 안 된다. server가 선택한 Revision을 page bootstrap data로 전달한다.

복수 World graph session은 각 World에서 위 절차를 독립적으로 수행하고
`world_id → served_revision` vector를 고정한다. 하나의 합성 Revision 번호를 만들거나,
한 source의 실패 때문에 다른 source를 새 Revision으로 이동시키지 않는다.

## TS-006.5 공개 URL

### Graph 중심 공개 진입

- `/`는 `/graph`로 리디렉션한다. 독립 landing/World directory를 기본 화면으로 유지하지 않는다.
- Event의 canonical 읽기 URL은 `/graph/events/{worldId}/{eventId}?revision=N&canon={canonId}`다.
  이 URL은 **Graph Event drawer**의 full 상태를 직접 열고 SSR 핵심 읽기를 제공한다.
- worldId/eventId는 immutable World-owned identity다. canon은 선택적 해석 맥락이며
  지정 시 같은 World 및 해당 Revision의 Event membership을 검증한다.
- Canon 생략 시 임의의 첫 Canon을 default로 선택하지 않는다. membership과 각 Canon의
  Narrative·관계·시간을 구분한다. Event identity를 Canon별로 복제하지 않는다.
- World/Canon/Search/Subject의 읽기·탐색 entry는 Graph의 island/drawer 안에 둔다.
  독립 UI route와 기존 Canon-context Event alias는 제거하며 하위호환 redirect를 만들지 않는다.
  제거된 UI URL은 404가 되어도 된다. slug alias를 새로 만들지 않는다.
- 이 UI 전환은 아직 미공개인 구형 route에 한정한다. §3의 Publication JSON 경로,
  artifact format 호환 및 §9의 정정·철회 identity 계약은 유지한다.
- `/graph/private`, `/graph/explore`, `/graph/settings`의 현재 진입점과 availability를 보존한다.
  이 결정으로 미래 private Publication/ACL/Tenant/E2EE를 활성화하지 않는다.

### 탐색 상태와 공유 URL

실제 query encoding은 `mq`의 URL-encoded JSON(`version: 1`, `query`, `focus`)이다.
query는 target Time System, World/Canon source set, World별 served Revision vector,
scope, entity/relation/diagnostic filter와 budget을 보존한다. source 순서는 의미가 있으므로
정규화 때 임의 정렬하지 않는다. 과거 개별 queryVersion/sources/zoom/x/y 예시를 별도 grammar로 만들지 않는다.

| parameter | 계약 |
| --- | --- |
| `revision` | 대상 World의 양의 safe integer Revision; 명시하면 latest fallback 금지 |
| `canon` | 선택적 해석 context; membership 검증, 생략은 default Canon 선택이 아님 |
| `mq` | versioned Graph query와 semantic focus; 최대 65536자, 유효성 검증 |
| `readerTab`, `readerFind` | island의 sources/entities/search/relations와 검색어; 각 16/512자 상한 |
| `gsViewport` | centerX,centerY,spanX,spanY; 최대 256자, 유한 값/양의 span, 현재 6자리 소수 정규화 |
| `gsEvent`, `gsStage` | `/graph`의 peek 선택 표시 ID와 `peek`; 각 4096/16자 상한. semantic mq.focus와 일치해야 함 |

full path는 Event/full 상태의 권위이며 중복 gsEvent/gsStage를 제거한다.
closed는 `/graph`에서 mq.focus=null, gsEvent/gsStage 없음으로 표현한다.
공유 builder는 parameter 순서·기본값을 정규화하고 안전한 allowlist만 싣는다.
hover/animation, credential, 임의 return URL은 공유하지 않는다.
Event 링크는 실제 href로 새 full URL을 가리키며 관련 World pin과 유효한 Canon 맥락을 유지한다.

revision 생략 시 유효한 mq의 해당 World pin을 사용하고, pin도 없으면 서버가 current를
한 번 resolve해 bootstrap·공유 URL에 served Revision을 고정한다. client는 current를 재조회하지 않는다.
명시 revision과 mq pin 충돌은 invalid-context이며 다른 source를 최신으로 바꾸지 않는다.
path와 mq.focus가 다르면 path 대상에 focus를 정규화하되 기존 source/filter를 유지한다.
잘못된 mq/Canon은 default query로 조용히 대체하지 않는다.
mq 없는 직접 진입도 SSR 읽기가 가능하며 Graph context는 해당 Revision·명시 Canon 또는
동등하게 표시한 Event memberships를 사용한다. 필요한 Time System 선택은 기존 흐름을 따른다.
필터 밖 선택은 bounded 주변 맥락으로 유지하고, unplaced/비호환은 가짜 좌표 없이 명시한다.
세부 전이·정규화 기준은 [IP-005 §3–4](../implementation/IP-005-graph-reader-consolidation.md#3-urlrevision탐색-맥락-계약)를 따른다.

## TS-006.6 World와 Canon 진입

World·Canon은 Graph source/island/drawer에서 읽으며 독립 페이지를 두지 않는다.
기존 읽기 능력과 도메인 의미는 유지한다.

### World 맥락

- World Narrative 또는 설명, 모든 활성 Canon을 동등하게 표시
- overlap과 shared Event 수를 partition처럼 합산하지 않고 설명
- Canon 범위와 최근 공개 변경 요약, 검색과 전체 구조 탐색 진입점
- 첫 Canon 자동 선택 또는 primary/official/alternative 분류 금지

### Canon 맥락

- 현재 선택 Canon과 interpretive scope를 지속적으로 표시
- Canon Narrative, Process·Composite Event·Event 및 derived Subject/Timeline 읽기
- 선택 가능한 Time System과 명시적으로 작성된 correspondence 맥락 보존
- 독립 route 제거를 이유로 도메인 기능을 제거하지 않으며, 미구현 비교 기능을 IP-005에서 새로 구현하지 않음

## TS-006.7 시각 디자인 기준선

Atropos의 공개 graph surface는 다음 디자인 문법을 유지한다.

- 화면의 중심은 여백 없이 이어지는 fullscreen graph·chronology canvas다.
- 배경은 따뜻한 ivory 계열, 기본 text와 선택 대상은 짙은 slate 계열을 사용한다.
- 강조색은 muted coral·amber 계열을 사용하되 Canon 우열을 암시하는 고정 색 체계를 만들지 않는다.
- chrome은 최소화하고 상단 중앙의 compact status island에 현재 Time System,
  World·Canon source set, view와 공개 가능한 projection·불확실성 경고를 모은다.
- status island는 pill 상태에서 source, entity, relation, 검색과 diagnostic query panel로 확장된다.
- Graph Event drawer는 모바일 우선의 bottom sheet로 열리며 peek와 full 두 표시 상태를 가진다. full은 직접 URL로도 진입한다.
- surface는 16~28px의 큰 radius, 얇은 중립 border와 낮은 대비 shadow를 사용한다.
- animation은 짧은 opacity 변화와 `cubic-bezier(0.2, 0.9, 0.22, 1)` 계열의 부드러운 위치·크기 전환을 사용한다.
- graph label은 배경색 outline으로 복잡한 선 위에서도 읽히게 하며 장식보다 정보 계층을 우선한다.

desktop에서는 같은 status island와 detail sheet를 더 넓은 floating panel로 확장할 수 있지만 별도의 완전히 다른 정보 구조를 만들지 않는다. `prefers-reduced-motion`에서는 크기·이동 animation을 줄이거나 제거한다.

## TS-006.8 Graph Event drawer와 Narrative 읽기

Event 읽기 표면은 **Graph Event drawer** 하나다. peek/full은 동일 표면의 표시 상태이며
full 직접 URL의 SSR과 Graph 선택이 같은 읽기 구현·정보 구조를 공유한다.
**Event reading page**와 **Event detail surface**(두 표면 총칭)는 IP-004 이전 구현/evidence를
설명하는 역사적 용어다. drawer/sheet 형태와 dialog의 접근성·모달 동작을 혼동하지 않는다.

Graph Event drawer는 다음 정보를 구분해 보여준다.

- 저장된 Event title·summary·역할
- Event 범위 Narrative
- 포함 parent와 child Event
- Canon 내부 Relation
- Event/Relation 기반 시간 projection과 virtual Time Event의 lossless coordinate
- 공개 인용·출처 설명
- 파생 Subject, State, Duration과 Timeline 위치
- 다른 Canon의 명시적 대응

Narrative가 없는 Event도 구조 탐색은 가능해야 한다. 상위 Narrative가 하위 Event의 존재와 의미를 대신하지 않는다.

Markdown은 server에서 안전한 HTML로 변환한다. raw HTML, script URL, event handler와 위험한 embed는 제거한다.

full 직접 URL은 JavaScript 없이도 핵심 Event/Narrative와 실제 내부 링크를 제공한다.
SSR과 hydration 이후 Graph는 동일 served Revision vector를 사용한다.

## TS-006.9 철회와 정정

- 정정된 대상의 canonical URL은 같은 ID를 유지하고 최신 값을 보여준다.
- 철회된 대상의 canonical URL은 공개 tombstone page를 보여준다.
- tombstone에는 철회 상태, 공개 안내, 대체 대상이 있을 때 그 링크를 제공한다.
- private 철회 사유, actor와 내부 Change Set은 노출하지 않는다.
- 검색과 일반 graph에서는 철회 대상을 정상 콘텐츠로 노출하지 않는다.
- 기존 Relation에서 철회된 대상의 흔적을 보여야 할 필요가 있으면 tombstone reference로 명확히 표시한다.

HTTP status는 대상이 과거 존재했음을 알릴 수 있는 `410 Gone`을 기본으로 하되 page body는 사람이 이해할 수 있게 렌더링한다.

## TS-006.10 검색

Publication Worker는 locale별 공개 검색 document를 생성한다.

### 색인 대상

- World·Canon title과 Narrative
- Event title, summary와 Narrative
- Subject의 파생 label
- Process와 correspondence 공개 설명
- 공개 인용·출처 설명

private source, origin, 내부 validation과 철회된 본문은 색인하지 않는다.

### 검색 결과

- 대상 ID와 Graph 내부 읽기 href; Event는 §5의 full URL
- World와 matched/all Canon membership context
- 대상 종류
- title과 안전한 snippet
- 결과를 만든 served Revision

relevance는 텍스트 검색 결과의 순위일 뿐 Canon의 authority나 우열이 아니다. Event가 여러 Canon에 걸치면 검색 결과 identity는 하나로 유지하고 matched membership context를 함께 표시한다.

## TS-006.11 그래프의 의미 단위

SVG point·segment·region은 Publication projection을 그리는 표현 객체이며 정본 데이터가 아니다.
Canon-specific layout이 다른 경우 표시 instance를 구분하되, World-level Event·Relation
identity와 모든 membership은 query·inspector·stable URL에서 하나로 유지한다.

| 표현              | 의미                                              |
| ----------------- | ------------------------------------------------- |
| point node        | 하나의 atomic Event identity 또는 현재 LOD의 대표 Event |
| composite region  | Composite Event와 포함 범위                       |
| process region    | `process` 역할의 Composite Event                  |
| relation link     | 하나의 World-level Relation identity를 현재 Canon membership context에서 표시 |
| subject lane      | 파생 Subject의 Event lineage를 읽는 관점          |
| comparison bridge | Canon 간 correspondence를 나타내는 별도 시각 표면 |

comparison bridge를 Canon 내부 Relation과 같은 선 모양·색·layer로 렌더링하지 않는다.

## TS-006.12 그래프 좌표와 layout

기본 Timeline graph는 다음 좌표 의미를 가진다.

- 세로축: 선택한 Time System의 chronology 또는 structural order
- 가로축: 고정된 반복 횟수의 deterministic force가 만드는 자유로운 파생 배치
- 정확한 authored coordinate가 없는 Event: structural constraint 안의 inferred layout

inferred layout 좌표는 Event의 시간 사실로 표시하거나 export하지 않는다. Event detail은 authored 시간 Relation, virtual Time Event와 layout inference를 구분한다. exact, bounded, relative-only, unresolved, Event Duration과 knowledge range를 서로 다른 의미로 제공한다.

### layout pipeline

1. Publication projection이 Event, Relation, 포함 구조와 시간 제약을 준비한다.
2. strict·non-strict·equality 시간 Relation, virtual Time Event와 structural order로 가능한 세로 범위를 계산한다.
3. 근거가 부족한 Event를 `unplaced` 또는 제약 범위 안의 inferred position으로 분류한다.
4. seed와 전파된 point를 세로 허용 범위에 놓고 같은 span의 point cluster를 분산한다.
5. 세로 위치를 고정한 채 repulsion과 causal·temporal attraction으로 가로 위치를 계산한다.
6. 가장 깊은 Composite Event부터 parent 방향으로 region을 계산한다.
7. Relation endpoint와 route를 계산한다.
8. label priority와 semantic zoom artifact를 생성한다.

같은 입력 Revision과 algorithm version에서 layout은 결정적이어야 한다.

M4.6 presentation 기준은 chronology spacing `140`, seed lane spacing `110`, force
`32`회, repulsion `0.03`, causal attraction `0.22`, temporal attraction `0.12`,
maximum step `0.22`다. 원본 Gregorian numeric helper를 Moirai 시간 의미로 사용하지
않는다. lossless 시간 제약을 먼저 해석하고 presentation 수치로 변환한 경우 evidence와
approximation을 보존한다. 근거 없는 Event에는 가짜 날짜를 만들지 않는다.

## TS-006.13 Composite region geometry

Composite Event의 경계는 convex hull을 기본으로 사용하지 않는다. Convex hull은 멀리 떨어진 child 사이의 큰 빈 공간과 관련 없는 Event까지 하나의 영역처럼 보이게 할 수 있다.

기본 region 알고리즘은 다음과 같다.

1. 직접 child point의 bounds와 child region polygon을 입력으로 받는다.
2. 세로 chronology 축의 breakpoint마다 child geometry와 만나는 좌우 envelope를 구한다.
3. 좌측 chain과 역순 우측 chain을 연결해 y-sweep polygon을 만든다.
4. polygon을 일정 padding만큼 offset한다.
5. self-intersection을 만들지 않는 closed spline으로 경계를 부드럽게 한다.
6. 지원점이 너무 적거나 잘못된 polygon이면 child bounds envelope, 마지막으로 convex hull 순서로 fallback한다.

이 방식은 child 포함을 보장하면서 세로 구조를 따라 오목한 경계를 허용한다. region은 UI 장식이므로 Event 포함 사실을 결정하지 않는다.

## TS-006.14 SVG graph surface 구성

- graph shell은 현재 viewport와 retention에 필요한 point·segment·region만 보유한다.
- world→screen 변환은 `size / 2 + translation + world * scale`이며 X/Y scale을 독립 적용한다.
- 화면 모서리를 역변환하고 min/max를 정규화해 world bbox를 계산한다.
- point, Relation segment와 Composite polygon을 기존 SVG layer·label policy로 그린다.
- core viewport 응답 뒤 full 응답과 idle prefetch를 적용하되 오래된 query 응답이 새 결과를 덮지 않는다.
- renderer는 Moirai 정본을 수정하지 않으며 presentation shape와 의미 sidecar를 분리한다.

### 포함 region 갱신

- child layout이 확정된 뒤 deepest-first 순서로 region을 갱신한다.
- parent region은 이미 계산된 child region polygon을 입력으로 사용할 수 있다.
- 단순 사각 bounds는 fallback 또는 hit area로만 사용한다.
- region 갱신이 child 위치를 다시 바꾸는 feedback loop를 만들지 않는다.

### link

- endpoint는 Event ID에 대응한다.
- target marker, direction과 relation type을 접근 가능한 범례로 설명한다.
- routing 결과가 region 내부를 불필요하게 가로지르면 obstacle와 padding을 적용한다.
- Canon 간 correspondence는 별도 overlay layer 또는 comparison view에서 렌더링한다.

## TS-006.15 Semantic zoom과 대규모 graph

브라우저에 World 전체 cell을 넣고 CSS로 숨기지 않는다. Publication Snapshot은 범위와 LOD별 artifact를 제공한다.

### Spatial artifact 읽기

요청 bbox는 가로·세로 span의 `1.5`배를 각각 양쪽에 더한다. 기본 y-band 크기는
`4096`이며 `floor(minY / bandSize) - 1`부터 `floor(maxY / bandSize) + 2`까지
읽는다. region은 뒤 overscan `3`과 band `0`을 유지한다. point는 한 band,
segment·region은 교차하는 모든 band에 색인한다. band가 비어 있음과 누락됨을 구분한다.

선택 entity는 bbox 밖에서도 유지하고 요청 시 직접 neighbor와 parent/child region
closure를 읽는다. 이 탐색은 선택한 World·Canon·Revision 범위를 벗어나지 않는다.
Canon은 사용자가 선택한 순서대로 local X에 누적 `widthHint + preferredGap`을 더해
합성한다. presentation ID로 중복을 제거하며 budget 초과와 partial missing을
diagnostic·`truncated`로 공개한다. metadata·entity index도 browser 전량 적재의
우회로가 되어서는 안 된다. cache는 Revision과 scope에 고정하고 실패한 promise를
제거해 같은 Revision에서 재시도한다. 다른 Revision으로 조용히 fallback하지 않는다.

### LOD 원칙

| 수준         | 표현                                       |
| ------------ | ------------------------------------------ |
| overview     | Canon Narrative, 주요 Process와 대표 Event |
| process      | 선택 Process, 직접 child와 주요 Relation   |
| neighborhood | focus Event 주변의 제한된 depth            |
| detail       | 개별 Event, 정확한 Relation과 label        |

- zoom in은 집계 표현을 더 구체적인 실제 Event로 교체한다.
- 화면에 없는 label과 link는 생성하지 않는다.
- 중요한 label의 우선순위는 명시적 policy와 Event 역할로 결정하며 render 순서에 의존하지 않는다.
- 선택 대상과 그 직접 맥락은 일반 LOD보다 우선해 유지한다.
- 요청 budget을 넘으면 `truncated`와 다음 탐색 제안을 반환한다.

## TS-006.16 그래프 상호작용

- pan과 zoom은 pointer, wheel, pinch를 지원한다.
- zoom anchor는 실제 pointer 또는 pinch centroid를 유지한다.
- 선택은 §5의 full path 또는 `/graph`의 mq.focus와 gsEvent에 일관되게 동기화한다.
- 뒤로가기와 앞으로가기는 focus·관점·Revision·viewport와 peek/full/closed를 복원하며 새 history entry를 만들지 않는다.
- node와 region은 keyboard focus와 Enter/Space activation을 지원한다.
- 그래프만으로 제공되는 핵심 정보는 같은 page의 목록·Narrative·Relation 표에서도 접근할 수 있다.
- 모바일 peek는 graph 일부를 남기고 full은 전체 읽기 영역을 사용한다. 축소와 닫기는 별개다.
- full → peek는 동일 Event를 유지하고 drawer/island/safe area를 제외한 실제 가용 영역에
  Event와 필요한 bounded 주변 맥락을 적정 배율로 포커싱한다. offscreen·직접 진입도 동작한다.
  이전 viewport로 복원하거나 선택을 닫는 동작으로 대체하지 않는다.
- 사용자 선택/확대/축소/닫기는 의미 있는 전이마다 push 1회, 같은 상태는 no-op이다.
  viewport·pin 정규화는 replace하며 상태 복원 중 push/진동을 만들지 않는다.
- 닫기는 selection을 해제하고 탐색 context를 유지한다. keyboard focus는 trigger 또는
  직접 진입 시 합리적 Graph focus target으로 복귀한다. 모달 동작의 focus containment를 보존한다.
- 현재 URDR renderer/layout/pan/zoom, viewport continuity·선택 retention·label hysteresis를 유지한다.
- invalid ID/membership/query, unavailable Revision, loading/error/retry를 구분한다.
  retry는 같은 pin을 사용하며 stale 선택 응답이 새 drawer를 덮지 못한다.

## TS-006.17 Canon 비교 UI

- 비교 중인 각 Canon의 이름과 경계를 항상 표시한다.
- 어느 Canon도 왼쪽, 위쪽 또는 강조색을 이유로 기본·정본처럼 보이지 않게 한다.
- ordering이 필요하면 사용자가 선택한 순서 또는 안정적인 중립 정렬을 사용한다.
- 공통점은 correspondence 기준으로 정렬하고 차이는 Canon별 column 또는 lane에 남긴다.
- 같은 Event identity의 direct membership은 correspondence 없이 shared node/row로 정렬한다.
- Event·Relation·시간·Narrative 차이를 하나의 합쳐진 값으로 만들지 않는다.
- 비교가 제공되는 Graph 관점은 correspondence와 Canon ID를 명시한다. 독립 compare route를 IP-005에서 새로 구현하지 않는다.

## TS-006.18 cache와 HTTP

- Revision document: content-addressed 또는 Revision path, `Cache-Control: public, max-age=31536000, immutable`
- `current.json`: 짧은 max-age와 revalidation
- HTML page: 선택한 served Revision을 response metadata와 document에 포함
- service worker는 1차 구현의 필수 요소가 아니다.
- browser cache 오류가 최신과 과거 Revision document를 섞지 않게 URL에 Revision을 포함한다.

## TS-006.19 접근성·국제화·일반 웹

- Graph Event drawer의 full 직접 URL은 JavaScript 없이도 핵심 Event/Narrative·관계·출처를 읽고 실제 URL 링크를 따라갈 수 있어야 한다. SSR을 hydration 뒤 client fetch로 대체하지 않는다.
- graph에는 text alternative와 focus 대상 목록을 제공한다.
- 색만으로 Canon, Relation type, warning을 구분하지 않는다.
- locale fallback은 요청 locale → World 기본 작성 locale → 사용 가능한 첫 locale 순으로 하되 Canon 우열과 무관하다.
- 날짜 표시는 Time System과 원본 precision을 보존한다.
- Gregorian과 호환되지 않는 Time System을 임의의 Gregorian 날짜로 표시하지 않는다. 지원하지 않는 계산은 접근 가능한 텍스트와 공개 JSON에서 unresolved 이유를 제공한다.
- 모바일 viewport, reduced motion, 고대비와 200% text zoom을 지원한다.

## TS-006.20 수용 기준

1. Graph의 World/Canon 진입이 특정 Canon을 자동 default로 선택하지 않는다.
2. §5의 공유 Event full URL이 직접 진입/reload/내부 링크에서 같은 Event 또는 명시적 tombstone으로 열린다.
3. server-rendered Narrative와 hydrated graph가 같은 served Revision을 읽는다.
4. Snapshot 교체 중 이전 Revision과 새 Revision의 document가 한 화면에 섞이지 않는다.
5. 철회된 Event URL이 private 사유 없이 유효한 공개 안내를 제공한다.
6. Composite region이 모든 직접 child를 포함하고 관련 없는 넓은 빈 공간을 과도하게 감싸지 않는다.
7. graph zoom 중심이 pointer 또는 pinch centroid에 고정된다.
8. low zoom에서 label collision 결과가 render 순서에 따라 달라지지 않는다.
9. graph를 사용할 수 없는 독자도 Narrative와 관계 목록으로 같은 핵심 내용을 탐색한다.
10. Canon 비교 화면이 구조적 Relation과 correspondence를 시각적으로 혼동시키지 않는다.
11. bounded 연·월·일은 아는 범위까지만 표시하고 ms·ps canonical coordinate는 공개 JSON과 상세 텍스트에서 손실 없이 읽힌다.
12. child membership과 during-only 제약을 구분하고 relative-only Event에 날짜를 발명하지 않는다.
13. 선택한 Time System과 호환되는 World만 복수 source에 추가할 수 있다.
14. 복수 World graph와 text fallback이 같은 World별 Revision vector를 읽는다.
15. 같은 화면의 World·Canon이 사실, Relation, Subject 또는 Revision 하나로 병합되지 않는다.
16. 이름·slug·calendar kind가 같다는 이유만으로 Time System compatibility를 만들지 않는다.
17. 동일 Event가 여러 선택 Canon에 참여해도 stable identity와 graph node를 무조건 복제하지 않는다.
18. Event artifact와 export/import가 모든 Canon membership을 보존한다.
19. `/`는 `/graph`로 연결되고 제거한 독립 UI route는 404이며 내부 stale href가 없다.
20. full→peek는 offscreen/직접 진입에서도 동일 Event를 가용 영역의 적정 위치·배율로 보여준다.
21. collapse/close가 구분되고 history와 URL/UI/selection/탐색 context가 일치한다.
22. no-JS 핵심 읽기·안전한 Markdown·keyboard/focus/reduced motion·모바일 접근성을 보존한다.
23. private/explore/settings의 기존 진입·availability와 Publication JSON/Graph API/health/status가 보존된다.
24. 전량 fetch·race/stale response·Revision 혼합·viewport continuity/hysteresis 회귀가 없다.
25. canonical 데이터/schema 의미와 기존 immutable artifact를 변경하지 않는다.

IP-005는 위 승인된 읽기·UI 전환을 수행하는 별도 계획이며, 이 명세 변경으로 M5 또는
미구현 lifecycle/비교/portability 기능이 활성화되지는 않는다.

## TS-006.21 복수 World graph query composition

복수 World graph는 canonical federation이 아니라 Atropos의 read-only composition이다.

1. 사용자가 하나의 target Time System 관점을 선택한다.
2. Atropos는 accepted adapter 계약으로 target과 비교 가능한 source Time System을 찾는다.
3. 호환 Time System을 사용하는 World를 복수 선택하고 각 World의 Canon을 복수 선택한다.
4. source별 `current.json`에서 선택한 served Revision을 고정한 뒤 immutable artifact만 읽는다.
5. 결과는 World·Revision, Event identity와 matched/all Canon membership context를 모든 Event,
   Relation, 파생 결과와 diagnostic에 보존한다.
6. cross-World Event identity, Relation 또는 Canon correspondence는 별도 명시적 근거
   없이 만들지 않는다. 같은 World 안의 shared Event membership은 cross-World identity가 아니다.

Time System 호환성과 Event 배치 가능성은 구분한다. World가 선택한 target과
호환되더라도 시간 근거가 없는 Event는 제거하거나 가짜 좌표를 부여하지 않고
`unplaced`로 남긴다.

복수 World query의 의미 결과는 renderer cell과 독립적이어야 한다. 기존 UI를 위한
adapter가 일부 의미를 표시하지 못하면 그 손실을 diagnostic으로 공개하며, renderer의
제약을 Publication 또는 graph query contract로 역전파하지 않는다.
