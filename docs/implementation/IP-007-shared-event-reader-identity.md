---
id: IP-007
title: Shared Event graph identity and Canon Narrative drawer
status: active
layer: implementation
owner: Atropos
---

# IP-007 — Shared Event graph identity and Canon Narrative drawer

관련 요구사항: [BR-003](../business-requirements/BR-003-atropos-publication.md)  
관련 명세: [TS-006](../technical-specifications/TS-006-atropos-publication.md)

## 목표

여러 선택 Canon에 속한 동일 Event를 그래프에서 정확히 하나의 node로 표시하고,
그 Event의 Canon별 Narrative는 하나의 Graph Event drawer 안에서 Canon별 section과
원문 문단 경계를 보존해 읽게 한다. atomic Event와 Composite Event에 같은 규칙을 쓴다.

## 구현 경계

- stable presentation node ID는 `World + Event reference`로 만들고 Canon scope를 ID에서 제거한다.
- 기존 immutable spatial artifact의 Canon-scoped node ID는 read seam에서 stable ID로 정규화한다.
- 같은 World·served Revision의 Canon artifact는 한 좌표계에 evidence layer로 합성한다.
- Event detail은 선택된 membership Canon 전체의 Narrative를 읽고 Canon label별 section으로 반환한다.
- 서로 다른 World·Revision은 병합하지 않는다.
- Composite Event 생성·존재·membership 계약은 변경하지 않는다.
- canonical Event/Narrative 데이터와 Publication Revision은 이 작업에서 수정하지 않는다.

## 검증

1. graph-presentation unit test에서 두 Canon instance의 node ID가 하나인지 확인한다.
2. immutable legacy artifact ID의 정규화와 selection retention을 확인한다.
3. detail test에서 한 Event의 두 Canon Narrative가 두 section으로 반환되고 문단 경계가 유지되는지 확인한다.
4. CI 후 production에서 계유정난 node count 1과 drawer Canon section을 모바일 viewport로 확인한다.
