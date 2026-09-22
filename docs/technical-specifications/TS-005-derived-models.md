---
id: TS-005
title: World 근거의 파생 모델과 선택 projection
status: accepted
layer: technical-specifications
---

# TS-005 — World 근거의 파생 모델과 선택 projection

## TS-005.1 원칙

정본 의미는 TS-002, 시간 해석은 TS-010이 소유한다. Subject·Process·State·Duration·Timeline·Composite 표현은 source World Revision과 algorithm version을 가진 재생성 가능한 projection이다. Collection이 World 사실을 변경하지 않는다.

## TS-005.2 계산과 식별

identity equivalence Relation의 World component에서 Subject를 계산한다. lineage는 합치지 않고 이름 일치로 병합하지 않는다. stable handle은 anchor가 속한 component를 따르고 merge 시 redirect, anchor 소멸 시 unresolved다. Collection을 끄는 것은 Subject 분할이 아니다. 선택 범위의 부분 결과는 전체 component가 아님을 표시한다.

Composite 여부·전체 자식 수는 active World contains에서 계산한다. visible children만으로 판정하지 않는다. Process는 그 구조를 과정으로 읽는 역할이다. State는 근거 사건과 상태 전환에서, Duration은 지원되는 시간 경계와 adapter capability에서 계산한다. 모르는 경계는 모르는 상태로 남긴다.

## TS-005.3 시간과 layout

World-level temporal constraints를 기준으로 projection하고 Collection 선택은 표시를 제한한다. 서로 다른 Collection에서 같은 Event가 다른 사실 시간을 얻지 않는다. authored duration과 descendant visual span은 분리한다. structural rank를 Gregorian 연도로 대체하지 않는다. partial order를 근거 없는 total order로 저장하지 않는다. 별도 World는 호환 시간축에서도 identity와 revision vector를 보존한다.

같은 World/Event node를 하나로 합성한다. Collection container는 selection overlay, Composite container는 contains 근거의 region이다. 공통 renderer를 사용해도 provenance와 선택 행동은 구별한다. Collection 선택 순서에 따라 첫 Canon의 좌표를 택하는 현재 방식은 이행 대상이다. target은 World Revision별 안정된 layout과 bounded detail이다.

## TS-005.4 invalidation

facts/time/contains 변경은 영향받는 dependency closure의 projection과 index를 무효화한다. membership 변경은 Collection selection/discovery index만, Narrative 변경은 내용/search만 재생성한다. global constraint 영향이 실제로 넓으면 worker에서 계산하며 요청 시 조용히 전체 World 계산으로 fallback하지 않는다. 완전한 새 manifest 이전에는 이전 served Revision을 유지한다.

## TS-005.5 근거·진단·검증

각 결과는 source revision, algorithm version, dependency digest, evidence IDs와 completeness를 가진다. cache key는 World/revision/algorithm/Time System/filter/budget을 포함한다. stale Revision을 혼합하지 않는다. unsupported conversion, partial scope, missing endpoint, unavailable shard는 구별한다. 동일 입력 digest·입력 순서 독립성·shared Event toggle 불변성·contains overlap·unresolved 경계·주석 분리를 검증한다.

## TS-005.6 보류

기존 Canon-specific Subject/correspondence 비교와 latent 3D layout은 실행하지 않는다. TS-009는 draft다. 새 ranking taxonomy·전용 Subject ontology는 만들지 않는다.

이전 세부 조항은 기준 commit `05ebf3b27794e60d734a885cc428a30104118896`의 Git 이력에 보존한다. 같은 문서 ID의 이번 개정 본문이 현재 목표 계약이며 삭제된 Canon-specific 조항은 실행 요구가 아니다. 변경하지 않은 보안·transaction·portability 규칙은 TS-001/003/007/008을 참조한다.
