---
id: BR-001
title: LLM 기반 세계 작성
status: accepted
layer: business-requirements
owner: Clotho
---

# BR-001 — LLM 기반 세계 작성

관련 헌법: [CON-001](../constitution/CON-001-purpose.md), [CON-002](../constitution/CON-002-system-boundaries.md), [CON-004](../constitution/CON-004-human-authority.md)

Clotho는 사용자의 운영상 탐색·작성 진입점과 호출 주체 인증을 소유한다. 작업 맥락과 오류 회복을 제공하며, 최종 접근 통제와 원자적 정본 반영은 Lachesis에 위임한다.

## BR-001.1 세계 생성

사용자는 자료나 자연어 지시를 통해 LLM으로 새로운 세계를 만들 수 있어야 한다.

## BR-001.2 기존 세계 이해

LLM은 작성 전에 관련 World, Collection, 시간 체계, 사건과 관계를 탐색하고 기존 맥락을 이해할 수 있어야 한다.

## BR-001.3 확장과 수정

사용자는 LLM을 통해 기존 사건, 관계와 서술을 추가·수정·제거할 수 있어야 한다.

## BR-001.4 의미 단위 작성

여러 사건과 관계로 이루어진 하나의 이야기 단위를 일관된 하나의 작업으로 작성할 수 있어야 한다.

## BR-001.5 작성 위치 판단

World는 reality로 선택하고 관심사는 Collection으로 선택한다. 새 지역·시대 또는 운영 편의를 이유로 실제 역사를 여러 World로 쪼개지 않는다. Event 생성 전에 World 범위에서 기존 identity 후보를 찾고 재사용한다. Collection 미선택 상태도 유효하며 일상 authoring policy는 탐색 가능한 적절한 membership을 권장한다.

## BR-001.6 오류 회복

LLM은 저장 또는 검증이 거부된 이유를 이해하고 내용을 수정하여 다시 시도할 수 있어야 한다.

## BR-001.7 작성의 유래

LLM은 사용한 원자료와 추론 또는 작성의 유래를 결과와 함께 남길 수 있어야 한다. 이 정보는 canonical world content와 구분하며 기본적으로 비공개 운영 정보로 보존한다. 독자에게 제공할 인용이나 출처 설명은 별도의 세계 내용으로 명시적으로 작성한다.

## BR-001.8 세션 지속성

LLM 세션이 바뀌어도 저장된 세계를 다시 읽고 이전 작업을 이어갈 수 있어야 한다.

## BR-001.9 구조 은닉

사용자는 내부 데이터 구조를 알지 못해도 자연어로 세계를 작성하고 수정할 수 있어야 한다.

## BR-001.10 authoritative authoring policy

작성자는 write 전에 현재 정책을 반드시 조회한다. 서버가 강제할 규칙, 작성 정책, 모델 판단의 경계를 공개하고 오래된 정책으로 제출된 write는 안전하게 거절해야 한다. 정책에는 reuse·granularity·relation·contains·membership·Narrative·시간 정밀도·출처 충돌·사전 검색·사후 검증이 포함된다. 정책 버전은 작성 이력에서 추적한다. 긴 plugin instruction이나 세션 기억을 유일한 근거로 삼지 않는다.
