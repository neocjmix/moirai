# IP-011 A5 implementation handoff

## 현재 인계 — 2026-09-28 23:25 KST

사용자는 신규 기능·최적화 구현·설계를 중지하고 현재 상태 정합화와 커밋만 지시했다. runtime 기준점은 main/운영 `bf8701e043d3dfa67a04cb25bd70e088e4396349`이며 문서 커밋과 구분한다. [CURRENT](CURRENT.md)와 [기준점·검증·미해결](../evidence/ip011/a5-stabilization-baseline.md)을 먼저 읽는다. 30개 선택 지연, 관계선/hull support 완전성, A4 frame 미달은 남아 있다. Redis/Elasticsearch·LOD·hull 발행은 채택된 설계가 아니다. 새 사용자 지시 없이 구현·설계를 재개하지 않는다.

## 이전 계획 인계 — 아래 실행 지시는 현재 중지됨

2026-09-28 KST. 준비 세션은 문서만 작성했다. 구현·운영 데이터 변경·merge·deployment는 실행하지 않았다. 다음 세션에서 사용자가 아래 시작 지시를 전달하면 planning-only 제한을 대체하여 A5 구현을 활성화한다. 활성화 전 CURRENT/AGENTS의 계획 전용 상태를 명시적으로 갱신한다.

2026-09-28 실행 후속: 구현 시작 지시를 수신했고 PR #237을 `55cae82`로 병합했다. A5 구현은 활성이다. 아래는 인계 당시 기록이며 최신 checkpoint는 CURRENT와 [A5 실행](../evidence/ip011/a5-execution.md)을 따른다.

## 가져올 기준선

- Repository: https://github.com/neocjmix/moirai
- 계획 브랜치: `docs/ip011-a5-planning-baseline`
- 조사한 main·Atropos health SHA: `8937cb4142215b439d4430e61b9db1ae15f218c8`. 새 세션에서는 최신 상태를 다시 확인한다.
- 실행 계획: [IP-011-A5-collection-discovery-plan.md](IP-011-A5-collection-discovery-plan.md).
- 함께 개정한 BR-003/JRN-004/TS-005/006, IP-011/CURRENT/INDEX/AGENTS를 계획과 함께 가져온다. main에 아직 없다면 main만 읽고 과거 E1~E3를 실행하지 않는다.
- 기존 A4 증거·백로그는 보존한다. A4 종료는 성능 전체 통과가 아니다.

## 확정된 후속 결정

1. 사건 검색·관계 필터·미배치 사건 접근은 새 Graph UX 채택 후 하단 내비게이션 탐색에서 해결한다. S1에서 대체 UI를 강제하지 않는다. 전체 Collection browser/search escape hatch는 별도 유지한다.
2. 첫 방문은 읽기 좋은 특정 맥락에서 시작한다. 재방문은 기존 viewport 위치·배율 복원 로직을 유지한다.
3. Pin은 다음 방문에도 유지하며 명시적으로 해제·초기화한다. Pin 복원이나 자동 relevance가 복원 viewport를 이동시키지 않는다.

## 다음 세션 첫 실행

최신 remote/main·계획 branch/PR·CI·운영 SHA를 대조한다. 계획이 미병합이면 문서 변경을 검토하고 필요한 gate를 통과시켜 먼저 통합한다. 사용자 시작 지시가 있으면 CURRENT/AGENTS에서 A5 implementation active를 명시하고 S0→S1을 시작한다. 기존 상태 복원·pointer/drawer 회귀와 suppression golden을 고정하고 Island feature-off + 최소 World/dominant Composite HUD를 첫 검토 가능한 결과로 만든다.

S2 표현·입력 분리와 S3 수동 다중 활성 capacity를 자동 relevance보다 먼저 수행한다. 뒤의 S4~S7은 상세 계획의 선행/검증 조건에 따라 진행한다. A6/M5·대량 역사 입력·canonical migration·새 유료 서비스는 활성화하지 않는다. 새 알고리즘 수치와 16개 활성 목표는 검증 가설이며 현재 달성값이 아니다.

작업은 작은 검증 가능한 slice로 나누고 기존 IP-011 실행 권한 안에서 테스트·PR·merge·배포·공개 mobile smoke까지 확인한다. 기준 미달은 기록하고 계속 수정하며, 새 제품 의미를 결정해야 하는 경우만 하이레벨 질문으로 올린다. 기존 결정 재질문이나 합의 없이 gate 완화는 금지한다.
