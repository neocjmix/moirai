# 비즈니스 요구사항 인덱스

비즈니스 요구사항은 Moirai가 사용자와 독자에게 무엇을 제공하고 무엇을 보장해야 하는지를 규정한다. 구체적인 구현 방법은 다루지 않는다.

## 요구사항

| ID | 문서 | 주 책임 | 상태 |
|---|---|---|---|
| BR-001 | [LLM 기반 세계 작성](BR-001-clotho-authoring.md) | Clotho | accepted |
| BR-002 | [세계의 저장과 관리](BR-002-lachesis-management.md) | Lachesis | accepted |
| BR-003 | [공개 출판과 독자 경험](BR-003-atropos-publication.md) | Atropos | accepted |
| BR-004 | [세계 모델의 표현 범위](BR-004-world-expressiveness.md) | Cross-system | accepted |
| BR-005 | [인간의 검토와 운영 권한](BR-005-human-governance.md) | Cross-system | accepted |
| BR-006 | [데이터 이동성과 장기 보존](BR-006-data-portability.md) | Lachesis | accepted |
| BR-007 | [콘텐츠 출판 생명주기](BR-007-publication-lifecycle.md) | Lachesis / Atropos | accepted |

## 하위 문서

- [비즈니스 개념 인덱스](entities/INDEX.md)
- [핵심 비즈니스 개념 관계와 책임](entities/CORE-MODEL.md)
- [사용자 여정](journeys/INDEX.md)

## 작업 순서

1. 엔티티 후보를 루즈하게 등록한다.
2. 엔티티 ID를 사용해 핵심 사용자 여정을 작성한다.
3. 여정에서 실제로 드러난 정체성, 생명주기와 관계를 근거로 엔티티를 재검토한다.
4. 확정된 비즈니스 모델을 바탕으로 기술 명세를 시작한다.

## 기술 명세 진입 기준

현재 헌법, BR-001부터 BR-007, 핵심 개념 모델과 JRN-001부터 JRN-007을 1차 구현의 비즈니스 기준선으로 채택한다.

기술 명세는 다음 제약을 보존해야 한다.

- [BCR-003](entities/CORE-MODEL.md#bcr-003-canon과-time-system): Canon은 복수 Time System을 사용할 수 있고 Time System은 Canon 사이에서 공유될 수 있다.
- [BCR-004](entities/CORE-MODEL.md#bcr-004-event의-구성): Process는 별도 핵심 엔티티가 아니라 과정으로 읽히는 Composite Event다.
- [BCR-009](entities/CORE-MODEL.md#bcr-009-publication): 1차 구현에는 관리되는 비공개 중간 출판 상태가 없으며 이는 제공 시간 SLA를 뜻하지 않는다.
- [ENT-007, ENT-009, ENT-010](entities/INDEX.md#운영-개념과-보류된-후보): 원자료·작성 유래, 변경과 복구 이력은 필요한 운영 책임이지만 세계 의미의 핵심 엔티티는 아니다.
- [BR-005.8](BR-005-human-governance.md#br-0058-1차-운영-권한-범위): 1차 구현은 단일 운영 권한을 기준으로 하며 협업·역할·승인 워크플로를 요구하지 않는다.

## 범위 밖

다음은 이후 기술 명세에서 결정한다.

- 구체적인 데이터 모델과 스키마
- API와 프로토콜
- 변경 단위와 동시성 구현
- 저장소와 데이터베이스
- 파생 계산과 캐시 방식
- 정적 산출물과 배포 구조
- UI 프레임워크와 그래프 렌더러
- 인증과 승인 방식의 구체적인 구현
