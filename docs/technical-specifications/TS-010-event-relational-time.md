---
id: TS-010
title: Event 관계 기반 시간 모델
status: accepted
traces:
  - CON-003
  - CON-006
  - BR-002
  - BR-004
---

# TS-010 — Event 관계 기반 시간 모델

## 1. 상태와 승인 경계

2026-09-05 사용자가 이 문서의 strictness, virtual reference와 Time System 계약을 승인했다. 이 문서는 accepted이며 [TS-002](TS-002-canonical-data-model.md), [TS-003](TS-003-change-revision-publication.md), [TS-004](TS-004-clotho-contract.md), [TS-005](TS-005-derived-models.md), [TS-006](TS-006-atropos-publication.md), [TS-007](TS-007-portability.md)의 시간 의미를 이 문서와 일치하도록 개정한다. 문서 승인은 runtime·schema migration·시험 World 쓰기를 자동 승인하지 않는다.

목표는 시간 정밀도마다 타입과 계산 분기를 늘리는 대신, Event와 Relation 하나의 문법으로 다음을 모두 표현하는 것이다.

- 연도만 아는 사건
- 월 또는 날짜까지만 아는 사건
- 밀리초 또는 피코초까지 아는 사건
- 기간에 걸친 사건
- 다른 사건이 진행되는 동안 일어났지만 정확한 일시는 모르는 사건
- 절대 일시 없이 선후 관계만 아는 사건

## 2. 모델의 층

| 층         | 요소                                                | 지위                                         |
| ---------- | --------------------------------------------------- | -------------------------------------------- |
| Canon      | Atomic Event, Composite Event, Relation             | 저장되는 세계의 사실                         |
| 동적 기준  | Time Event                                          | 좌표로부터 결정적으로 구해지며 저장하지 않음 |
| 관리 정보  | provenance, confidence, assertion metadata          | 사실을 어떻게 아는지 설명                    |
| Projection | TemporalPlacement, timeline geometry, duration view | 필요할 때 계산하는 편의 표현                 |

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

`canonical-coordinate`는 JavaScript `number`가 아니라 Time System adapter가 검증하는 lossless canonical string이다. 결정적 ID는 `time-event://{time-system-id}/{definition-version}/{coordinate}` 각 path segment를 UTF-8 RFC 3986 percent-encoding하고 hex를 대문자로 정규화한 URI다. `/`는 segment separator에만 사용하고 입력 성분 안에서는 `%2F`로 encoding한다. API는 ID와 함께 세 원래 성분을 항상 반환한다. 달력의 연·월·일은 adapter가 Time System의 경계 좌표로 바꾸며, 달력 규칙과 정의 버전을 함께 고정한다.

Change Plan과 read API의 Event reference는 다음 tagged union을 사용한다.

```json
{
  "kind": "time_event",
  "time_system_ref": { "time_system_id": "019..." },
  "definition_version": "1",
  "coordinate": "2026-09-05T08:13:21.123456789012Z"
}
```

저장 Event는 `{"kind":"event","event_id":"019..."}`, 같은 Change Plan에서 만들 Event는 `{"kind":"event","client_ref":"local-name"}`로 참조한다. `time_event` create·update·withdraw Operation은 존재하지 않는다. validate preview와 read-back은 정규화된 reference에 결정적 `id`와 `persisted: false`를 덧붙인다.

## 4. 최소 시간 관계

정본의 최소 관계 어휘는 다음과 같다.

| 관계            | 의미                                      |
| --------------- | ----------------------------------------- |
| `A precedes B`  | A의 위치가 B보다 엄격하게 앞선다. `A < B` |
| `A not_after B` | A의 위치가 B보다 뒤가 아니다. `A ≤ B`     |
| `A coincides B` | A와 B의 위치가 같다. `A = B`; 대칭 관계   |
| `C contains A`  | A가 Composite Event C의 구성 사건이다     |
| `S starts C`    | S가 C의 시작 경계다                       |
| `E ends C`      | E가 C의 종료 경계다                       |

`not_after`는 calendar bucket의 포함 시작 경계를, `coincides`는 동일 위치를 손실 없이 표현하기 위해 필요한 최소 제약이다. `during`, `overlaps` 같은 편의 관계는 먼저 이 관계와 경계 제약으로 정규화할 수 있는지 검토한다. 역관계를 중복 저장하지 않는다. `coincides` endpoint는 semantic digest를 위해 정규 순서로 직렬화한다.

`A가 B 중에 일어났다`는 A가 B의 구성요소라는 뜻이 아니다. B의 시작 `S`와 종료 `E`가 있을 때 `S not_after A`와 `A precedes E`로 표현할 수 있다.

## 5. 동일 문법의 예

