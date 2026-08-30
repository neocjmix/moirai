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

## TS-006.1 목적

이 명세는 Atropos가 Publication Snapshot을 읽어 World, Canon, Event, Narrative와 파생 관점을 공개하고, 안정적인 URL과 그래프 탐색을 제공하는 방식을 정의한다.

Atropos는 유일한 공개 사용자 서비스다. 공개 화면은 정본 저장소의 관리 UI가 아니며 내부 데이터 구조를 그대로 노출하지 않는다.

## TS-006.2 기술 기준선

- web application: TypeScript + React + Next.js App Router
- graph interaction/rendering: JointJS 4.x
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

## TS-006.4 Revision 고정 읽기

1. Atropos는 World 진입 시 `current.json`을 한 번 읽는다.
2. 응답에서 얻은 Revision의 manifest를 읽는다.
3. 같은 page 요청과 graph session의 후속 document는 모두 그 Revision 경로에서 읽는다.
4. 탐색 중 새 `current.json`이 생겨도 이미 읽던 document와 섞지 않는다.
5. 사용자가 새 버전을 선택하거나 page를 새로 열 때 최신 Revision으로 이동한다.

Atropos server component와 client component가 각각 `current.json`을 읽어 서로 다른 Revision을 선택해서는 안 된다. server가 선택한 Revision을 page bootstrap data로 전달한다.

## TS-006.5 공개 URL

### 정본 대상 URL

| 대상 | canonical route |
|---|---|
| World | `/worlds/{worldId}` |
| Canon | `/worlds/{worldId}/canons/{canonId}` |
| Event | `/worlds/{worldId}/canons/{canonId}/events/{eventId}` |
| Subject | `/worlds/{worldId}/canons/{canonId}/subjects/{subjectHandleId}` |
| Correspondence 비교 | `/worlds/{worldId}/compare/{correspondenceId}` |

- immutable ID가 URL 정체성을 결정한다.
- slug는 ID 뒤에 사람이 읽는 optional segment 또는 별칭 route로 제공할 수 있다.
- slug 변경 후 이전 별칭은 canonical ID route로 redirect한다.
- Event와 Subject route에는 Canon ID를 포함해 현재 진실 범위를 명확히 한다.
- 어떤 Canon도 생략 가능한 default Canon으로 취급하지 않는다.

### 관점 URL

다음 query parameter는 공유 가능한 탐색 관점을 표현한다.

- `view`: `narrative`, `graph`, `timeline`, `compare`
- `focus`: Event, Subject 또는 correspondence ID
- `timeSystem`: Time System ID
- `range`: 선택한 시간 범위
- `relations`: relation type filter
- `canons`: 비교할 Canon ID 목록
- `zoom`, `x`, `y`: 그래프 viewport를 공유할 때의 정규화된 값

UI 내부의 일시적 panel open 상태와 hover 상태는 URL에 넣지 않는다. 공유 URL을 생성할 때 parameter 순서와 기본값을 정규화한다.

## TS-006.6 World와 Canon 진입

### World page

- World Narrative 또는 설명
- 모든 활성 Canon을 동등한 수준으로 나열
- Canon별 범위와 최근 공개 변경 요약
- 명시적인 Canon 간 correspondence가 있을 때 비교 진입점
- 검색과 전체 구조 탐색 진입점

World page는 첫 Canon을 자동 선택하거나 `primary`, `official`, `alternative`로 분류하지 않는다.

### Canon page

- 현재 Canon임을 지속적으로 보여주는 header와 breadcrumb
- Canon Narrative
- 주요 Process·Composite Event와 Event 탐색
- 선택 가능한 Time System과 Timeline
- 다른 Canon의 대응 대상이 있을 때 명시적인 비교 진입점

## TS-006.7 시각 디자인 기준선

Atropos의 공개 graph surface는 다음 디자인 문법을 유지한다.

- 화면의 중심은 여백 없이 이어지는 fullscreen graph·chronology canvas다.
- 배경은 따뜻한 ivory 계열, 기본 text와 선택 대상은 짙은 slate 계열을 사용한다.
- 강조색은 muted coral·amber 계열을 사용하되 Canon 우열을 암시하는 고정 색 체계를 만들지 않는다.
- chrome은 최소화하고 상단 중앙의 compact status island에 현재 World·Canon·view와 공개 가능한 projection·불확실성 경고를 모은다.
- status island는 pill 상태에서 검색·Canon·Timeline 선택 panel로 확장된다.
- Event detail은 모바일 우선의 bottom sheet로 열리며 peek와 fullscreen 두 단계를 가진다.
- surface는 16~28px의 큰 radius, 얇은 중립 border와 낮은 대비 shadow를 사용한다.
- animation은 짧은 opacity 변화와 `cubic-bezier(0.2, 0.9, 0.22, 1)` 계열의 부드러운 위치·크기 전환을 사용한다.
- graph label은 배경색 outline으로 복잡한 선 위에서도 읽히게 하며 장식보다 정보 계층을 우선한다.

