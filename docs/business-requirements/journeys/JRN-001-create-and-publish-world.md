---
id: JRN-001
title: 새 세계 작성과 최초 출판
status: draft
layer: business-requirements
---

# JRN-001 — 새 세계 작성과 최초 출판

## JRN-001.1 목적

작성자가 원자료와 자연어 지시로 새로운 세계를 만들고, 성공적으로 반영된 내용을 자동으로 공개하여 독자가 탐색할 수 있게 한다.

## JRN-001.2 행위자

- 작성자: 세계의 목적과 원자료를 제공하고 공개된 결과를 확인·정정한다.
- LLM: Clotho를 통해 원자료를 해석하고 세계를 구성한다.
- 독자: Atropos에서 현재 공개된 세계를 탐색한다.

## JRN-001.3 시작 조건

- 작성자가 새 세계의 목적과 하나 이상의 원자료를 가지고 있다.
- 해당 내용을 담을 기존 [ENT-001](../entities/INDEX.md) World가 없거나 새 World가 필요하다고 판단한다.

## JRN-001.4 기본 흐름

1. 작성자는 만들고 싶은 세계와 원자료를 LLM에 설명한다.
2. LLM은 자료의 범위와 작성자가 구성하려는 World 및 Canon의 경계를 확인한다.
3. LLM은 하나 이상의 [ENT-002](../entities/INDEX.md) Canon과 필요한 [ENT-003](../entities/INDEX.md) Time System을 포함해 세계의 기본 범위를 구성한다.
4. LLM은 [ENT-004](../entities/INDEX.md) Event, [ENT-005](../entities/INDEX.md) Relation과 [ENT-006](../entities/INDEX.md) Narrative를 작성하고 사용한 원자료와 작성 유래를 남긴다.
5. Lachesis는 하나의 의미 있는 변경을 검증하고 성공한 세계 내용을 보존한다.
6. 성공적으로 반영된 내용은 별도의 draft나 출판 승인 없이 현재 [ENT-013](../entities/INDEX.md) Publication에 자동 반영된다.
7. Atropos는 식별 가능한 현재 공개본을 독자에게 제공한다.
8. 작성자는 공개된 결과를 확인하고 필요한 경우 LLM을 통해 정정하거나 철회한다.
9. 독자는 공개 주소에서 World의 개요를 보고 특정 Canon의 Event, Relation과 Narrative를 탐색한다.

## JRN-001.5 성공 결과

- 작성자는 원자료가 구조화된 세계로 보존되고 공개되었음을 확인한다.
- 독자는 일관된 현재 공개본을 탐색할 수 있다.
- 공개된 대상은 공유·인용 가능한 안정적인 공개 링크를 가진다.
- LLM 작업 과정과 운영 정보는 독자에게 노출되지 않는다.

## JRN-001.6 비즈니스 규칙

- Clotho를 통해 성공적으로 반영된 세계 내용은 자동으로 공개된다.
- 모든 Event와 Relation은 어느 Canon 안에서 사실인지 명확해야 한다.
- 출판 여부는 Canon의 진실 지위를 만들거나 바꾸지 않는다.
- LLM은 작성자의 지시 없이 서로 다른 Canon의 사실을 병합하거나 옮기지 않는다.
- 하나의 의미 있는 변경은 저장과 공개에서 모두 일관된 상태로 보여야 한다.
- 인간은 공개 결과를 정정하거나 철회할 수 있어야 한다.
- 독자는 내부 작성 도구나 관리 구조를 알 필요가 없다.

## JRN-001.7 실패와 사용자 통지

- 기존 World와 중복 가능성이 있으면 LLM은 새 World를 만들기 전에 작성자에게 알려야 한다.
- 자료가 부족하면 LLM은 원자료에서 얻은 부분과 추론하여 작성한 부분을 구분해야 한다.
- 세계가 일관되게 보존될 수 없으면 해당 변경은 공개되어서는 안 된다.
- Atropos의 제공 또는 전파에 장애가 있으면 작성자는 장애 상태를 알 수 있어야 한다. 해당 세계 내용을 draft나 출판 대기 상태로 재분류하지 않는다.

## JRN-001.8 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
