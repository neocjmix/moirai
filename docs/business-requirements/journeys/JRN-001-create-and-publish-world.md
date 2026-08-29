---
id: JRN-001
title: 새 세계 작성과 최초 출판
status: draft
layer: business-requirements
---

# JRN-001 — 새 세계 작성과 최초 출판

## JRN-001.1 목적

작성자가 원자료와 자연어 지시로 새로운 세계를 만들고, 검토한 내용을 최초로 출판하여 독자가 탐색할 수 있게 한다.

## JRN-001.2 행위자

- 작성자: 세계의 목적과 원자료를 제공하고 작성 결과를 검토한다.
- LLM: Clotho를 통해 원자료를 해석하고 세계를 구성한다.
- 출판자: 공개할 범위와 시점을 결정한다.
- 독자: Atropos에서 출판된 세계를 탐색한다.

작성자와 출판자는 같은 사람일 수 있다.

## JRN-001.3 시작 조건

- 작성자가 새 세계의 목적과 하나 이상의 원자료를 가지고 있다.
- 해당 내용을 담을 기존 [ENT-001](../entities/INDEX.md) World가 없거나 새 World가 필요하다고 판단한다.
- 아직 공개된 [ENT-013](../entities/INDEX.md) Publication은 없다.

## JRN-001.4 기본 흐름

1. 작성자는 만들고 싶은 세계와 원자료를 LLM에 설명한다.
2. LLM은 자료의 범위와 불확실성을 파악하고 새 World가 필요한지 확인한다.
3. LLM은 필요한 [ENT-002](../entities/INDEX.md) Canon과 [ENT-003](../entities/INDEX.md) Time System 후보를 포함해 세계의 기본 범위를 구성한다.
4. LLM은 [ENT-004](../entities/INDEX.md) Event, [ENT-005](../entities/INDEX.md) Relation, [ENT-006](../entities/INDEX.md) Narrative와 [ENT-007](../entities/INDEX.md) Source의 연결을 작성한다.
5. 자료가 상충하거나 확정할 수 없는 경우 이를 숨기지 않고 [ENT-008](../entities/INDEX.md) Claim 또는 동등한 표현으로 드러낸다.
6. 작성자는 전체 구조, 서술, 출처와 불확실성을 검토하고 필요한 정정을 요청한다.
7. 검토가 끝난 내용은 비공개 세계로 보존된다.
8. 출판자는 공개할 범위와 독자에게 제공할 내용을 선택한다.
9. 출판자는 최초 Publication을 승인한다.
10. Atropos는 식별 가능한 최초 [ENT-014](../entities/INDEX.md) Edition을 독자에게 제공한다.
11. 독자는 공개 주소에서 세계의 개요를 보고 특정 사건과 관계를 탐색한다.

## JRN-001.5 성공 결과

- 작성자는 원자료가 구조화된 세계로 보존되었음을 확인한다.
- 비공개 작성 내용과 공개 내용이 구분된다.
- 독자는 최초 Edition의 일관된 내용을 탐색할 수 있다.
- 사건, 관계, 서술과 출처의 연결을 확인할 수 있다.
- 공개된 대상은 공유·인용 가능한 [ENT-015](../entities/INDEX.md) Public Reference를 가진다.

## JRN-001.6 비즈니스 규칙

- 저장되었다는 이유만으로 자동 출판되지 않는다.
- LLM이 확정할 수 없는 내용을 확정된 사실로 바꾸지 않는다.
- 작성자는 공개 전 결과와 근거를 이해할 수 있어야 한다.
- 출판 범위 밖의 초안과 운영 정보는 독자에게 노출되지 않는다.
- 하나의 의미 있는 작성 결과가 불완전하게 보존되어서는 안 된다.
- 독자는 내부 작성 도구나 관리 구조를 알 필요가 없다.

## JRN-001.7 실패와 사용자 통지

- 기존 World와 중복 가능성이 있으면 LLM은 새 World를 만들기 전에 작성자에게 알려야 한다.
- 자료가 부족하면 LLM은 누락된 부분과 추론한 부분을 구분해야 한다.
- 세계가 일관되게 보존될 수 없으면 출판 단계로 진행해서는 안 된다.
- 출판할 수 없는 경우 출판자는 무엇을 검토하거나 수정해야 하는지 알 수 있어야 한다.

## JRN-001.8 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
