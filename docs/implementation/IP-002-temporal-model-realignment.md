---
id: IP-002
title: 시간 모델 재정렬 구현 계획
status: accepted
depends_on:
  - TS-010
---

# IP-002 — 시간 모델 재정렬 구현 계획

이 계획은 2026-09-05 의미 결정과 함께 accepted됐다. 이는 runtime·schema migration·배포·시험 World 쓰기를 한꺼번에 승인하지 않는다. 각 slice의 변경과 외부 write는 아래 checkpoint를 지킨다.

## 목표와 금지선

목표는 Event/Relation 기반 시간을 도입하면서 현재 M4-D 기준선, revision 원자성, publication 불변성, 재현 가능한 파생 모델을 보존하는 것이다.

## 완료 후 IP-001 복귀 지점

IP-002는 IP-001을 대체하지 않는 시간 모델 교정 interrupt다. IP-002의 종단간 수용시험과 종료 checkpoint가 통과하면 [IP-001 Milestone 4](IP-001-first-product-plan.md#ip-0018-milestone-4--파생-모델비교그래프)의 **M4-D 다음 단계인 JointJS graph·scope artifact 기본 탐색**으로 복귀한다. 이어서 vertical chronology, subject lane, metro routing, composite region, semantic zoom·LOD와 Canon 비교를 진행하고 Milestone 4 종료조건을 모두 만족한 뒤에만 Milestone 5로 넘어간다.

IP-002 완료를 M4 또는 IP-001 전체 완료로 해석하지 않는다. `CURRENT.md`는 IP-002가 끝날 때 이 복귀 지점을 활성 slice로 명시해야 한다.

- 기존 Placement 행을 삭제하거나 덮어쓰지 않는다.
- 승인 전 schema migration과 canonical write 변경을 하지 않는다.
- Branch·Run·시간여행 설계를 끌어들이지 않는다.
- JointJS 작업과 시간 정본 변경을 한 PR에 섞지 않는다.
- production에서 최초 검증하지 않는다. synthetic fixture와 shadow 비교가 먼저다.
- rollback 불가능한 전환은 하지 않는다.

## 전환 흐름

```mermaid
flowchart TD
    A["의미 결정"] --> B["기존 동작 특성화"]
    B --> C["virtual Time Event와 solver"]
    C --> D["Placement 호환 adapter"]
    D --> E["dual-read shadow 비교"]
    E --> F["새 canonical write"]
    F --> G["projector 전환"]
    G --> H["legacy deprecation"]
```

각 화살표는 별도 승인 가능한 체크포인트다. 뒤 단계의 코드를 미리 배포하더라도 feature flag가 의미 전환을 일으키면 안 된다.

## Slice 0 — 문서 결정

산출물:

- TS-010 blocking 계약의 결정과 나머지 항목의 명시적 연기 기록
- TS-002/003/004/005/006/007 영향 diff
- Relation vocabulary와 strictness 결정
- Time System·calendar adapter·고정밀 좌표 계약
- migration 성공·중단 기준

종료 조건: TS-010과 영향받는 상위 문서가 일관된 accepted 상태이고, machine-readable 성공·거절 corpus와 expected Canon·projection·Atropos·round-trip 판정 파일이 존재한다.

2026-09-05 완료 결정:

- `precedes` strict, `not_after` non-strict, `coincides` equality
- `[start, nextBoundary)` 범위
- tagged virtual Time Event reference와 비영속성
- Time System별 lossless canonical string과 capability 기반 adapter
- 수용시험용 `proleptic-gregorian-utc@1`

## Slice 1 — 기존 동작 특성화

코드 의미를 바꾸지 않고 현재 Placement, Timeline, Process Duration, membership State의 동작을 golden test로 고정한다.

| ID  | 사례             | 반드시 보존할 관찰값             |
| --- | ---------------- | -------------------------------- |
| Y   | 연도만 알려짐    | 연 경계와 화면 범위              |
| M   | 월만 알려짐      | 월 경계와 정렬                   |
| D   | 날짜만 알려짐    | 날짜 경계와 timezone 정책        |
| MS  | 밀리초           | lossless API 왕복                |
| PS  | 피코초           | 새 구현에서 number coercion 없음 |
| DUR | 지속 Composite   | 명시적 start/end와 Duration      |
| IN  | 다른 Event 도중  | 비-membership 시간 제약          |
| REL | 상대 선후만 존재 | timestamp 없이 정렬·설명         |
| BAD | 모순 cycle       | commit 전 진단                   |

현재 synthetic World revision과 artifact digest는 비교 근거로 캡처하되 secret이나 bearer token은 저장하지 않는다.

이 표는 기존 구현의 회귀 기준일 뿐 최종 표현력 합격 기준이 아니다. 실제 신규 모델의 합격은 별도 시험 World에 [구체적 corpus](TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md#4-구체적-입력-corpus)를 입력하고 Canon·projection·Atropos 출력까지 확인해야 한다.

2026-09-05 완료: [M4-D 시간 동작 특성화 기준선](M4D-TEMPORAL-CHARACTERIZATION.md)에 current numeric Placement 계약, Timeline relative order·cycle 진단, Process descendant-span Duration, during 비-membership과 membership State 계산을 exact golden output·semantic digest로 고정했다. 이는 알려진 드리프트를 승인된 의미로 승격하지 않는다.

## Slice 2 — virtual Time Event와 solver

독립적인 domain module로 시작한다.

- canonical coordinate codec와 결정적 Time Event ID
- calendar/time-system boundary adapter
- lossless scalar 비교
- Event/Relation 제약 graph normalizer
- cycle·경계·cross-system validator
- 근거 경로와 모순 설명
- Gregorian과 무관한 custom·continuous scalar adapter conformance harness

이 단계는 DB write를 하지 않는다. property test로 좌표 정규화의 멱등성, 순서 보존, serialize/deserialize 왕복을 검증한다.

adapter conformance는 최소한 허구 세계 custom coordinate, 빅뱅 이후 임의정밀도 경과량, 지질 연대의 불확실 범위를 다룬다. 이 사례는 Gregorian 변환 성공을 요구하지 않는다. 대신 원문 좌표 보존, adapter 내부 비교, 지원하지 않는 conversion·difference의 설명 가능한 `unresolved`, authored cross-system 관계의 독립 보존을 판정한다.

## Slice 3 — 호환 adapter와 shadow 비교

legacy Placement를 새 제약 graph로 읽는 일방향 adapter를 추가한다. 결과를 다음으로 분류한다.

- `lossless`: 같은 의미로 변환 가능
- `ambiguous`: 두 가지 이상 해석 가능
- `unsupported`: 새 모델 결정이 더 필요함
- `conflicting`: 기존 Relation과 모순

기존 projector와 새 solver를 같은 revision에 실행해 차이를 기록한다. 사용자 응답과 publication은 계속 기존 경로가 소유한다. 차이를 자동으로 “새 구현이 맞음”으로 처리하지 않는다.

종료 조건: 기준 fixture 전체와 실제 synthetic World에서 차이 목록이 설명되고, 예상하지 못한 차이가 0이다.

## Slice 4 — 추가형 canonical write

TS-010 승인 후에만 수행한다.

1. 기존 schema를 보존한 채 필요한 Relation/assertion reference를 추가한다.
2. 동일 Change Set·revision·audit·outbox 트랜잭션 경계를 유지한다.
3. Clotho validate가 virtual reference와 시간 모순을 commit 전에 보여준다.
4. 신규 시험 World에만 명시적으로 새 canonical write를 활성화한다.
5. 기존 데이터 migration은 별도 dry-run report와 사용자 승인 전에는 실행하지 않는다.

한 요청이 Placement와 Relation 양쪽을 독립 정본으로 쓰게 하지 않는다. 구형 client 입력은 adapter가 새 canonical write 한 경로로만 번역한다. 기존 M4-D World와 production data migration은 종단간 신규 World 검증의 선행 조건이 아니다.

## Slice 5 — projector 전환

- Timeline bound와 정렬을 새 solver에서 계산한다.
- Process Duration은 명시적 boundary evidence만 사용한다.
- descendant extrema는 `descendant span`으로 이름과 근거를 분리한다.
- membership State의 시작·종료도 동일 boundary resolver를 사용한다.
- revision별 artifact와 semantic digest의 결정성을 유지한다.

전환은 World 단위 feature flag 또는 shadow gate로 제한한다. 새/구 projector 결과가 허용된 차이 목록에 없으면 publication target을 전진시키지 않는다.

## Slice 6 — Clotho와 Atropos

Clotho는 사용자의 자연스러운 “220년”, “7월”, “B 도중”, “A가 B보다 전” 입력을 단위별 전용 도구가 아니라 경계와 관계 제안으로 보여준다. validate 결과에는 생성될 virtual Time Event와 모순 근거를 포함한다.

Atropos는 필요할 때 projection을 계산하고 다음을 구분해 표시한다.

- exact coordinate
- bounded interval
- relative-only
- unresolved
- Event duration과 knowledge range

100k/LOD 작업 전 viewport 기반 lazy evaluation 예산과 cache key를 측정한다.

## Slice 7 — legacy 제거

다음 조건을 모두 만족한 뒤 별도 승인으로 수행한다.

- 지원 World의 migration이 lossless 또는 명시적으로 승인된 예외다.
- 두 release 이상 새 canonical write만 사용했다.
- export/import와 rollback rehearsal가 성공했다.
- legacy field를 읽는 client·worker·snapshot이 없다.
- TS-002에서 Placement의 canonical 지위가 공식 제거됐다.

그 전에는 legacy table을 삭제하지 않는다.

## 검증 게이트

각 구현 slice는 해당 package test 외에 저장소 표준 CI를 통과해야 한다. 구체 명령은 당시 `package.json`과 CI workflow를 source of truth로 재확인한다.

필수 검증:

- domain unit/property tests
- PostgreSQL integration과 migration dry-run
- API/MCP contract tests
- worker artifact determinism test
- Atropos SSR와 접근성 smoke
- `.moirai` export/import semantic fingerprint
- 기존 M4-D synthetic World regression
- production 전 Railway staging 또는 승인된 synthetic 범위 검증
- `Temporal Expressiveness Observatory` corpus의 실제 validate→commit→read→publish→export/import 증거

현재 로컬 환경에서 `pnpm`은 ignored build scripts 정책으로 실행이 막힐 수 있다. 이를 우회하려고 dependency 정책을 조용히 바꾸지 말고 CI 또는 승인된 설치 절차를 사용한다.

## 관측과 rollback

관측값:

- adapter 분류별 개수
- solver contradiction·unresolved 비율
- legacy/new projection diff 수
- 계산 latency와 cache hit
- publication 보류 사유

rollback은 단계별로 가능해야 한다.

- Slice 2–3: 코드를 끄면 저장 데이터 변화 없음
- Slice 4: 원본 Placement와 migration map으로 역추적
- Slice 5–6: projector flag를 legacy로 복귀, immutable 이전 artifact 유지
- schema 제거: export/import와 restore rehearsal 전에는 실행 금지

## 다음 세션 체크리스트

1. `docs/implementation/CURRENT.md`와 기준 SHA를 확인한다.
2. `TEMPORAL-MODEL-DRIFT.md`, TS-010, `TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md`, 이 문서를 순서대로 읽는다.
3. 승인된 TS-010 결정과 machine-readable fixture가 유지되는지 확인한다.
4. accepted 문서 변경 범위를 먼저 PR로 제시한다.
5. 승인 전에는 Slice 1의 characterization test 외 runtime 변경을 하지 않는다.
6. 원본 M4-D fixture와 deployment를 건드리지 않는다.
7. 각 slice를 독립 PR·CI·rollback checkpoint로 유지한다.
8. 구현 완료를 주장하기 전에 성공·거절 corpus의 실제 입력과 세 출력면을 증거로 남긴다.

권장 첫 세션의 종료점은 Slice 0 결정과 Slice 1 테스트 계획까지다. schema migration이나 production semantic change가 아니다.
