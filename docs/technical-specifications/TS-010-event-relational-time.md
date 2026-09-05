---
id: TS-010
title: Event 관계 기반 시간 모델
status: draft
traces:
  - CON-003
  - CON-006
  - BR-002
  - BR-004
---

# TS-010 — Event 관계 기반 시간 모델

## 1. 상태와 승인 경계

이 문서는 **draft**다. 현재 accepted인 [TS-002](TS-002-canonical-data-model.md), [TS-003](TS-003-change-revision-publication.md), [TS-004](TS-004-clotho-contract.md), [TS-005](TS-005-derived-models.md), [TS-007](TS-007-portability.md)을 아직 대체하지 않는다. 구현에 착수하려면 이 문서의 미결정 사항을 닫고 영향받는 accepted 문서를 함께 개정·승인해야 한다.

목표는 시간 정밀도마다 타입과 계산 분기를 늘리는 대신, Event와 Relation 하나의 문법으로 다음을 모두 표현하는 것이다.

- 연도만 아는 사건
- 월 또는 날짜까지만 아는 사건
- 밀리초 또는 피코초까지 아는 사건
- 기간에 걸친 사건
- 다른 사건이 진행되는 동안 일어났지만 정확한 일시는 모르는 사건
- 절대 일시 없이 선후 관계만 아는 사건

## 2. 모델의 층

| 층 | 요소 | 지위 |
|---|---|---|
| Canon | Atomic Event, Composite Event, Relation | 저장되는 세계의 사실 |
| 동적 기준 | Time Event | 좌표로부터 결정적으로 구해지며 저장하지 않음 |
| 관리 정보 | provenance, confidence, assertion metadata | 사실을 어떻게 아는지 설명 |
| Projection | TemporalPlacement, timeline geometry, duration view | 필요할 때 계산하는 편의 표현 |

사건의 지속, 알려진 범위, 기록의 확실성, 입력 해상도와 화면 모양은 서로 다른 축이다. 하나의 `kind` 또는 `precision` 필드로 합치지 않는다.

## 3. Event 종류와 경계

### 3.1 Atomic Event

Atomic Event는 모델이 더 작은 구성 사건으로 설명하지 않는 사건이다. Atomic이라는 말은 반드시 물리적 무시간성을 뜻하지 않는다. 정확한 순간을 직접 가리키는 특수 Event는 Time Event뿐이다.

### 3.2 Composite Event

지속되는 Event는 Composite Event로 표현한다. 완결된 지속 Event `D`는 다음을 만족해야 한다.

1. 서로 다른 시작 Event `S`와 종료 Event `E`를 가진다.
2. `D contains S`, `D contains E`가 성립한다.
3. `S starts D`, `E ends D`가 각각 유일하다.
4. `S precedes E`가 성립한다.

진행 중이거나 기록이 불완전한 Composite Event를 commit할 수 있는지는 미결정 사항이다. 허용한다면 “실제로 종료되지 않음”과 “종료를 모름”을 구분해야 한다.

### 3.3 Time Event

Time Event는 Time System 안의 정확한 수학적 좌표 하나를 나타내는 동적 Event다.

- Canon 테이블에 저장하지 않는다.
- create·withdraw·revision 대상이 아니다.
- 같은 Time System, 정의 버전과 좌표는 항상 같은 식별자를 만든다.
- 관계 검증·질의·반출 과정에서 일반 Event처럼 참조할 수 있다.
- 기본 UI에서는 숨기되 설명이나 정밀 편집 시 드러낼 수 있다.

개념적 식별자는 다음 형태를 따른다.

```text
time-event://{time-system-id}/{definition-version}/{canonical-coordinate}
```

`canonical-coordinate`는 JavaScript `number`가 아니다. 피코초 이상을 손실 없이 왕복할 수 있는 정규화된 정수 또는 decimal string이어야 한다. 달력의 연·월·일은 adapter가 Time System의 경계 좌표로 바꾸며, 달력 규칙과 정의 버전을 함께 고정한다.

## 4. 최소 시간 관계

정본의 최소 관계 어휘는 다음과 같다.

| 관계 | 의미 |
|---|---|
| `A precedes B` | A의 위치가 B보다 앞선다 |
| `C contains A` | A가 Composite Event C의 구성 사건이다 |
| `S starts C` | S가 C의 시작 경계다 |
| `E ends C` | E가 C의 종료 경계다 |

`during`, `overlaps`, `same-time`, `not-after` 같은 편의 관계가 필요하면 새 정본 문법으로 바로 늘리지 않는다. 먼저 위 관계와 경계 제약으로 정규화할 수 있는지 검토한다. 역관계를 중복 저장하지 않는다.

`A가 B 중에 일어났다`는 A가 B의 구성요소라는 뜻이 아니다. B의 시작 `S`와 종료 `E`가 있을 때 `S precedes A`와 `A precedes E`로 표현할 수 있다.

## 5. 동일 문법의 예

| 사용자가 아는 사실 | 정본 표현 |
|---|---|
| 220년에 일어남 | `T(220-01-01) precedes X`, `X precedes T(221-01-01)` |
| 220년 7월에 일어남 | `T(220-07-01) precedes X`, `X precedes T(220-08-01)` |
| 특정 날짜에 일어남 | 해당 날짜 0시와 다음 날 0시 사이 |
| 밀리초까지 정확 | 그 좌표와 다음 표현 가능 경계 사이, 또는 정책상 exact Time Event와의 동시 제약 |
| 피코초까지 정확 | 같은 관계 구조에 더 정밀한 lossless 좌표 사용 |
| 기간에 걸친 사건 D | D가 시작 S와 종료 E를 포함하고 `S starts D`, `E ends D` |
| B가 진행되는 동안 A 발생 | `start(B) precedes A`, `A precedes end(B)` |
| A가 B보다 먼저 | `A precedes B`; 절대 좌표 불필요 |

