---
id: RM-001
title: 개인화·다중 Tenant 확장 안전장치
status: deferred
layer: roadmap
normative: false
implementation_scope: future
---

# RM-001 — 개인화·다중 Tenant 확장 안전장치

## 문서 효력

> **현재 구현 범위가 아니다.** 이 문서는 미래 확장을 불필요하게 막는 결정을 피하기 위한 비규범적 로드맵이다. 아래 기능을 현재 backlog, 수용 기준, schema, API 또는 UI에 선행 구현하라는 지시로 해석해서는 안 된다.

현재 제품의 구현 기준은 승인된 헌법, 비즈니스 요구사항과 기술 명세다. 이 문서는 현재 요구사항과 충돌할 때 이를 변경하지 않는다.

개인화 또는 다중 Tenant 기능은 다음 조건을 모두 만족한 뒤에만 구현 범위가 된다.

1. 구체적인 사용자와 사용 사례가 비즈니스 요구사항으로 승인된다.
2. 보안 모델, 공개범위와 삭제 정책이 결정된다.
3. 해당 요구사항을 추적하는 기술 명세가 승인된다.
4. 별도의 구현 계획에 명시적으로 포함된다.

에이전트와 실행자는 현재 작업을 계획할 때 이 문서를 **미래 호환성 점검표**로만 사용한다. 별도 지시 없이 미래 기능을 위한 placeholder table, 추상화 계층, 권한 UI 또는 암호화 체계를 추가하지 않는다.

## 미래 목표

첫 제품화 이후 Moirai는 다음 사용 형태를 지원할 수 있어야 한다.

- 한 개인이 자신의 인생 기록, 업무일지 또는 선별된 시스템 사건을 World로 관리한다.
- 소유자는 World 전체 또는 선택한 범위를 자신만, 지정 사용자·그룹, 공유 링크 또는 모두에게 제공한다.
- 개인의 집합인 조직·기업·부서가 관리 경계와 데이터 격리를 가진다.
- 사람뿐 아니라 승인된 서비스와 에이전트가 최소 권한으로 읽고 쓴다.
- 민감한 데이터에 적합한 인증, 감사, 암호화, 삭제와 반출 정책을 적용한다.

이 목표는 현재의 세계 모델 의미를 바꾸지 않는다. Tenant와 권한은 World의 진실을 결정하는 Canon 개념이 아니라 데이터 소유·접근·배포를 관리하는 별도 계층이다.

## 현재 구조에서 보존할 기반

다음 현재 결정은 미래 확장에 유리하므로 유지한다.

- World는 Change Set, Revision, 복구와 export의 일관된 경계다.
- 하나의 Change Set은 하나의 World만 변경한다.
- 다른 World의 데이터를 Canon 내부 사실처럼 직접 참조하지 않는다.
- Lachesis만 정본을 변경한다.
- 정본과 재생성 가능한 Projection을 분리한다.
- Atropos가 정본 PostgreSQL에 직접 접근하지 않는다.
- 공개 Snapshot은 allowlist 방식으로 생성한다.
- 원자료 attachment와 공개 artifact를 물리적·권한상 분리한다.
- opaque immutable ID와 versioned portable export를 유지한다.

## 미래 개념의 예상 경계

다음은 방향을 설명하기 위한 예상 개념이며 현재 schema 요구사항이 아니다.

| 개념 | 미래 책임 | 현재 구현 여부 |
|---|---|---|
| Principal | 사람, 서비스 계정 또는 에이전트의 내부 식별 | 구현하지 않음 |
| Tenant | 개인 또는 조직의 보안·관리·과금 경계 | 구현하지 않음 |
| Group | 조직 안의 부서·팀·역할 집합 | 구현하지 않음 |
| Membership | Principal과 Tenant·Group의 관계 | 구현하지 않음 |
| Grant | 주체가 자원 범위에서 수행할 수 있는 행동 | 구현하지 않음 |
| Release | 특정 World Revision의 선택 범위와 audience | 구현하지 않음 |

Tenant와 World를 같은 개념으로 고정하지 않는다. 개인 또는 조직 하나가 여러 World를 소유할 수 있고, World의 콘텐츠·이식성 경계와 Tenant의 관리·보안 경계는 독립적으로 발전할 수 있어야 한다.

