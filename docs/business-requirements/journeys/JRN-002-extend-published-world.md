---
id: JRN-002
title: 기존 세계 확장과 공개본 갱신
status: draft
layer: business-requirements
---

# JRN-002 — 기존 세계 확장과 공개본 갱신

## JRN-002.1 목적

작성자가 새로운 자료로 기존 World를 확장하고, 성공적으로 반영된 변경을 현재 공개본에도 자동으로 갱신한다.

## JRN-002.2 행위자

- 작성자
- LLM
- 기존 독자

## JRN-002.3 시작 조건

- [ENT-001](../entities/INDEX.md) World와 하나 이상의 Canon이 존재한다.
- 해당 World의 Publication과 현재 공개본이 존재한다.
- 작성자가 새 자료나 추가할 내용을 가지고 있다.

## JRN-002.4 기본 흐름

1. 작성자는 새 자료와 원하는 확장 방향을 LLM에 제공한다.
2. LLM은 관련 World, Canon, 기존 Event, Relation, Narrative와 작성 유래를 탐색한다.
3. LLM은 선택한 Canon 안의 중복과 구조적 충돌, 연결 가능한 기존 Event와 부족한 맥락을 식별한다.
4. LLM은 새 내용이 어느 Canon의 사실을 확장하는지 확인하고, 같은 대상에 관해 다른 사실을 성립시켜야 한다면 별도 Canon을 제안한다.
5. LLM은 해당 Canon의 기존 사실을 존중하면서 새 Event, Relation과 Narrative를 구성하고 작성 유래를 남긴다.
6. Lachesis는 변경을 검증하고 성공한 세계 내용을 보존한다.
7. 성공적으로 반영된 변경은 현재 Publication에 자동 반영된다.
8. Atropos는 갱신된 현재 공개본을 제공한다.
9. 기존 독자는 이전에 사용하던 안정적인 공개 링크를 통해 갱신된 맥락에 접근한다.

## JRN-002.5 성공 결과

- 선택한 Canon의 기존 사실과 새 내용이 중복 없이 연결된다.
- 저장과 공개 상태에 하나의 의미 있는 변경이 일부만 반영되지 않는다.
- 작성자는 현재 공개본에 반영된 변경을 식별할 수 있다.
- 독자는 기존 Event와 새 Event를 연속적으로 탐색할 수 있다.

## JRN-002.6 비즈니스 규칙

- LLM은 작성 전에 관련 기존 내용을 읽어야 한다.
- 기존 Event의 의미를 조용히 바꾸어 중복을 피해서는 안 된다.
- 성공적으로 반영된 변경은 별도의 출판 승인 없이 자동 공개된다.
- 기존의 안정적인 공개 링크는 갱신 후에도 합리적인 결과를 제공해야 한다.
- 서로 다른 Canon의 사실은 확장 과정에서 병합되거나 한쪽의 사실로 덮어써져서는 안 된다.

## JRN-002.7 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
