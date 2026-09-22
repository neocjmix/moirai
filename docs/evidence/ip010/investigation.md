# IP-010 chronology 원인과 교정 범위

## 수정 전 증거

World `01995c2a-7b00-7000-8000-000000000101` current/target/served=28 ready.
Japan Canon `01a0c8c3-544c-756a-968c-0a5bb38452ea`에는 22 Event(신규 atomic16, 신규 Composite3, 기존 공유3)와 35 Relation이 있었다. 관계는 precedes13/contains17/causes2/enables2/influences1이며 Time Event endpoint는 **0**이었다.

Control `019f8c00-0000-7000-8000-000000000100` 임진왜란 Canon에는 Relation184와 Time Event endpoint 관계92가 있었다. 공유 Event membership은 동일 identity를 주지만 해당 Canon의 temporal Relation membership을 자동 복제하지 않는다. 일본사에는 이 관계 공유가 누락됐다.

생산 `.../worlds/W/revisions/28/graph/canons/JAPAN/temporal.json`은 상대 순서만 있거나 unresolved인 projection을 올바르게 반환했다. `attributes.gregorian_lower`는 설명 필드이며 시간 좌표가 아니다. 절대 좌표가 projection에서 사라진 것이 아니라 처음부터 일본사 canonical constraint로 기록되지 않았다.

`packages/graph-query/src/index.ts::temporalPosition`은 relative-only 상태를 전달한다. `packages/graph-presentation/src/semantic-layout.ts`의 기존 코드는 precedes의 최장 경로 rank를 0부터 계산하고 relative-only Event의 `{minYear:rank,maxYear:rank}`로 넣었다. 단절된 component마다 0부터 시작했다. causal 관계는 이 temporal component를 이어 주지 않는다.

URDR chart-plane의 `CHRONOLOGY_YEAR_SPACING=140`이 이 rank에 곱해 Y를 만들고, `graph-shell.tsx`의 Gregorian axis formatter가 이를 실제 연도로 읽었다. 따라서 1598 사망이 rank2, 1573 붕괴가 rank4에 놓이고 축에는 -2/0/1/2/...가 보였다. 실제 브라우저에서 일본사만 선택해 -3~8 축과 잘못된 사건 순서를 재현했다(`before.jpg`).

## 판정

- 데이터 결함: 있음. 정식 시간 관계 누락, precision 오표기, 구력/Gregorian 근거 부족.
- 모델링 결함: 있음. 연표를 precedes chain으로 작성. 전쟁 전체를 사망 이전의 한 점처럼 취급하는 관계 포함.
- semantic temporal projection 결함: 확인되지 않음. 정본이 가진 상대/미해결 상태를 전달했다.
- presentation projection/layout 결함: 있음. 상대 rank를 temporal frame의 절대 좌표로 변조했다. frontend는 잘못된 spatial artifact를 정상적인 Gregorian 축에 표시했다.

## Canonical 시간 표현

TS-010에 따라 Event와 virtual Time Event 사이의 `not_after`, `precedes`, `coincides` 관계가 시간 제약이다. virtual Time Event는 기존 Time System identity/version과 canonical coordinate로 참조하며 Event row를 생성하지 않는다.

연도만 알려진 X는 `T(1573-01-01) not_after X`, `X precedes T(1574-01-01)`로 표현한다. 1월1일은 지식 범위의 경계이지 사건 발생일이 아니다. attributes는 `date_precision=year`, `historical_year=1573`, 구력 원문과 변환 상태를 보존한다. 확인된 일자는 하루 bucket을 사용한다.

`starts`/`ends`는 Composite boundary Event에 대한 실제 주장이다. 주제별 세 Composite에는 이를 꾸며 넣지 않고 실제 contains와 descendant span을 사용한다. 임진왜란은 기존 부산진·철군 Event를 일본사에도 공유해 overview 범위를 계산한다. 기존 임진왜란 Canon의 containment와 시간 관계는 바꾸지 않는다.

## 역사 및 관계 감사

`event-audit.json`은 신규 atomic16개의 원 metadata, 수정 metadata, 출처, canonical bounds를 전수 기록한다. 연도만 확인한 사건은 월일을 꾸며내지 않았다. 혼노지(구력 천정10년6월2일)와 야마자키(6월13일)는 대야마자키정 자료의 신력 **1582-07-01**, **1582-07-12**를 채택한다. 흔히 보이는 June21/July2는 이 proleptic Gregorian 좌표에 그대로 쓸 수 없다. 세키가하라는 기후현이 명시한 **1600-10-21**을 채택한다.

`relation-audit.json`에 35개 전체 ID, endpoints, 판정을 기록했다. 기존13 precedes는 Canon membership을 제거하고 historical withdrawal로 철회한다. 17contains와 인과·가능·영향5개는 유지한다. canonical bounds의 precedes는 실제 upper constraint이므로 의미가 다르다.

계획1은 시간관계32개 생성+membership64 ops, 기존13 관계 membership 제거+withdraw26 ops, 공유 사망/동원 시간관계 membership4 ops =94. 계획2는 신규19 Event attributes update, 기존 부산진/철군 membership2, 해당 시간관계 membership4, 임진왜란 overview contains2개 생성+membership4, World metadata1 =30.

어떤 Event도 삭제·재생성하지 않으며 기존 정상 역사 Event attributes/Relation 사실은 보존한다. SQL schema migration은 필요 없고 모든 정본 교정은 감사 가능한 Lachesis Change Set으로 수행한다. Event metadata update는 전체 attributes 교체만 허용하고 identity/kind/title/scope 변경을 허용하지 않는다. historical before/after와 idempotency를 테스트한다.

## World 범위

1380~1615의 조선·일본 Canon이 같은 임진왜란 identity를 공유하므로 World를 분리하면 중복 정체성을 만들 수 있다. 기존 World ID와 slug를 보존하면서 `동아시아사 — 조선과 일본`으로 명칭을 넓힌다. 동아시아 전체를 포괄하는 완전한 통사라는 주장은 description에서 피한다.

## 검증

`rehearsal.json`: r28 export에 두 계획을 read-only 적용한 validator → publication → query → layout 결과. 일본사24 Event 전부 배치, 요구 순서 유지, 기존 Event facts/Relation facts 보존. 경고2건은 이번 작업 대상 외인 단종 Canon의 원래 미앵커 날짜이며 각 계획에서 반복 보고된다. 해당 데이터를 임의 수정하지 않는다.

1573/1575/1582/1588/1598/1600 fixture는 topology 변경, Composite contains, 두 Canon의 동일 Event identity/좌표를 검증한다. Gregorian frame의 미앵커 상대 Event는 unplaced diagnostic으로 남기며 가짜 연도로 배치하지 않는다. 별도 structural-order-display frame은 기존 구조 배치를 유지한다.

1k spatial fixture는 layout /3에서 이전 SHA와 완전히 일치함을 확인한 뒤 /4 versioned bundle SHA만 갱신했다. 좌표 회귀를 감추기 위한 golden 변경이 아니다.
