---
id: JRN-007
title: Canon을 가로지르는 동일 대상의 연결과 비교
status: draft
layer: business-requirements
---

# JRN-007 — Canon을 가로지르는 동일 대상의 연결과 비교

## JRN-007.1 목적

서로 다른 Canon 안에서 각각 독립적으로 성립하는 인물·조직·장소·사물이 같은 대상을 각 Canon에서 표현한 것임을 연결하고, Canon의 사실을 병합하지 않은 채 비교할 수 있게 한다.

예를 들어 정사 삼국지의 조조와 삼국지연의의 조조는 각 Canon 안에서 서로 다른 사건과 관계를 가진다. 두 조조를 비교 가능한 동일 대상으로 연결하더라도 어느 한쪽의 생애와 성격이 다른 쪽의 사실이 되지는 않는다.

## JRN-007.2 행위자

- 작성자
- LLM
- 출판자
- 독자
- 세계 소유자

## JRN-007.3 시작 조건

- 하나의 World 안에 둘 이상의 Canon이 존재한다.
- 각 Canon의 Event와 Relation으로부터 인물·조직·장소·사물의 정체성을 읽을 수 있다.
- 작성자는 서로 다른 Canon의 대상들이 비교 가능한 동일 대상을 표현한다고 판단할 근거 또는 창작 의도를 가지고 있다.

## JRN-007.4 기본 흐름

1. 작성자는 서로 다른 Canon의 대상들을 연결해 비교하고 싶다고 LLM에 요청한다.
2. LLM은 각 Canon의 관련 Event, Relation, Narrative와 Source를 탐색한다.
3. LLM은 이름의 일치만이 아니라 역할, 관계와 맥락을 근거로 대응 후보와 차이를 작성자에게 제시한다.
4. 작성자는 대응이 의도에 맞는지 검토하고 승인·거부하거나 다른 대상을 지정한다.
5. 승인된 대응은 각 Canon의 Event, Relation과 파생 정체성을 병합하지 않은 채 관리된다.
6. 출판자는 대응 관계와 Canon 비교를 독자에게 공개할지 결정한다.
7. Atropos는 독자가 현재 보고 있는 Canon과 대상을 유지한 채 다른 Canon의 대응 대상을 열거나 나란히 비교할 수 있게 한다.
8. 독자는 Canon별 사건·관계·시간·서술의 공통점과 차이를 확인한다.
9. 잘못된 대응이 발견되면 작성자는 기존 Canon의 사실을 수정하지 않고 대응만 분리하거나 다시 연결한다.
10. 세계를 반출하고 복구할 때 Canon별 사실과 함께 승인된 대응의 의미도 보존된다.

## JRN-007.5 성공 결과

- 각 Canon의 대상과 그에 관한 사실이 독립적으로 유지된다.
- 독자는 같은 대상을 다룬 여러 Canon을 발견하고 비교할 수 있다.
- 비교 과정에서 어느 Canon도 정본·기본·우위로 취급되지 않는다.
- 대응을 수정해도 각 Canon의 Event와 Relation은 영향을 받지 않는다.
- 반출과 복구 뒤에도 어떤 대상들이 Canon을 가로질러 대응하는지 알 수 있다.

## JRN-007.6 비즈니스 규칙

- Canon 내부의 정체성은 해당 Canon의 Event와 Relation으로부터 읽는다.
- Canon을 가로지르는 대응은 어느 한 Canon 안에서 성립하는 세계의 사실이 아니라 작성·관리·탐색을 위한 연결이다.
- 대응은 Canon별 대상을 하나의 정체성이나 하나의 사건 이력으로 병합하지 않는다.
- 동일한 이름만으로 대응을 자동 확정해서는 안 된다.
- 대응은 인간이 검토하고 수정하거나 제거할 수 있어야 한다.
- 하나의 대상이 다른 Canon의 여러 대상과 대응하거나 여러 대상이 하나의 대상으로 합성되는 경우를 미리 금지하지 않는다.
- 대응의 존재나 공개 여부는 각 Canon의 진실 지위를 바꾸지 않는다.
- 독자에게 현재 Canon과 비교 중인 Canon의 경계가 명시적으로 보여야 한다.

## JRN-007.7 실패와 사용자 통지

- 대응 근거가 부족하면 LLM은 자동 연결하지 않고 후보와 부족한 맥락을 제시한다.
- 같은 이름이지만 무관한 대상이라면 연결하지 않는다.
- 여러 대응이 가능하면 하나를 임의로 선택하지 않고 작성자가 검토할 수 있게 한다.
- 대응 대상을 찾을 수 없어도 각 Canon의 대상은 독립적으로 유지된다.
- 공개되지 않은 Canon 또는 대상의 정보가 비교 기능을 통해 노출되어서는 안 된다.

## JRN-007.8 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-006](../BR-006-data-portability.md)

## JRN-007.9 URDR에서 소싱한 문제

이 여정은 URDR의 해결책을 계승하지 않고 다음 문제를 소싱한다.

- Canon 내부의 정체성은 Event와 Relation 구조로부터 파생되어야 했다.
- 서로 다른 Canon에 존재하는 대응 대상을 비교하기 위한 별도의 조정 표면이 필요했다.
- 대응 표면은 Canon의 진실이나 새로운 ontology primitive가 아니어야 했다.

근거:

- [Event Modeling Principles](https://github.com/neocjmix/urdr/blob/main/docs/archive/phase-0-closed-2026-04-12/EVENT_MODELING_PRINCIPLES.md)
- [Admin Metadata Model](https://github.com/neocjmix/urdr/blob/main/docs/archive/phase-0-closed-2026-04-12/CANON_WORLD_MODEL.md)
- [URDR figure handle 사례](https://github.com/neocjmix/urdr/blob/main/data/sync/csv/figure_handles.csv)
- [URDR Canon별 identity 사례](https://github.com/neocjmix/urdr/blob/main/data/sync/csv/identities.csv)