## 핵심 확장 방향

### Commit, Projection과 audience 분리

현재 1차 제품에서는 성공한 Commit이 자동으로 전체 공개 Publication 대상이 된다. 미래에는 이를 모든 제품 모드에 적용되는 영구 불변식으로 확대하지 않는다.

미래 모델에서는 다음 책임을 구분한다.

- **Commit**: World의 정본 Revision을 확정한다.
- **Projection**: 고정된 Revision에서 읽기 모델을 만든다.
- **Release**: Revision의 어떤 범위를 어떤 audience에 제공할지 정한다.
- **Public Publication**: audience가 모두인 Release다.

이 분리는 draft나 승인 대기 상태를 다시 도입한다는 뜻이 아니다. 정본 변경은 즉시 확정될 수 있으며, 접근 가능 범위는 별도의 배포 정책으로 결정한다. 현재 제품은 `전체 범위 + 모두에게 공개`인 단일 Release 정책의 특수한 경우로 유지할 수 있다.

### 접근 정책과 파생 정보

선택적 공개는 UI에서 숨기는 필터로 구현하지 않는다. 권한이 없는 원본을 브라우저에 전달해서는 안 된다.

미래의 audience별 Projection은 선택 범위뿐 아니라 다음 파생 누출도 함께 처리해야 한다.

- 비공개 endpoint를 암시하는 Relation
- Subject 구성, 병합과 redirect
- Timeline의 빈 구간과 Duration
- 검색 결과·개수·자동완성
- graph 영역, lane과 연결선
- Revision 변경 요약
- tombstone과 correspondence

공유 결과는 참조 무결성과 공개 정책을 함께 만족하는 독립적인 읽기 artifact여야 한다.

### 인증과 Tenant 격리

외부 OIDC subject, 이메일 또는 사용자명을 영속 도메인 식별자로 고정하지 않는다. 미래에는 provider 변경과 계정 병합이 가능한 내부 immutable Principal ID가 필요하다.

UUID의 비예측성은 권한 검사가 아니다. 모든 private 접근은 인증된 Principal, Tenant와 World 범위를 확인해야 한다. 캐시 key, worker job, object key, 검색 index와 관측 정보에서도 Tenant·World 경계를 잃어서는 안 된다.

익명 public artifact와 private artifact는 같은 접근 경로에 놓고 URL을 숨기는 방식으로 구분하지 않는다. private 읽기는 인증 gateway, private CDN 정책 또는 당시 채택한 보안 모델에 맞는 동등한 통제를 거쳐야 한다.

### 민감 정보, 이력과 삭제

현재의 전체 `before`·`after` Change 이력은 세계관 데이터에는 적합하지만 개인정보를 여러 Revision, backup, export와 index에 장기간 남길 수 있다. 미래의 개인정보 요구사항은 다음을 함께 결정해야 한다.

- 현재 정본과 과거 이력의 보존 기간
- 민감 payload와 감사 metadata의 분리
- World 또는 Tenant별 envelope encryption과 key 수명주기
- 삭제·redaction·crypto-shredding의 적용 범위
- backup, Projection, 검색 index와 export 사본에 대한 삭제 전파
- 법적 보존 의무와 사용자 삭제권의 충돌 처리

현재 단계에서 이 체계를 구현하지 않는다. 다만 영구 평문 보존만 가능하도록 저장 adapter와 이력 형식을 폐쇄하거나, 물리 삭제가 원천적으로 불가능하다고 가정해서는 안 된다.

### LLM 신뢰 경계

개인화 구현 전에 “높은 보안성”의 의미를 명시적으로 선택해야 한다.

- 서버가 권한 아래 평문을 처리할 수 있는 기업형 보안 모델에서는 현재 Lachesis·Projection·Clotho 구조를 확장할 수 있다.
- 서비스 운영자나 LLM provider도 평문을 볼 수 없는 zero-knowledge 또는 종단간 암호화 모델은 서버 검증·검색·Projection과 LLM 탐색 방식에 근본적인 변경을 요구한다.

후자를 암묵적으로 약속하지 않는다. 선택한 모델에 따라 inference provider, 데이터 보존, 지역성, client-side 처리와 key custody를 별도 요구사항으로 정의한다.

