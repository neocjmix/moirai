---
id: JRN-004
title: Collection을 추가하고 함께 탐색
status: accepted
layer: business-requirements
---

# JRN-004 — Collection을 추가하고 함께 탐색

1. 작성자가 기존 World에서 새로운 관심사를 제안한다.
2. agent가 현재 policy와 World context를 읽고 World-wide Event 후보를 검색한다.
3. 기존 Event를 선택하고 필요한 새 Event만 만든다. Collection에는 하나의 소개 Narrative를 작성한다.
4. Lachesis는 same-World membership과 단일 Narrative ownership을 검증한다.
5. Publication 완료 후 독자는 Graph 탐색 중 관련 Collection을 발견한다. 안정된 Contextual Active는 graph에 참여하고 Suggested는 참여 전 후보로 남는다. 독자는 중요한 맥락을 pin하거나 명시 해제하고 자동화를 중지할 수 있다. 공유 Event는 node·drawer 하나이며 본문은 동일하다.
6. 마지막 Collection을 해제해도 Event는 World에 남고 World 검색·이웃 탐색에서 접근할 수 있다. 모두 끄기는 자동 활성도 중지해 빈 선택을 보존한다.
7. 목적지를 알거나 자동 추천이 틀리면 전체 Collection browser/search에서 찾아 pin하고 같은 Graph 탐색으로 복귀한다. 활성화는 모든 사건 label의 표시를 뜻하지 않으며 화면의 구조와 읽기 밀도는 별도로 제어한다.

성공 기준은 [BR-003](../BR-003-atropos-publication.md), 의미는 [CORE-MODEL](../entities/CORE-MODEL.md)을 따른다. 기존 Canon별 사실·서술 비교 journey는 대체됐다.