| 사용자가 아는 사실       | 정본 표현                                               |
| ------------------------ | ------------------------------------------------------- |
| 220년에 일어남           | `T(220-01-01) not_after X`, `X precedes T(221-01-01)`   |
| 220년 7월에 일어남       | `T(220-07-01) not_after X`, `X precedes T(220-08-01)`   |
| 특정 날짜에 일어남       | 해당 날짜 0시와 다음 날 0시 사이                        |
| 밀리초 해상도까지 앎     | 그 좌표를 포함하고 다음 1ms 경계를 제외하는 범위        |
| 피코초 해상도까지 앎     | 같은 관계 구조에 더 정밀한 lossless 좌표 사용           |
| 기간에 걸친 사건 D       | D가 시작 S와 종료 E를 포함하고 `S starts D`, `E ends D` |
| B가 진행되는 동안 A 발생 | `start(B) not_after A`, `A precedes end(B)`             |
| A가 B보다 먼저           | `A precedes B`; 절대 좌표 불필요                        |
| A가 정확한 순간 T에 발생 | `A coincides T`; 정확한 순간 자체는 T                   |

calendar·granularity bucket은 `[start, nextBoundary)` 반개구간이다. 따라서 lower bound는 `not_after`, upper bound는 `precedes`를 사용한다. 인접한 연·월·일·ms·ps bucket이 경계에서 겹치지 않으며 시작 순간의 가능성도 보존한다.

## 6. Lachesis 제약 해석

Lachesis는 입력 관계를 Event 위치에 대한 상·하한 제약으로 정규화할 수 있다. 이 내부 normal form은 solver 구현이며 새로운 세계 엔티티가 아니다.

commit 전에 최소한 다음을 검증한다.

- `precedes` cycle과 자기 선행
- `coincides` component 내부의 `precedes`
- strict·non-strict·equality 제약의 결합 모순
- Composite Event 경계의 유일성·소속·순서
- 절대 경계와 상대 관계의 모순
- 변환 규칙 없이 cross-system coordinate arithmetic이나 coordinate-derived 비교를 주장하는 오류
- virtual Time Event 식별자와 좌표의 비정규 표현

거절 결과는 충돌에 참여한 Event·Relation·Time Event와 입력 근거를 최소 모순 집합에 가깝게 반환해야 한다. 단순 `invalid temporal data`로 숨기지 않는다.

서로 다른 Time System에 놓인 일반 Event 사이의 authored `precedes`는 변환이 아니라 독립적인 Canon 사실이므로 허용한다. authored cross-system ordering은 coordinate conversion이나 Duration 계산 능력을 만들지 않는다. 명시적 adapter 없이 cross-system 좌표 차이, 공통 timeline 위치 또는 변환 결과를 요구하면 `unresolved`이고, Change Plan이 그런 계산 결과를 사실처럼 제출하면 validate에서 거절한다.

## 7. Time System과 좌표 능력

Moirai core는 Gregorian을 절대 시간축으로 채택하지 않는다. 모든 Time System은 canonicalize와 equality를 제공하고 다음 능력을 선택적으로 선언한다.

| capability     | 지위 | 의미                                           |
| -------------- | ---- | ---------------------------------------------- |
| `canonicalize` | 필수 | 같은 좌표를 유일한 canonical string으로 만든다 |
| `equality`     | 필수 | 같은 virtual Time Event인지 판정한다           |
| `compare`      | 선택 | 같은 Time System 안의 순서를 계산한다          |
| `boundary`     | 선택 | 연·월·일·해상도 bucket의 다음 경계를 계산한다  |
| `difference`   | 선택 | 두 좌표 사이 Duration을 계산한다               |
| `conversion`   | 선택 | 명시된 다른 Time System으로 변환한다           |

좌표 family는 calendar, ordinal, continuous scalar, relative, custom을 지원할 수 있으나 이는 Event 종류가 아니라 adapter의 문법과 능력이다. Gregorian과 호환되지 않는 가상력, 지질 시간, 빅뱅 이후 임의정밀도 우주 시간도 자기 adapter 안에서 동일한 Time Event·Relation 문법을 사용한다. 지원하지 않는 계산은 좌표를 꾸며내지 않고 `unresolved`로 반환한다.

예를 들어 스타워즈 같은 허구 세계의 달력은 출전이 정의한 custom coordinate를 그대로 보존하며, 정의되지 않은 Gregorian 환산을 만들지 않는다. 빅뱅 직후 사건은 기원 이후 경과량을 임의정밀도 scalar string으로 표현하고 해당 adapter가 제공하는 범위에서만 비교·차이를 계산한다. 칙술루브 충돌과 공룡 멸종은 각각 별도 Event 또는 Composite Event로 두고, 지질 연대의 알려진 범위와 둘 사이의 authored 관계를 함께 보존한다. 학설이 다른 경우에는 Canon 또는 provenance를 분리하며 하나의 exact Gregorian timestamp로 합치지 않는다.

