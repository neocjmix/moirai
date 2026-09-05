---
id: TS-005
title: 파생 모델과 Canon 간 비교
status: accepted
layer: technical-specifications
traces:
  - CON-003
  - CON-004
  - BR-002
  - BR-003
  - BR-004
  - JRN-004
  - JRN-005
  - JRN-007
---

# TS-005 — 파생 모델과 Canon 간 비교

## TS-005.1 목적

이 명세는 Event, Relation, Canon과 Time System으로부터 Subject, Process, State, Duration과 Timeline을 계산하는 공통 규칙을 정의한다. 또한 Canon 내부 사실을 합치지 않고 명시적인 대응을 통해 여러 Canon을 비교하는 방식을 정의한다.

파생 결과는 유용한 해석이지만 새로운 Canon의 사실이 아니다.

## TS-005.2 공통 Projection 계약

모든 projector는 논리적으로 다음 입력과 출력을 가진다.

```ts
project({
  worldId,
  sourceRevision,
  projectionType,
  parameters,
  algorithmVersion
}) => ProjectionResult
```

### 공통 결과

| 필드                | 의미                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| `world_id`          | source World                                                                          |
| `source_revision`   | 정확히 읽은 World Revision                                                            |
| `projection_type`   | Subject, Timeline 등 결과 종류                                                        |
| `algorithm_version` | 계산 규칙 version                                                                     |
| `parameters_digest` | Canon, Time System, 범위와 filter의 digest                                            |
| `items`             | 파생 결과                                                                             |
| `evidence`          | 결과를 지지하는 Event·Relation ID, virtual Time Event reference와 legacy 시간 배치 ID |
| `diagnostics`       | 불충분·모순·손상 정보를 숨기지 않는 진단                                              |
| `completeness`      | `complete`, `partial`, `unresolved`                                                   |

### 결정성

- 같은 source Revision, parameters와 algorithm version은 같은 의미의 결과를 만든다.
- 현재 시각, 배열 입력 순서, 데이터베이스 row 순서와 무작위 값에 결과가 의존하지 않는다.
- 동률 정렬에는 immutable ID를 마지막 기준으로 사용한다.
- UI용 좌표가 달라져도 Subject 구성이나 State 의미가 바뀌지 않는다.

## TS-005.3 파생 결과의 지위

- 파생 결과를 직접 수정하는 write API는 제공하지 않는다.
- 사용자가 결과를 고치려면 근거 Event·Relation·시간 배치 또는 Event의 해석 역할을 수정한다.
- projection cache의 손실은 Canon의 사실 손실이 아니다.
- algorithm version 변경으로 결과가 달라지면 source Revision 변경과 구분한다.
- Atropos는 파생 결과와 저장된 Event·Relation을 시각적으로나 문구상 구분할 수 있어야 한다.

## TS-005.4 Subject Projection

Subject는 하나의 Canon 안에서 동일한 인물·조직·장소·사물로 읽히는 Event 집합이다.

### 입력 graph

- node: 활성 Event
- equivalence edge: relation registry가 identity 계열이면서 `subject_connectivity = equivalent`로 선언한 활성 Relation
- lineage edge: identity 계열이면서 `subject_connectivity = lineage`인 활성 Relation
- 기본 equivalence type: `identity_continues`, `identity_instance_of`
- 기본 lineage type: `identity_splits`, `identity_merges`
- Canon 간 correspondence는 입력 graph에 포함하지 않는다.

### 구성 규칙

1. Canon별로 identity graph를 분리한다.
2. equivalence edge의 weakly connected component를 하나의 Subject 범위로 계산한다.
3. lineage edge는 Subject component 사이의 분기·합류를 연결하지만 두 Subject를 하나로 합치지 않는다.
4. 방향성은 Subject 안의 연속과 복수 instance, Subject 사이의 lineage를 설명하는 데 사용하며 이를 단일 선형 생애로 만들지 않는다.
5. 이름, title, Narrative의 문자열 일치만으로 identity edge를 만들거나 Subject를 합치지 않는다.
6. 연결되지 않은 Event는 필요할 때 하나의 Event로 이루어진 Subject 후보로 읽을 수 있지만 자동으로 영구 handle을 만들 필요는 없다.

