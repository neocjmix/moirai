---
id: JRN-004
title: 대체 canon 추가와 비교
status: draft
layer: business-requirements
---

# JRN-004 — 대체 canon 추가와 비교

## JRN-004.1 목적

기존 세계와 일부 맥락을 공유하지만 사건 구성이나 해석이 다른 대체 Canon을 추가하고 독자가 차이를 이해할 수 있게 한다.

## JRN-004.2 행위자

- 작성자
- LLM
- 출판자
- 독자

## JRN-004.3 시작 조건

- 기존 World와 하나 이상의 Canon이 존재한다.
- 새 자료 또는 창작 의도가 기존 Canon에 그대로 포함될 수 없는 차이를 가진다.

## JRN-004.4 기본 흐름

1. 작성자는 기존 세계와 다른 사건 구성 또는 해석을 LLM에 설명한다.
2. LLM은 기존 World와 Canon을 탐색하고 공유되는 맥락과 달라지는 지점을 식별한다.
3. LLM은 기존 Canon을 덮어쓰지 않고 새로운 Canon 후보를 구성한다.
4. 공유되는 사건, 별개의 사건, 서로 충돌하는 Claim과 시간 체계의 차이를 명확히 한다.
5. 작성자는 두 Canon의 경계와 차이가 의도에 맞는지 검토한다.
6. 승인된 Canon은 기존 World 안에서 구분 가능한 상태로 관리된다.
7. 출판자는 새 Canon과 비교 가능한 범위를 공개할지 결정한다.
8. Atropos는 독자가 현재 보고 있는 Canon을 알 수 있게 하고 두 Canon의 공통점과 차이를 탐색할 수 있게 한다.

## JRN-004.5 성공 결과

- 기존 Canon의 내용이 손상되지 않는다.
- 새 Canon이 어느 World에 속하는지 명확하다.
- 독자는 서로 다른 Canon의 사건을 하나의 확정된 역사로 혼동하지 않는다.
- 공통 맥락과 분기된 내용을 모두 탐색할 수 있다.

## JRN-004.6 비즈니스 규칙

- Canon의 선택과 생성 판단은 LLM이 맥락을 읽고 작성자가 검토한다.
- 단순한 출처 차이와 실제 Canon 차이를 무조건 동일시하지 않는다.
- Canon 사이의 공통성 때문에 서로 다른 사건의 정체성을 임의로 합쳐서는 안 된다.
- 독자에게 Canon 경계가 명시적으로 보여야 한다.

## JRN-004.7 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