수용시험의 공통 adapter는 `proleptic-gregorian-utc@1`이다.

- UTC와 대문자 `Z`만 허용한다.
- canonical coordinate는 `YYYY-MM-DDTHH:mm:ss.ffffffffffffZ`이고 fraction은 정확히 12자리다.
- 0000–9999년은 네 자리 year를 사용한다. 범위 밖 expanded year는 후속 version에서 별도 문법으로 정의한다.
- proleptic Gregorian leap-year와 날짜 규칙을 사용한다.
- leap second, offset, local timezone, `24:00`, 생략되거나 12자리가 아닌 fraction은 canonical reference에서 거절한다.
- 연·월·일 경계는 해당 calendar의 다음 연·월·일 시작이다. ms와 ps 경계는 각각 정확히 `0.001000000000s`, `0.000000000001s`를 더한다.
- API·DB·Publication·export의 좌표는 string이다. 내부 비교가 tuple 또는 arbitrary-precision 표현을 사용해도 이를 canonical 좌표 대신 저장하거나 JSON number로 노출하지 않는다.

향후 지역 civil time adapter는 IANA zone, tzdb version, ambiguous/nonexistent local time 정책과 변환 provenance를 정의해야 한다. 이 정보가 없으면 UTC로 추측하지 않는다.

## 8. Projection과 지연 평가

Atropos와 검색은 정본 관계를 다음과 같은 읽기 모델로 투영할 수 있다.

- earliest/latest bound
- exact/interval/open/relative-only 표시
- 점·막대·불확실 범위 geometry
- 정렬 가능한 timeline key
- 구조적 Duration과 외접 span

Projection은 revision, algorithm version, source Event/Relation을 기록한다. 정본에 없는 절대 시각을 만들거나 상대 순서를 exact timestamp로 꾸며서는 안 된다. 대규모 동적 그래프에서는 viewport·LOD·질의 범위에 따라 지연 계산할 수 있다.

## 9. 기존 TemporalPlacement 호환

현재 `event_temporal_placements`는 전환 기간에 호환 입력·출력으로만 취급한다.

1. legacy Placement를 경계 Time Event와 Relation 제약으로 읽는 adapter를 만든다.
2. 변환이 손실 없는지, 모호한지, 불가능한지를 진단한다.
3. 새 모델과 기존 projector의 결과를 비교한다.
4. canonical write 소유권을 한 번에 전환한다.

같은 사실을 Placement와 Relation에 조용히 이중 기록해서는 안 된다. 충돌 우선순위가 없는 dual-write는 제3의 의미를 만든다.

## 10. Duration

Composite Event의 Duration은 명시적 시작·종료 경계의 위치 차이로만 계산한다. 모든 descendant의 최소·최대 시각은 `descendant span`이라는 별도 projection이다. 두 값이 우연히 같더라도 근거 종류를 합치지 않는다.

경계가 상대 관계만으로 알려져 있으면 Duration은 unresolved일 수 있다. 이 상태는 오류가 아니라 정직한 표현이다.

## 11. 설명 가능성과 반출

모든 시간 파생 결과는 다음을 설명할 수 있어야 한다.

- 어떤 Canon Relation과 virtual Time Event를 사용했는가
- 어느 Time System·정의 버전·calendar adapter를 사용했는가
- 어떤 algorithm version이 계산했는가
- exact, bounded, relative-only, unresolved 중 무엇이며 왜 그런가

`.moirai` 반출은 Time Event 행을 저장하는 대신 이를 다시 만드는 Time System 정의와 canonical reference를 보존해야 한다.

## 12. 명시적으로 연기한 결정

- 진행 중 Composite Event와 단순 미상 종료의 구분은 이번 corpus 밖이며 후속 명세에서 결정한다.
- expanded year, 음수 연도와 leap second는 `proleptic-gregorian-utc@1`에서 지원하지 않고 후속 adapter version으로 연기한다.
- Time System 간 conversion의 신뢰도 schema는 실제 conversion adapter 도입 전까지 연기한다.
- 기존 Placement certainty의 assertion metadata migration은 legacy dry-run 분류 뒤 결정한다.
- virtual Time Event는 전용 resolver와 Relation expansion으로 읽는다. 일반 persisted Event 목록에는 나타나지 않는다.

## 13. 승인 수용 기준

표현력의 최종 판정은 [시간 표현력 종단간 수용시험](../implementation/TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md)을 따른다. 아래 항목의 unit test나 타입 구현만으로는 합격이 아니다. 구체적인 corpus를 Clotho로 validate·commit하고 Canon read-back, 계산 projection, Atropos 공개 출력과 export/import까지 확인해야 한다.

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
- 성공·거절 corpus 전체의 실제 입력과 출력 증거가 한 Revision 계보로 남는다.