시간여행이나 동일 정체성의 복수 instance가 있으면 `identity_instance_of`로 같은 Subject 안의 여러 활성 경로를 표현할 수 있다. 조직·국가 등이 갈라지거나 합쳐져 별개의 정체성이 되는 경우 `identity_splits`·`identity_merges`는 Subject 사이 lineage로 남는다. projection은 어느 경우도 단일 선형 생애로 평탄화하지 않는다.

### Subject 결과

- `subject_handle_id`
- `canon_id`
- label 후보와 선택 근거
- member Event IDs
- identity Relation IDs
- lineage roots, splits, merges와 동시 instance
- 관련 Narrative와 시간 범위 요약
- 진단

label은 저장된 별도 Subject 이름이 아니라 Event title과 Narrative에서 선택한 표현이다. label 변경은 Subject의 정체성을 바꾸지 않는다.

## TS-005.5 Subject Handle reconciliation

[TS-002.11](TS-002-canonical-data-model.md#ts-00211-파생-subject의-안정적-식별)의 `subject_handles`는 projection 재계산 전후에 다음 규칙으로 조정한다.

### 유지

- 기존 anchor Event가 새 component에도 있으면 기존 handle이 그 component를 유지한다.
- component의 다른 member와 label이 바뀌어도 anchor가 유지되면 공개 URL은 유지한다.

### 분리

- 기존 component가 여러 component로 분리되면 anchor를 포함한 component가 기존 handle을 유지한다.
- 나머지 component는 새 handle을 받는다.
- 기존 correspondence가 분리된 component 전체를 뜻했는지 불명확하면 임의로 복제하지 않고 `correspondence_member_ambiguous` 진단을 만든다.

### 병합

- 여러 handle의 component가 병합되면 생성 Revision이 가장 오래된 활성 handle을 대표로 사용한다.
- 나머지 handle은 대표 handle로 redirect한다.
- correspondence member는 redirect를 따라 해석하되 다음 운영 검토에서 대표 handle로 정규화할 수 있다.

### anchor 철회

- 같은 component에 다른 활성 Event가 남아 있으면 생성 Revision과 ID 순으로 안정적인 새 anchor 후보를 제시한다.
- anchor 변경은 운영 기록에 남기고 handle ID는 유지한다.
- component 자체를 결정할 수 없으면 `unresolved`로 두며 다른 Subject에 임의 연결하지 않는다.

## TS-005.6 Process Projection

Process는 `kind = composite`이고 `roles`에 `process`를 가진 Event에서 계산한다.

### 결과

- Process Event ID
- 직접 child Event와 모든 descendant Event
- 직접 포함 Relation과 transitive 포함 경로
- 구조적 시작·종료 Event 후보
- 내부 `precedes`, 인과와 방해 Relation
- 파생 시간 범위와 Narrative
- 불완전·cycle·고립 child 진단

### 규칙

- `contains`의 transitive closure는 projection에서 계산하며 정본 Relation으로 중복 저장하지 않는다.
- child의 시간 범위를 단순 합쳐 Process의 정본 기간으로 저장하지 않는다.
- 모든 Composite Event를 자동으로 Process라고 부르지 않는다.
- Process Narrative는 같은 Event를 scope로 하는 Narrative다.
- 포함 child가 없어도 Event는 저장될 수 있지만 `empty_process` warning을 만든다.

## TS-005.7 State Projection

State는 특정 Subject 또는 범위에 관해 어느 시점·구간에 성립한다고 읽히는 파생 결과다.

State 계산은 범용 LLM 추론을 runtime projector로 사용하지 않는다. relation type registry에 등록된 결정적 reducer가 있는 state family만 계산한다.

### State Rule 정의

| 필드                | 의미                                                           |
| ------------------- | -------------------------------------------------------------- |
| `state_type`        | `membership`, `marriage`, `reign`, `ownership`, `occupancy` 등 |
| `start_patterns`    | 상태 시작을 지지하는 Event·Relation pattern                    |
| `end_patterns`      | 상태 종료를 지지하는 pattern                                   |
| `subject_resolver`  | 상태의 주체와 객체를 찾는 규칙                                 |
| `overlap_policy`    | 중복·복수 상태 처리 규칙                                       |
| `algorithm_version` | rule version                                                   |

### State 결과

- state type과 subject handle
- 대상 또는 값
- earliest/latest start와 end
- open-ended 여부
- evidence IDs
- certainty와 diagnostics

종료 근거가 없으면 현재까지 지속한다고 단정하지 않고 `open_ended`로 표시한다. 서로 모순되는 근거가 있으면 하나를 선택해 숨기지 않고 복수 후보 또는 `unresolved`를 반환한다.

## TS-005.8 Duration Projection

Duration은 Event 또는 State의 명시적 시작·종료 경계에서 계산한다. Composite Event의 모든 descendant 외접 범위는 `descendant span`으로 분리하며 Duration의 대체 근거로 사용하지 않는다.

- 정확한 시작·종료가 있으면 정확한 duration을 계산한다.
- 부정확한 경계가 있으면 최소·최대 duration 범위를 반환한다.
- 서로 다른 Time System 좌표는 명시적인 변환 adapter가 있을 때만 비교한다.
- 변환 불가능한 좌표를 Gregorian 값으로 가정하지 않는다.
- Time System이 difference capability를 제공하지 않으면 경계가 있어도 Duration은 근거와 함께 unresolved다.
- 좌표와 Duration scalar는 JSON number로 축소하지 않고 lossless string과 단위를 반환한다.
- point Event에 0 duration을 자동 저장하지 않는다.
- open-ended 상태에는 완료된 duration 대신 경과 범위 또는 미정 상태를 반환한다.
- display unit 변환은 원본 precision보다 더 정확한 표현을 만들지 않는다.

## TS-005.9 Timeline Projection

Timeline은 선택한 Canon, Event 범위와 Time System에 따른 Event 배열 관점이다.

### 입력

- 하나 이상의 Canon
- Event 또는 Process 범위
- 선택한 Time System
- relation type filter
- 시간 범위와 LOD

### Canon 내부 Timeline

1. strict `precedes`, non-strict `not_after`, `coincides`, 경계와 registry가 시간 방향을 정의한 Relation으로 constraint graph를 만든다.
2. virtual Time Event 좌표를 해당 Time System adapter로 해석한다. legacy Event temporal placement는 호환 adapter를 통해 가능한 범위 제약으로 추가한다.
3. 저장된 precision과 uncertainty를 유지한다.
4. 비교 가능한 Event만 안정적으로 정렬한다.
5. 순서를 결정할 근거가 없는 Event는 같은 unordered group 또는 `unplaced`로 반환한다.
6. 순환 관계는 삭제하지 않고 strongly connected component로 묶어 loop 진단과 함께 표시한다.

서로 다른 Time System에 놓인 일반 Event 사이의 authored ordering은 독립 사실로 보존한다. 이는 coordinate conversion이 아니며 공통 timeline 좌표나 cross-system Duration을 만들지 않는다. adapter가 없는 좌표 계산은 `time_system_incompatible` 또는 capability 진단과 함께 unresolved다.

Timeline은 근거 없는 total order를 만들지 않는다. UI 배치를 위해 임시 좌표를 계산할 수 있지만 `placement_kind = inferred_layout`으로 표시하고 Canon의 시간 사실로 노출하지 않는다.

### 복수 Canon Timeline

- Canon별 lane과 사실 graph를 유지한다.
- 선택한 Time System 또는 명시적 변환으로 좌표가 비교 가능할 때만 같은 축을 사용한다.
- 구조적 Relation은 Canon 경계를 넘겨 그리지 않는다.
- 좌표 호환성은 Canon 간 정체성·사실 병합을 의미하지 않는다.

## TS-005.10 Canon 간 대응 Projection

Canon 비교는 [TS-002.10](TS-002-canonical-data-model.md#ts-00210-canon-간-대응)의 명시적 correspondence를 출발점으로 한다.

### 후보와 확정의 구분

- 문자열, 역할, 시간과 관계 유사성으로 대응 후보를 계산할 수 있다.
- 후보는 score와 근거를 가진 운영 진단이며 자동으로 correspondence가 되지 않는다.
- 작성자가 확정한 correspondence만 Publication과 안정적인 Canon 비교에 사용한다.
- 낮은 score를 Canon의 진실성이나 우열로 해석하지 않는다.

### 비교 결과

- correspondence와 member 목록
- Canon별 Event 또는 Subject 요약
- 각 Canon 안의 시간, Relation, State와 Narrative
- 명시적으로 대응된 공통 범위
- Canon별로만 존재하는 차이
- source Revision, algorithm version과 diagnostics

비교 결과는 공통 Event record, 합쳐진 Subject 또는 통합 Timeline을 생성하지 않는다.

## TS-005.11 evidence와 설명 가능성

모든 사용자에게 의미 있는 파생 결과는 근거로 이동할 수 있어야 한다.

- Subject → member Event와 identity Relation
- Process → Composite Event와 contains Relation
- State → 시작·종료 Event 및 Relation
- Duration → 사용한 시간 배치와 경계
- Timeline 위치 → authored coordinate, structural order 또는 inferred layout 구분
- Canon 비교 → correspondence member와 각 Canon의 독립 사실

Atropos가 근거를 축약해 보여도 public Snapshot에는 공개 가능한 evidence ID가 남아 있어야 한다.

## TS-005.12 진단

대표 진단 code:

- `identity_component_ambiguous`
- `subject_anchor_unresolved`
- `containment_cycle`
- `empty_process`
- `state_boundary_missing`
- `state_evidence_conflict`
- `time_system_incompatible`
- `time_system_capability_missing`
- `temporal_constraint_conflict`
- `timeline_cycle`
- `timeline_unplaced`
- `correspondence_member_ambiguous`
- `projection_input_withdrawn`

진단은 정본 사실을 자동 수정하지 않는다. 오류 수준의 진단은 해당 projection 일부를 `unresolved`로 만들 수 있지만 다른 독립 범위의 결과까지 숨기지 않는다.

## TS-005.13 cache와 invalidation

Projection cache key는 최소한 다음을 포함한다.

- World ID와 source Revision
- projection type
- algorithm version
- parameters digest

Revision이 바뀌면 이전 cache를 수정하지 않고 새 결과를 만든다. scoped rebuild를 위해 projector는 사용한 evidence ID를 dependency index로 반환할 수 있다.

- identity Relation 변경 → 관련 Subject, correspondence comparison, Subject Timeline
- contains·process role 변경 → Process, State, Duration, graph region
- 시간 배치·시간 방향 Relation 변경 → Duration, Timeline과 graph layout
- Narrative 변경 → 설명·검색 projection
- correspondence 변경 → Canon 비교만 재계산하며 Canon 내부 projection은 유지

전체 rebuild와 scoped rebuild는 같은 projector 코드를 사용해야 한다.

## TS-005.14 수용 기준

1. Canon A의 identity Relation이 Canon B의 Subject 구성을 바꾸지 않는다.
2. 이름이 같은 두 대상이 명시적 identity 근거 없이 한 Subject로 합쳐지지 않는다.
3. identity graph 분리·병합 뒤 기존 Subject URL이 유지되거나 명시적으로 redirect된다.
4. 시간여행의 복수 instance가 단일 선형 생애로 평탄화되지 않는다.
5. contains closure를 삭제하고 재생성해도 정본 Event·Relation은 변하지 않는다.
6. 불확실한 시간에서 계산한 Duration이 단일 정확한 값으로 과장되지 않는다.
7. 순서 근거가 없는 Event가 임의의 total order로 공개되지 않는다.
8. Timeline cycle이 데이터 삭제 없이 loop로 표시된다.
9. Canon 비교가 어느 Canon도 기본·정본으로 표시하지 않는다.
10. 같은 Revision과 algorithm version의 전체 rebuild와 scoped rebuild가 같은 의미의 결과를 만든다.
11. Gregorian과 호환되지 않는 Time System이 자기 canonical coordinate를 보존하며 지원하지 않는 cross-system 계산을 꾸며내지 않는다.
