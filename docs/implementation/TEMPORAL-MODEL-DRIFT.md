# 시간 모델 드리프트 분석과 세션 인계

이 문서는 **비규범 분석 기록**이다. 현재 accepted 명세나 실행 코드를 바꾸지 않는다. 제안 모델은 [TS-010](../technical-specifications/TS-010-event-relational-time.md), 이행 순서는 [IP-002](IP-002-temporal-model-realignment.md)에서 검토한다.

## 고정한 기준선

| 항목 | 값 |
|---|---|
| 문서 기준 main | `52dc241aeb7d48d658c4fbb7465c8a1fd448928a` |
| 배포 application SHA | `350920bbdb3928f34e406940b9d9f0d95f7e8c65` |
| 보호 브랜치 | `baseline/m4d-2026-09-05` |
| 로컬 annotated tag | `baseline-m4d-2026-09-05` — 원격 push 대기 |
| main CI | `33950185636` success |
| post-deploy smoke | `33950258266` success |

원격 tag가 필요하면 Git 인증이 있는 환경에서 다음 한 줄만 실행한다.

```bash
git push origin refs/tags/baseline-m4d-2026-09-05
```

## 비교한 URDR 근거

검토 당시 Urdr head는 `0267c8fd...`였다. 다음 blob을 기준으로 원래 모델의 의도를 복원했다.

| 자료 | blob |
|---|---|
| GOAL_INDEX | `76402d...` |
| URDR_01 | `89a05e...` |
| URDR_02 | `d8ea873...` |
| URDR_03 | `613022...` |
| URDR_07 | `3716f4...` |
| new-order | `1a46b8...` |

## 복원된 핵심 원칙

1. 세계의 근본 엔티티는 Event와 Relation이다.
2. 어떤 사건의 시작과 종료도 각각 Event다.
3. 순간적이지 않은 사건은 시작·종료 Event를 포함하는 Composite Event다.
4. 정확한 수학적 순간을 뜻하는 Event는 Time Event뿐이다.
5. “어느 날 일어났다”는 별도 정밀도 값이 아니라 그날 0시 Time Event와 다음 날 0시 Time Event 사이의 관계다.
6. 연·월·밀리초·피코초도 같은 구조로 표현한다. 단위별 enum과 분기 로직을 늘리지 않는다.
7. Time Event는 좌표로부터 결정적으로 만들어지는 동적 Event이며 Canon에 저장하지 않는다.
8. 편의용 `TemporalPlacement`는 Atropos projection 또는 호환 입력일 수 있지만 Lachesis의 세계 의미가 되어서는 안 된다.

시간 표현에서 서로 독립적으로 보존해야 하는 축은 다음과 같다.

| 축 | 예 | 관계 모델에서의 위치 |
|---|---|---|
| 사건 자체의 지속 | 전투가 사흘간 지속 | Composite Event와 시작·종료 경계 |
| 알려진 시간 범위 | 220년에 일어남 | 두 virtual Time Event 사이 제약 |
| 입력 해상도 | 연, 월, ms, ps | 경계 좌표를 해석하는 adapter |
| 확실성·출처 | 추정, 기록 A | assertion provenance와 confidence |
| 화면 표현 | 점, 막대, 범위 | 지연 계산되는 projection |

## 현재 Moirai와의 드리프트

### 1. Placement가 정본 의미를 소유한다

[TS-002](../technical-specifications/TS-002-canonical-data-model.md)는 `event_temporal_placements`를 정본 테이블로 두고 `point | interval`, earliest/latest start/end, precision, certainty를 한 레코드에 담는다. 이 구조는 사건의 지속, 지식의 불확실성, 입력 단위와 화면 모양을 한 모델에 겹친다.

### 2. 시간 문법이 둘이다

현재는 Placement의 수치 경계와 Event 사이의 `precedes`가 나란히 시간 의미를 표현한다. 둘이 충돌했을 때 어느 쪽이 우선인지, 한쪽만 존재할 때 무엇을 추론하는지 일관된 규칙이 없다.

### 3. virtual Time Event 계약이 없다

연·월·일·고정밀 순간을 동일한 Event/Relation 문법으로 다룰 수 있는 결정적 식별자, 달력 변환, 정렬 가능한 좌표, 비영속성 규칙이 없다. 따라서 `precision` enum이나 단위별 조건문이 계속 늘어날 위험이 있다.

### 4. Duration 근거가 경계 의미와 어긋난다

현재 Process 파생 로직은 구조적 시작·종료 후보를 찾지만 실제 Duration은 모든 descendant Placement의 최솟값과 최댓값으로 계산한다. “과정의 경계”와 “포함된 사건의 외접 범위”가 같은 값일 때만 우연히 일치한다.

### 5. 시간 제약의 모순 검사가 부분적이다

도메인 검증은 `contains` cycle을 거절하지만 `precedes` 또는 시간 경계 관계 전체의 cycle·모순을 동일한 solver 관점에서 검증하지 않는다.

## 다음 설계가 반드시 해결할 것

1. 연·월·일·ms·ps를 새 enum 없이 같은 구조로 기술한다.
2. exact instant와 “이 구간 안”을 구분한다.
3. 지속 사건의 시작·종료와 알려진 시간 범위를 구분한다.
4. 다른 사건 도중이라는 사실과 containment를 구분한다.
5. 절대 일시 없이 “A가 B보다 이전”만 기록할 수 있다.
6. calendar/time-system 변환과 좌표 정밀도를 JavaScript `number` 손실 없이 처리한다.
7. 모순은 commit 전에 설명 가능한 evidence와 함께 거절한다.
8. Atropos가 필요할 때만 점·막대·불확실 범위를 계산한다.

## 이번 재정렬의 비목표

- Branch, Run, 시간여행과 다중 역사 모델
- participant·context 등 Event 참여자 모델 전면 개편
- membership State의 문자열 target 개선
- JointJS canvas 구현
- 기존 데이터의 즉시 파괴적 migration

이 항목들은 실제 문제지만 시간 정본의 의미를 바로잡는 변경과 섞지 않는다.

## 위험과 안전장치

| 위험 | 안전장치 |
|---|---|
| draft가 accepted 의미를 몰래 대체 | TS-010 승인 전 runtime·schema 변경 금지 |
| 기존 데이터 의미 손실 | 원본 Placement 보존, adapter와 비교 진단부터 추가 |
| 두 정본의 장기 공존 | canonical write 전환 시점을 명시하고 silent dual-write 금지 |
| 고정밀 좌표 손실 | lossless decimal/canonical scalar string 사용 |
| projection이 새 사실 생성 | 모든 결과에 source relation과 algorithm version 기록 |
| 범위가 Branch/Run까지 팽창 | IP-002 비목표를 변경 승인 없이 넘지 않음 |

## 다음 세션 시작 순서

1. 이 문서와 TS-010의 미결정 사항을 읽는다.
2. accepted 문서를 실제로 고칠지 결정한다. 승인 전에는 코드에 손대지 않는다.
3. [IP-002](IP-002-temporal-model-realignment.md)의 Slice 0과 characterization test만 수행한다.
4. 기존 M4-D 기준선과 synthetic World를 보존한다.
5. JointJS 다음 단계는 시간 모델의 canonical 방향이 결정될 때까지 활성화하지 않는다.
