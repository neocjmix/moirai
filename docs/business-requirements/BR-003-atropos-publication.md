---
id: BR-003
title: 공개 출판과 독자 경험
status: accepted
layer: business-requirements
owner: Atropos
---

# BR-003 — 공개 출판과 독자 경험

관련 헌법: [CON-002](../constitution/CON-002-system-boundaries.md), [CON-005](../constitution/CON-005-publication-boundary.md)

## BR-003.1 공개 접근

독자는 별도의 작성 도구나 내부 시스템을 알지 못해도 출판된 세계에 접근할 수 있어야 한다.

## BR-003.2 독자 탐색

독자는 세계의 전체 구조를 둘러보고 관심 있는 사건과 대상을 따라갈 수 있어야 한다.

## BR-003.3 복수 관점

독자는 Collection 전체의 Narrative에서 Process, Composite Event와 단일 Event의 Narrative까지 범위를 오가며 사건 관계, chronology와 정체성 등 여러 관점으로 같은 세계를 이해할 수 있어야 한다.

## BR-003.4 관계 탐색

독자는 사건 사이의 인과, 순서, 포함 관계와 관련 맥락을 따라갈 수 있어야 한다.

## BR-003.5 복수 Collection

독자는 여러 Collection의 맥락을 고정하거나 해제하며 overlap을 탐색한다. 명시적 고정은 자동 관련성보다 우선하고 시스템이 자동 해제하지 않는다. Collection 활성화는 모든 구성 사건의 이름과 직접 조작 대상을 동시에 표시하라는 뜻이 아니다. 동일 World/Event는 하나의 node·drawer를 공유한다. 선택 변경은 사실·Narrative·시간 의미를 변경하지 않는다. Collection container와 Composite container의 selection/contains 차이를 label·행동으로 구별한다.

## BR-003.6 범위별 서술과 근거

Event drawer는 Collection과 무관한 단일 Event Narrative를 표시한다. Collection 소개는 그 Collection의 단일 Narrative다. 본문은 사건·인물·행동·배경·결과를 설명하며 역사 이해에 필요한 불확실성을 포함할 수 있다. 자료 해석·정밀도 주석과 공개 인용은 별도로 펼쳐 읽고 작성 과정·반복 면책·운영 진단은 본문에 표시하지 않는다. 이전 Canon별 section 표시는 이 계약으로 대체한다.

## BR-003.7 공유와 인용

독자는 보고 있는 사건이나 관점을 안정적인 링크로 공유하고 인용할 수 있어야 한다.

## BR-003.8 일반 웹 접근성

독자는 모바일을 포함한 일반적인 웹 환경에서 별도의 설치 없이 서비스를 이용할 수 있어야 한다.

## BR-003.9 대규모 세계 탐색

출판된 세계가 커져도 독자는 실용적인 속도로 개요와 세부 사이를 오갈 수 있어야 한다.

## BR-003.10 공개 서비스 지속성

내부 작성 기능의 일시적인 중단이 이미 출판된 세계의 읽기를 불필요하게 중단시켜서는 안 된다.

## BR-003.11 호환되는 복수 World 탐색

독자는 먼저 하나의 Time System 관점을 선택하고, 그 관점에서 좌표를 비교할 수 있는
여러 World와 각 World의 여러 Collection을 한 탐색 화면에 함께 놓을 수 있어야 한다.
Atropos는 호환되지 않는 World를 같은 시간축에 놓거나 호환성을 이름으로 추측하지
않으며, 함께 표시한다는 이유로 World의 canonical content·Revision·접근 경계 또는
Event identity를 병합하지 않는다. Collection 선택은 World partition이 아니라 selection projection다.

## BR-003.12 Collection discovery

독자는 기본적으로 Graph exploration을 떠나지 않고 현재 화면·시간·탐색 맥락에서 관련 Collection을 발견하고 세계를 넓힐 수 있어야 한다. Pinned는 명시 의도, Contextual Active는 안정된 자동 활성, Suggested는 아직 graph에 참여하지 않는 후보이며 나머지 World Collection은 전체 탐색·검색으로 도달한다. 추천은 사건 중첩·시간·인접성으로 설명 가능해야 하고 자동 활성의 결과가 다시 자동 활성의 원인이 되어 자기증폭해서는 안 된다. 원거리 pin만으로 무관한 맥락을 자동 확장하지 않는다. 자동화 중지·명시 해제·전체 Collection 탐색의 결정적 경로를 제공한다. 모두 끄기는 빈 선택을 유지하며 후보 없음·시간 없음·불완전한 조회를 구별한다. 수동 importance나 recommended_with taxonomy는 요구하지 않는다.

## BR-003.13 응답 범위와 연속성

읽기 비용은 선택 범위와 명시된 budget에 의해 제한되어야 한다. 부분 결과·추가 결과·오류를 구별하고 pan/zoom 중 기존 화면을 유지한다. bounded 응답을 위해 World 전체를 매번 읽는 것은 이 요구를 만족하지 않는다.

## BR-003.14 맥락과 이중 밀도

독자는 World와 현재 주요 주제를 잃지 않으면서 확대·축소할 수 있어야 한다. 읽고 조작하는 의미·텍스트의 밀도와 구조를 전달하는 도형의 밀도를 독립적으로 제어한다. 의미 표현을 생략해도 유효한 공간·관계 정보는 남길 수 있다. 화면을 덮는 중복 도형처럼 추가 정보를 주지 않는 표현은 억제하고 그 의미 맥락은 HUD가 이어받는다. 배경 구조가 보이지 않는 다수의 직접 조작 대상이 되어 탐색을 방해하지 않아야 한다. 고정된 Collection에도 같은 표현 원칙을 적용한다.

첫 방문은 읽기 좋은 특정 맥락에서 시작하고 재방문은 기존 viewport 복원 동작을 유지한다. 사용자가 pin한 Collection은 다음 방문에도 유지하며 명시적으로 해제·초기화할 수 있다. pin 복원이나 자동 발견 때문에 복원된 탐색 위치·배율이 바뀌어서는 안 된다.