### 대량 시스템 로그

Moirai의 Change Set과 World Revision은 의미 있는 사건·관계·서사를 위한 모델이다. 고빈도 원시 telemetry를 그대로 Event로 적재하는 범용 log ingestion 시스템으로 확대하지 않는다.

대량 시스템 로그 사용 사례가 승인되면 원시 로그는 적합한 append-only 저장소에 두고, Moirai에는 선별된 사건·요약·외부 참조를 기록하는 방식을 우선 검토한다.

## 현재 구현에서 피해야 할 결정

다음 항목은 미래 기능을 지금 구현하라는 뜻이 아니라, 현재 구현의 편의를 영구적인 제품 불변식으로 만들지 말라는 안전장치다.

1. `Publication`이라는 단어를 모든 상황에서 익명 공개와 동의어로 고정하지 않는다.
2. `publication_target_revision` 하나만이 미래의 모든 audience별 배포 상태를 표현할 수 있다고 가정하지 않는다.
3. World ID 없이 전역 entity ID만 받는 무권한 repository·service 접근 방식을 공용 표준으로 만들지 않는다.
4. 모든 World를 볼 수 있는 현재 operator 권한을 도메인 규칙으로 승격하지 않는다.
5. OIDC provider의 subject나 이메일을 Change history의 영구 actor identity로 직접 고정하지 않는다.
6. public object URL의 난수성과 signed URL만으로 private 접근 통제가 완성된다고 가정하지 않는다.
7. 전체 Snapshot을 클라이언트에 전달한 뒤 화면에서 숨기는 방식으로 선택적 공개를 구현하지 않는다.
8. 캐시, queue, search index와 object path에서 World 경계를 생략하지 않는다.
9. 민감한 Change payload와 원자료가 모든 이력·backup에서 영구 평문이어야 한다고 가정하지 않는다.
10. World를 Tenant와 동일시하거나 조직 계층을 Canon으로 표현하지 않는다.
11. 대량 원시 로그를 일반 Change Set으로 무제한 적재하는 것을 현재 모델의 자연스러운 확장으로 간주하지 않는다.

## 계획·검토 시 확인할 질문

향후 schema, API, 인증, Publication, 저장소, cache, queue, 검색, export 또는 logging 설계를 변경할 때 다음을 확인한다.

- 이 결정이 모든 데이터가 익명 공개된다는 가정에 의존하는가?
- 요청과 저장 접근에서 World 경계를 항상 확인할 수 있는가?
- 나중에 World 위에 Tenant를 추가하면 전역 조회를 전부 다시 작성해야 하는가?
- actor identity가 특정 인증 provider에 영구 결합되는가?
- audience별 Projection을 추가할 수 있는가, 아니면 공개 필터가 UI에 새는가?
- private artifact의 권한 회수와 cache 무효화가 가능한가?
- 민감 데이터 삭제 시 history, backup, 검색과 Projection에서 무엇이 남는가?
- LLM과 외부 provider가 읽을 수 있는 데이터 범위가 명시되어 있는가?
- export가 콘텐츠 소유권과 접근 정책을 혼동하는가?
- 고빈도 입력이 World Revision과 Projection 비용 모델을 무너뜨리는가?

한 질문에라도 위험이 있으면 미래 기능을 미리 구현하지 말고, 현재 요구사항을 만족하는 더 가역적인 경계를 선택하거나 별도의 설계 결정을 남긴다.

## 명시적인 현재 비목표

별도의 승인 전까지 다음은 현재 제품의 비목표다.

- 사용자 가입과 계정 관리
- Tenant·조직·부서·Group 모델
- 역할 기반 또는 속성 기반 접근 제어
- World·Canon·Event별 공유 UI
- private Atropos와 audience별 Snapshot
- 공유 링크 발급·회수
- 종단간 암호화 또는 zero-knowledge 처리
- 개인정보 retention·삭제 자동화
- 고빈도 telemetry ingestion
- 다중 사용자 동시 편집과 승인 workflow

이 목록은 기능을 거절하는 것이 아니라 구현 시점을 보호한다. 미래 기능을 위한 구체 요구사항이 승인되면 해당 항목을 비즈니스 요구사항과 기술 명세로 승격하고 이 문서의 관련 부분을 대체한다.
