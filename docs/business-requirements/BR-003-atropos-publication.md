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

독자는 여러 Collection을 ON/OFF하며 overlap을 탐색한다. 동일 World/Event는 하나의 node·drawer를 공유한다. 선택 변경은 사실·Narrative·시간 의미를 변경하지 않는다. Collection container와 Composite container의 selection/contains 차이를 label·행동으로 구별한다.

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

현재 viewport·time range·scale·visible Event·active Collections·graph adjacency를 근거로 관련 Collection을 발견하고 전환할 수 있어야 한다. 추천 이유는 겹치는 사건·시간·인접성처럼 설명 가능해야 한다. 관련성이 낮거나 후보가 없으면 억지 추천하지 않는다. 수동 importance나 recommended_with taxonomy는 요구하지 않는다.

## BR-003.13 응답 범위와 연속성

읽기 비용은 선택 범위와 명시된 budget에 의해 제한되어야 한다. 부분 결과·추가 결과·오류를 구별하고 pan/zoom 중 기존 화면을 유지한다. bounded 응답을 위해 World 전체를 매번 읽는 것은 이 요구를 만족하지 않는다.
