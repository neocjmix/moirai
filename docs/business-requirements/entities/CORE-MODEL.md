# 핵심 비즈니스 개념 관계와 책임

의미의 최상위 근거는 [CON-003](../../constitution/CON-003-world-truth.md)다. 이 문서는 관계·용어의 단일 참조점이며 물리 schema는 TS-002가 소유한다.

## BCR-001 World

하나의 reality/factual universe이자 Event identity·transaction·Revision·export·access·Publication 경계. 실제 역사는 하나의 World, 삼국지연의·MCU는 별도 World다. 시간 체계 호환은 World 병합의 근거가 아니다. 서비스에 수록된 지역과 시대는 coverage다.

## BCR-002 Collection과 membership

World Event graph의 관심사별 선택 집합. World 1:N Collection, World 1:N Event, Collection N:M Event이며 Event 측 membership은 0..N이다. Collection은 사건을 소유하지 않는다. 비어 있는 Collection은 설명을 가진 탐색 시작점일 수 있다. order·importance·recommended_with 필드를 선제 도입하지 않는다.

## BCR-003 Time System

World가 자기완결적 반출을 위해 정의를 소유한다. 여러 Collection이 같은 시간 표현을 사용할 수 있으나 사실의 적용 여부는 Collection에 귀속하지 않는다. 서로 다른 World도 정의와 adapter capability가 호환되면 같은 표시 축을 사용할 수 있다.

## BCR-004 Event·Composite·Process

Event는 독립적으로 식별·참조할 사건이다. contains(parent, child)는 “이 사건이 저 사건을 구성한다”는 World 주장이다. 하나 이상의 active contains 자식을 가진 Event를 Composite로 읽는다. 부분 자료에서 자식이 아직 없다는 것은 현실의 원자성 주장이 아니다. Process는 과정으로 읽는 파생 역할이다. 기간이 있다는 이유만으로 가짜 시작·끝 사건이나 Composite를 만들지 않는다.

## BCR-005 Relation

Relation identity와 assertion은 World에 귀속한다. Collection별 별도 사실·시간 제약은 없다. 기본 read는 선택 Event의 induced graph와 명시된 bounded neighborhood를 사용한다. 숨겨진 endpoint를 향한 관계는 continuation으로 알릴 수 있다. temporal/containment 근거는 화면에서 안 보인다고 무효가 되지 않는다.

## BCR-006 Narrative

각 Event와 Collection에 정확히 하나의 Narrative가 있다. 본문·선택적 요약·주석·공개 출처는 같은 owner의 내용이다. 언어 표현은 같은 Narrative의 번역이지 별도 관점 소유권이 아니다. 현 단계는 기존 ko 자료를 유지하고 다국어 편집 workflow는 연기한다. Collection별 Event Narrative를 생성하지 않는다.

## BCR-007 파생 모델

Subject·Process·State·Duration·Timeline·layout은 World Event/Relation/Time System 근거에서 계산한다. Collection은 결과의 선택·표시 범위다. 부분 조회 결과로 전체 구조를 단정하지 않으며 Revision·근거·잘림을 드러낸다.

## BCR-008 대응 — deferred

기존 Canon-specific correspondence 요구는 현재 실행 범위에서 철회한다. 같은 Event는 membership으로 재사용하며 별도 대응이 필요 없다. distinct Event 비교 요구와 기존 correspondence 기록은 보존하되 새 대응 ontology·cross-World merge를 도입하지 않는다. 재활성화에는 별도 요구와 계획이 필요하다.

## BCR-009 Publication

성공한 canonical 변경은 자동 Publication 대상이다. Publication은 World Revision의 공개 allowlist projection이며 Collection이 출판·권한 경계를 대체하지 않는다. 의미 정합성은 World에, 읽기 분할은 artifact/index에 둔다.

## BCR-010 시스템 책임

| 시스템   | 책임                                                  |
| -------- | ----------------------------------------------------- |
| Clotho   | 인증된 authoring 진입점, policy 제공, bounded context |
| Lachesis | 최종 인가·불변식·원자적 commit·이력                   |
| Worker   | 재생성 가능한 Revision projection과 Publication       |
| Atropos  | 공개 Publication에서 선택·발견·읽기                   |

## BCR-011 인간의 권한

인간의 지시·정정·철회와 자동 출판 고지를 유지한다. Collection 해제는 Event 삭제가 아니다. 실제 정본 migration은 보존 manifest와 검증을 갖춘 명시적 작업으로 수행한다.