desktop에서는 같은 status island와 detail sheet를 더 넓은 floating panel로 확장할 수 있지만 별도의 완전히 다른 정보 구조를 만들지 않는다. `prefers-reduced-motion`에서는 크기·이동 animation을 줄이거나 제거한다.

## TS-006.8 Event와 Narrative page

Event page는 다음 정보를 구분해 보여준다.

- 저장된 Event title·summary·역할
- Event 범위 Narrative
- 포함 parent와 child Event
- Canon 내부 Relation
- 시간 배치와 실제 precision·uncertainty
- 공개 인용·출처 설명
- 파생 Subject, State, Duration과 Timeline 위치
- 다른 Canon의 명시적 대응

Narrative가 없는 Event도 구조 탐색은 가능해야 한다. 상위 Narrative가 하위 Event의 존재와 의미를 대신하지 않는다.

Markdown은 server에서 안전한 HTML로 변환한다. raw HTML, script URL, event handler와 위험한 embed는 제거한다.

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

- 대상 ID와 canonical URL
- World와 Canon 범위
- 대상 종류
- title과 안전한 snippet
- 결과를 만든 served Revision

relevance는 텍스트 검색 결과의 순위일 뿐 Canon의 진실성이나 우열이 아니다. 결과가 여러 Canon에 걸치면 Canon별로 분리해 표시한다.

## TS-006.11 그래프의 의미 단위

JointJS cell은 Publication projection을 그리는 표현 객체이며 정본 데이터가 아니다.

| 표현 | 의미 |
|---|---|
| point node | atomic Event 또는 현재 LOD의 대표 Event |
| composite region | Composite Event와 포함 범위 |
| process region | `process` 역할의 Composite Event |
| relation link | Canon 내부 Relation |
| subject lane | 파생 Subject의 Event lineage를 읽는 관점 |
| comparison bridge | Canon 간 correspondence를 나타내는 별도 시각 표면 |

comparison bridge를 Canon 내부 Relation과 같은 선 모양·색·layer로 렌더링하지 않는다.

## TS-006.12 그래프 좌표와 layout

기본 Timeline graph는 다음 좌표 의미를 가진다.

- 세로축: 선택한 Time System의 chronology 또는 structural order
- 가로축: Subject lane과 충돌 회피를 위한 파생 배치
- 정확한 authored coordinate가 없는 Event: structural constraint 안의 inferred layout

inferred layout 좌표는 Event의 시간 사실로 표시하거나 export하지 않는다. Event detail은 실제 temporal placement와 layout inference를 구분한다.

### layout pipeline

1. Publication projection이 Event, Relation, 포함 구조와 시간 제약을 준비한다.
2. 시간 배치와 structural order로 가능한 세로 범위를 계산한다.
3. 근거가 부족한 Event를 `unplaced` 또는 제약 범위 안의 inferred position으로 분류한다.
4. Subject·관계 밀도를 고려해 가로 lane을 계산한다.
5. atomic Event를 배치한다.
6. 가장 깊은 Composite Event부터 parent 방향으로 region을 계산한다.
7. Relation endpoint와 route를 계산한다.
8. label priority와 semantic zoom artifact를 생성한다.

같은 입력 Revision과 algorithm version에서 layout은 결정적이어야 한다.

## TS-006.13 Composite region geometry

Composite Event의 경계는 JointJS의 built-in convex hull을 기본으로 사용하지 않는다. Convex hull은 멀리 떨어진 child 사이의 큰 빈 공간과 관련 없는 Event까지 하나의 영역처럼 보이게 할 수 있다.

기본 region 알고리즘은 다음과 같다.

1. 직접 child point의 bounds와 child region polygon을 입력으로 받는다.
2. 세로 chronology 축의 breakpoint마다 child geometry와 만나는 좌우 envelope를 구한다.
3. 좌측 chain과 역순 우측 chain을 연결해 y-sweep polygon을 만든다.
4. polygon을 일정 padding만큼 offset한다.
5. self-intersection을 만들지 않는 closed spline으로 경계를 부드럽게 한다.
6. 지원점이 너무 적거나 잘못된 polygon이면 child bounds envelope, 마지막으로 convex hull 순서로 fallback한다.

이 방식은 child 포함을 보장하면서 세로 구조를 따라 오목한 경계를 허용한다. region은 UI 장식이므로 Event 포함 사실을 결정하지 않는다.

## TS-006.14 JointJS 구성

- `dia.Graph`: 현재 viewport/LOD의 표현 cell만 보유
- `dia.Paper`: async rendering을 사용
- `paper.async = true`: 대량 cell과 region·link view의 단계적 mount를 허용
- node connection point: model center가 아니라 실제 rendered boundary
- 기본 Relation routing: metro router
- Composite region과 label: custom element/view 및 SVG path
- graph mutation: 새 Snapshot 또는 LOD 적용 시 batch 안에서 수행

### 포함 region 갱신

- child layout이 확정된 뒤 deepest-first 순서로 region을 갱신한다.
- parent region은 이미 계산된 child region polygon을 입력으로 사용할 수 있다.
- `fitToChildren`과 같은 단순 사각 bounds는 fallback 또는 hit area로만 사용한다.
- region 갱신이 child 위치를 다시 바꾸는 feedback loop를 만들지 않는다.

