---
id: CON-003
title: World의 사실 경계와 Collection 선택
status: accepted
layer: constitution
---

# CON-003 — World의 사실 경계와 Collection 선택

2026-09-22 사용자 승인 의미 개정. 기존 조항 ID는 추적용으로 유지하며 이전 문언은 Git 이력에 보존한다. 구현 전환 상태는 CURRENT에서만 판단한다.

## CON-003.1 사건 중심 세계

World는 하나의 일관된 reality/factual universe다. 지리·시대·주제·현재 수록량은 World 경계가 아니다. 실제 세계사는 하나의 World이며 조선사·일본사·삼국지 정사는 그 일부다. 삼국지연의와 MCU는 각각 별도 World다. 자료의 불확실성은 별도 현실을 뜻하지 않는다.

## CON-003.2 Collection의 의미

기존 Canon을 Collection으로 대체한다. Collection은 한 World의 Event graph에서 관심사를 위해 선택한 Event 집합이며 탐색·발견·navigation의 단위다. membership은 selection이지 ontological containment 또는 사실의 소유권이 아니다.

## CON-003.3 overlap과 독립성

Collection은 겹칠 수 있고 Event를 소유하지 않는다. Collection ON/OFF, 생성·삭제·이름 변경은 사건의 정체성·서술·시간 사실을 바꾸지 않는다. 추천은 탐색 relevance이며 정본·공식·권위 순위가 아니다.

## CON-003.4 World/Event identity

Event identity의 경계는 정확히 하나의 World다. 같은 사건은 여러 Collection에서 하나의 Event를 재사용한다. Collection이 없는 Event도 유효하며 마지막 membership 제거는 사건 철회가 아니다. cross-World membership은 금지한다. World는 transaction·Revision·export·access·Publication 격리 경계도 유지한다.

## CON-003.5 사실과 불확실성

Relation은 World에 대한 주장이다. Collection별로 서로 다른 사실 universe를 만들지 않는다. 출처 충돌은 근거와 불확실성을 보존하고, 서로 모순되는 확정 제약을 동시에 참으로 강제하지 않는다. 탐색 선택이 충돌을 숨기거나 진위를 결정하지 않는다.

## CON-003.6 Narrative ownership

각 Event와 각 Collection은 각각 하나의 독립 Narrative를 갖는다. Event Narrative는 Collection에 의존하지 않는다. Collection Narrative는 선택한 관심사를 설명하고 Event Narrative를 대체하지 않는다. 주석·출처·언어 표현은 소유자를 늘리거나 Collection별 Event 서술을 만드는 근거가 아니다.

## CON-003.7 ontology와 표현

Composite는 Event 간 contains 관계로 드러나는 구성 성격이다. 별도 ontological type이 아니다. Process는 과정으로 읽는 역할이다. UI는 일반 Event·Composite·Collection에 다른 표현 또는 공통 container 표현을 쓸 수 있으나 contains 주장과 membership 선택은 혼동하지 않는다.

## CON-003.8 작성과 읽기

작성은 서버 불변식, 반드시 조회하는 authoritative authoring policy, 남은 모델 판단을 구분한다. World 전체 크기가 interactive read 비용을 직접 결정하지 않게 한다. 성능·UI 편의로 사실, 정밀도 또는 identity를 발명하지 않는다.