경계의 포함·배제 규칙은 한 정책으로 고정해야 한다. 위 표는 읽기 쉬운 축약이며, 같은 좌표의 사건을 허용할지와 strict/non-strict 비교는 미결정 사항이다.

## 6. Lachesis 제약 해석

Lachesis는 입력 관계를 Event 위치에 대한 상·하한 제약으로 정규화할 수 있다. 이 내부 normal form은 solver 구현이며 새로운 세계 엔티티가 아니다.

commit 전에 최소한 다음을 검증한다.

- `precedes` cycle과 자기 선행
- Composite Event 경계의 유일성·소속·순서
- 절대 경계와 상대 관계의 모순
- 서로 다른 Time System 좌표를 변환 규칙 없이 직접 비교하는 오류
- virtual Time Event 식별자와 좌표의 비정규 표현

거절 결과는 충돌에 참여한 Event·Relation·Time Event와 입력 근거를 최소 모순 집합에 가깝게 반환해야 한다. 단순 `invalid temporal data`로 숨기지 않는다.

## 7. Projection과 지연 평가

Atropos와 검색은 정본 관계를 다음과 같은 읽기 모델로 투영할 수 있다.

- earliest/latest bound
- exact/interval/open/relative-only 표시
- 점·막대·불확실 범위 geometry
- 정렬 가능한 timeline key
- 구조적 Duration과 외접 span

Projection은 revision, algorithm version, source Event/Relation을 기록한다. 정본에 없는 절대 시각을 만들거나 상대 순서를 exact timestamp로 꾸며서는 안 된다. 대규모 동적 그래프에서는 viewport·LOD·질의 범위에 따라 지연 계산할 수 있다.

## 8. 기존 TemporalPlacement 호환

현재 `event_temporal_placements`는 전환 기간에 호환 입력·출력으로만 취급한다.

1. legacy Placement를 경계 Time Event와 Relation 제약으로 읽는 adapter를 만든다.
2. 변환이 손실 없는지, 모호한지, 불가능한지를 진단한다.
3. 새 모델과 기존 projector의 결과를 비교한다.
4. canonical write 소유권을 한 번에 전환한다.

같은 사실을 Placement와 Relation에 조용히 이중 기록해서는 안 된다. 충돌 우선순위가 없는 dual-write는 제3의 의미를 만든다.

## 9. Duration

Composite Event의 Duration은 명시적 시작·종료 경계의 위치 차이로만 계산한다. 모든 descendant의 최소·최대 시각은 `descendant span`이라는 별도 projection이다. 두 값이 우연히 같더라도 근거 종류를 합치지 않는다.

경계가 상대 관계만으로 알려져 있으면 Duration은 unresolved일 수 있다. 이 상태는 오류가 아니라 정직한 표현이다.

## 10. 설명 가능성과 반출

모든 시간 파생 결과는 다음을 설명할 수 있어야 한다.

- 어떤 Canon Relation과 virtual Time Event를 사용했는가
- 어느 Time System·정의 버전·calendar adapter를 사용했는가
- 어떤 algorithm version이 계산했는가
- exact, bounded, relative-only, unresolved 중 무엇이며 왜 그런가

`.moirai` 반출은 Time Event 행을 저장하는 대신 이를 다시 만드는 Time System 정의와 canonical reference를 보존해야 한다.

## 11. 미결정 사항

1. `precedes`가 strict인지, 같은 순간을 위한 별도 관계가 필요한가?
2. “ms까지 정확”을 반개구간으로 볼지 exact 좌표+표시 해상도로 분리할지?
3. 진행 중 Composite Event와 단순 미상 종료를 어떻게 구분할지?
4. 달력, 윤초, 음수 연도와 외부 시간척도의 책임 경계는 어디인가?
5. Time System 간 변환의 신뢰도와 버전을 어떻게 저장할지?
6. virtual Time Event를 공개 API에서 일반 Event처럼 조회할지 전용 resolver로만 제공할지?
7. 기존 Placement가 표현한 certainty를 assertion metadata 어디로 옮길지?

## 12. 승인 수용 기준

- 연·월·일·ms·ps 예제가 단위별 Event 타입 없이 통과한다.
- 지속 Event와 알려진 시간 범위가 서로 독립적으로 표현된다.
- 다른 Event 도중이라는 사실을 containment 없이 표현한다.
- 절대 좌표 없는 선후 관계가 유효하다.
- Time Event가 저장되지 않고 동일 입력에서 결정적으로 재생성된다.
- 고정밀 좌표가 저장·API·반출 왕복에서 손실되지 않는다.
- `precedes`와 경계 모순이 commit 전에 설명 가능하게 거절된다.
- Duration은 명시적 경계만, descendant span은 별도로 계산된다.
- Projection은 source evidence와 algorithm version을 가진다.
- legacy Placement 변환의 손실 여부가 자동 분류된다.
- 기존 M4 synthetic World의 의미가 migration 전후 비교된다.
- 영향받는 accepted 명세가 같은 결정으로 개정된다.
