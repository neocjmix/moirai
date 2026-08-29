---
id: JRN-004
title: 복수 Canon 추가와 비교
status: accepted
layer: business-requirements
---

# JRN-004 — 복수 Canon 추가와 비교

## JRN-004.1 목적

기존 World와 대상을 공유하면서 서로 다른 사실이 성립하는 Canon을 추가하고, 어느 하나를 정본으로 삼지 않은 채 독자가 공통점과 차이를 이해할 수 있게 한다.

정사 삼국지와 삼국지연의처럼 여러 Canon은 같은 인물과 시대를 다루면서 서로 다른 Event, Relation과 시간을 각각 사실로 가질 수 있다.

## JRN-004.2 행위자

- 작성자
- LLM
- 독자

## JRN-004.3 시작 조건

- 기존 World와 하나 이상의 Canon이 존재한다.
- 작성자는 같은 World 또는 대상을 다루지만 기존 Canon과 다른 사실을 성립시킬 자료나 창작 의도를 가지고 있다.

## JRN-004.4 기본 흐름

1. 작성자는 새로 구성할 Canon과 그 안에서 참인 사실을 LLM에 설명한다.
2. LLM은 기존 World와 Canon을 탐색하고 공유되는 대상과 달라지는 사실을 식별한다.
3. LLM은 기존 Canon을 수정하지 않고 동등한 별도 Canon을 구성한다.
4. LLM은 Event, Relation, Time System과 Narrative를 새 Canon의 사실과 표현으로 작성한다.
5. Lachesis는 Canon의 경계와 내부 일관성을 검증하고 성공한 변경을 보존한다.
6. 성공적으로 반영된 Canon은 기존 Canon과 우열 없이 현재 Publication에 자동 반영된다.
7. Atropos는 독자가 현재 보고 있는 Canon을 알 수 있게 하고 공개된 Canon들의 공통점과 차이를 탐색할 수 있게 한다.

## JRN-004.5 성공 결과

- 기존 Canon과 새 Canon이 각각 독립적인 진실의 맥락으로 보존된다.
- 같은 대상에 관한 서로 다른 사실이 Canon 경계를 넘어 섞이지 않는다.
- 독자는 어느 Canon을 보고 있는지 알 수 있다.
- 독자는 한 Canon을 다른 Canon의 정본·기본·대체본으로 오해하지 않고 공통점과 차이를 탐색할 수 있다.

## JRN-004.6 비즈니스 규칙

- 모든 Canon은 그 자체로 진실이며 서로 동등하다.
- Moirai는 정본·기본·공식·우위 Canon을 지정하거나 암묵적으로 전제하지 않는다.
- 출판되었는지 여부와 더 많은 원자료나 작성 근거를 가졌는지는 Canon의 진실 지위를 바꾸지 않는다.
- Canon 사이에 공유되는 대상이 있어도 서로 다른 Event와 Relation을 임의로 합쳐서는 안 된다.
- 성공적으로 반영된 Canon은 별도의 출판 승인 없이 자동 공개된다.
- 독자에게 현재 Canon과 Canon 경계가 명시적으로 보여야 한다.

## JRN-004.7 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