### link

- endpoint는 Event ID에 대응한다.
- target marker, direction과 relation type을 접근 가능한 범례로 설명한다.
- routing 결과가 region 내부를 불필요하게 가로지르면 obstacle와 padding을 적용한다.
- Canon 간 correspondence는 별도 overlay paper layer 또는 comparison view에서 렌더링한다.

## TS-006.15 Semantic zoom과 대규모 graph

브라우저에 World 전체 cell을 넣고 CSS로 숨기지 않는다. Publication Snapshot은 범위와 LOD별 artifact를 제공한다.

### LOD 원칙

| 수준 | 표현 |
|---|---|
| overview | Canon Narrative, 주요 Process와 대표 Event |
| process | 선택 Process, 직접 child와 주요 Relation |
| neighborhood | focus Event 주변의 제한된 depth |
| detail | 개별 Event, 정확한 Relation과 label |

- zoom in은 집계 표현을 더 구체적인 실제 Event로 교체한다.
- 화면에 없는 label과 link는 생성하지 않는다.
- 중요한 label의 우선순위는 명시적 policy와 Event 역할로 결정하며 render 순서에 의존하지 않는다.
- 선택 대상과 그 직접 맥락은 일반 LOD보다 우선해 유지한다.
- 요청 budget을 넘으면 `truncated`와 다음 탐색 제안을 반환한다.

## TS-006.16 그래프 상호작용

- pan과 zoom은 pointer, wheel, pinch를 지원한다.
- zoom anchor는 실제 pointer 또는 pinch centroid를 유지한다.
- 선택은 canonical URL의 `focus`와 동기화한다.
- 뒤로가기와 앞으로가기는 focus와 관점 이동을 복원한다.
- node와 region은 keyboard focus와 Enter/Space activation을 지원한다.
- 그래프만으로 제공되는 핵심 정보는 같은 page의 목록·Narrative·Relation 표에서도 접근할 수 있다.
- 모바일에서 drawer는 graph를 완전히 가리지 않는 sheet로 동작하며 닫기와 focus 복귀가 명확해야 한다.

## TS-006.17 Canon 비교 UI

- 비교 중인 각 Canon의 이름과 경계를 항상 표시한다.
- 어느 Canon도 왼쪽, 위쪽 또는 강조색을 이유로 기본·정본처럼 보이지 않게 한다.
- ordering이 필요하면 사용자가 선택한 순서 또는 안정적인 중립 정렬을 사용한다.
- 공통점은 correspondence 기준으로 정렬하고 차이는 Canon별 column 또는 lane에 남긴다.
- Event·Relation·시간·Narrative 차이를 하나의 합쳐진 값으로 만들지 않는다.
- 비교 URL은 correspondence와 Canon ID를 명시한다.

## TS-006.18 cache와 HTTP

- Revision document: content-addressed 또는 Revision path, `Cache-Control: public, max-age=31536000, immutable`
- `current.json`: 짧은 max-age와 revalidation
- HTML page: 선택한 served Revision을 response metadata와 document에 포함
- service worker는 1차 구현의 필수 요소가 아니다.
- browser cache 오류가 최신과 과거 Revision document를 섞지 않게 URL에 Revision을 포함한다.

## TS-006.19 접근성·국제화·일반 웹

- Narrative와 detail page는 JavaScript 없이도 핵심 내용을 읽을 수 있어야 한다.
- graph에는 text alternative와 focus 대상 목록을 제공한다.
- 색만으로 Canon, Relation type, warning을 구분하지 않는다.
- locale fallback은 요청 locale → World 기본 작성 locale → 사용 가능한 첫 locale 순으로 하되 Canon 우열과 무관하다.
- 날짜 표시는 Time System과 원본 precision을 보존한다.
- 모바일 viewport, reduced motion, 고대비와 200% text zoom을 지원한다.

## TS-006.20 수용 기준

1. World page가 특정 Canon을 자동 default로 선택하지 않는다.
2. 공유된 Event URL이 slug 변경 후에도 같은 Event 또는 명시적 tombstone으로 열린다.
3. server-rendered Narrative와 hydrated graph가 같은 served Revision을 읽는다.
4. Snapshot 교체 중 이전 Revision과 새 Revision의 document가 한 화면에 섞이지 않는다.
5. 철회된 Event URL이 private 사유 없이 유효한 공개 안내를 제공한다.
6. Composite region이 모든 직접 child를 포함하고 관련 없는 넓은 빈 공간을 과도하게 감싸지 않는다.
7. graph zoom 중심이 pointer 또는 pinch centroid에 고정된다.
8. low zoom에서 label collision 결과가 render 순서에 따라 달라지지 않는다.
9. graph를 사용할 수 없는 독자도 Narrative와 관계 목록으로 같은 핵심 내용을 탐색한다.
10. Canon 비교 화면이 구조적 Relation과 correspondence를 시각적으로 혼동시키지 않는다.
