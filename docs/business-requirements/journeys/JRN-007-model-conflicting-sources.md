---
id: JRN-007
title: 상충하는 자료의 모델링과 서술
status: draft
layer: business-requirements
---

# JRN-007 — 상충하는 자료의 모델링과 서술

## JRN-007.1 목적

같은 Canon 안에서 여러 Source가 사건의 발생 여부, 시점, 원인 또는 의미를 서로 다르게 설명할 때 차이를 지우거나 별개의 Canon으로 회피하지 않고 보존하며, 출판자가 그 상태를 독자가 이해할 수 있는 Narrative로 제공한다.

## JRN-007.2 행위자

- 작성자
- LLM
- 출판자
- 독자

## JRN-007.3 시작 조건

- 기존 [ENT-001](../entities/INDEX.md) World와 [ENT-002](../entities/INDEX.md) Canon이 존재한다.
- 둘 이상의 [ENT-007](../entities/INDEX.md) Source가 동일하거나 밀접한 사건에 대해 양립하기 어려운 내용을 제시한다.
- 차이가 대체 세계선이 아니라 동일한 세계를 둘러싼 정보 또는 해석의 불일치라고 작성자가 판단한다.

## JRN-007.4 예시 상황

- Source A는 왕이 직접 명령했다고 기록한다.
- Source B는 측근이 왕의 이름을 빌려 실행했다고 기록한다.
- 두 자료 모두 사건의 결과에는 동의하지만 행위 주체와 인과 관계에는 동의하지 않는다.
- 작성자는 하나를 조용히 폐기하거나 두 개의 Canon으로 나누지 않고 논쟁 자체를 세계의 일부로 보존하고 싶다.

## JRN-007.5 기본 흐름

1. 작성자는 상충하는 Source와 조사 목적을 LLM에 제공한다.
2. LLM은 각 Source가 공통으로 지지하는 내용과 서로 충돌하는 내용을 구분한다.
3. LLM은 기존 Event 및 Relation과 연결 가능한 내용을 찾고, 동일 사건을 중복 생성하지 않도록 확인한다.
4. LLM은 각 Source가 무엇을 주장하는지 식별 가능한 [ENT-008](../entities/INDEX.md) Claim 후보로 구분한다.
5. 각 Claim은 그것을 뒷받침하거나 반박하는 Source, 대상 Event 또는 Relation, 확실성 및 다른 Claim과의 관계를 유지한다.
6. 공통으로 받아들일 수 있는 사건 구조와 논쟁 중인 주장을 구분하여 작성한다.
7. 작성자는 LLM이 자료의 차이를 과도하게 해소하거나 새로운 사실을 발명하지 않았는지 검토한다.
8. 출판자는 여러 Event, Relation, Claim과 Source를 엮어 독자가 논쟁의 구조를 이해할 수 있는 [ENT-006](../entities/INDEX.md) Narrative를 준비한다.
9. Narrative는 어떤 해석을 채택했는지, 무엇이 불확실한지, 다른 해석이 무엇인지 독자에게 드러낸다.
10. 독자는 Narrative에서 관련 Event, Claim과 Source로 이동해 서술의 근거를 직접 확인한다.
11. 새로운 Source가 추가되면 Claim과 Narrative를 재검토하되, 과거 Source와 이전 공개 상태를 지우지 않는다.

## JRN-007.6 성공 결과

- 동일 사건이 Source 수만큼 불필요하게 복제되지 않는다.
- 서로 충돌하는 주장이 하나의 확정 사실로 합쳐지지 않는다.
- 단순한 자료 불일치가 별개의 Canon으로 잘못 분리되지 않는다.
- 독자는 사건 구조, 개별 주장, 출처와 출판자의 설명을 구분할 수 있다.
- Narrative를 수정해도 근거가 되는 Event, Relation, Claim과 Source의 이력이 보존된다.
- 새 자료가 들어왔을 때 기존 논쟁 구조를 확장하고 재평가할 수 있다.

## JRN-007.7 비즈니스 규칙

- Source가 말했다는 사실과 세계에서 실제로 발생했다고 채택한 Event를 구분한다.
- Claim은 Event뿐 아니라 Relation, 시간, 정체성 또는 다른 Claim을 대상으로 할 수 있다.
- Claim 사이의 불일치가 존재한다고 해서 반드시 별개의 Canon을 만들지는 않는다.
- 출판자의 Narrative는 Claim을 인용하고 해석할 수 있지만 원래 Claim과 Source를 대체하지 않는다.
- 독자에게 단순한 결론만 제공해야 하는 경우에도 내부의 근거와 불확실성을 손실해서는 안 된다.
- 새로운 Source나 해석 때문에 Narrative가 바뀌어도 이전에 출판된 설명의 존재를 추적할 수 있어야 한다.

## JRN-007.8 실패와 사용자 통지

- LLM이 두 Source를 같은 주장으로 합치려 하면 작성자는 차이가 무엇인지 확인할 수 있어야 한다.
- 동일 사건인지 서로 다른 사건인지 판단할 근거가 부족하면 그 불확실성을 명시해야 한다.
- 자료 불일치를 Canon 차이로 분류하려면 작성자가 그 의미를 검토할 수 있어야 한다.
- Narrative가 특정 Claim을 사실로 채택한다면 출판자는 그 선택과 근거를 확인할 수 있어야 한다.

## JRN-007.9 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
