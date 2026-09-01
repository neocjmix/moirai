# 현재 구현 상태

이 문서는 세션과 에이전트 사이에서 현재 구현 위치를 전달하는 짧은 상태판이다. 실행 일지로 확장하지 않는다.

| 항목 | 현재 값 |
|---|---|
| 기준 계획 | [IP-001 — 첫 제품 구현 계획](IP-001-first-product-plan.md) |
| 실행 상태 | `active` |
| 활성 milestone | Milestone 3 — Clotho 최소 작성 |
| 활성 slice | 인증된 query·validate·commit, Clotho CLI와 작성 지침; 합성 Change→Publication 검증 |
| 완료 milestone | Milestone 0 — 전달·관측·보안 기반; Milestone 1 — 최초 vertical slice; Milestone 2 — 세계 확장 |
| Milestone 0 구현 commit | `d76932bcbe09c9c04af8cc3c2591f180e4426057` |
| Milestone 1 구현 commit | `7eb605a0c45f96643a7c5b2fb21b6efa89867570` |
| Milestone 2 구현 commit | `33a19cd953a8cda8165f376457c229fb8e914a42`; 검색 artifact route 수정 `37c8d3705a6386bf12711fdc282debb3a3cf3d57` |
| public integration URL | <https://moirai-production-8ed1.up.railway.app/> |
| 종료조건 검증 배포 commit | `37c8d3705a6386bf12711fdc282debb3a3cf3d57` — 이후 배포 SHA와 smoke 결과는 public `/__status` 참조 |
| 종료조건 smoke result | `passed` — GitHub Actions run `33457726072` |
| 종료조건 증거 | CI run `33457645404`: format, lint, strict typecheck, unit tests 17개, PostgreSQL integration, production build, audit, gitleaks, mobile WebKit Playwright; 공개 Revision 2 post-deploy smoke 통과 |

## 현재 검증 상태

기존 World에 복수 Event·Relation·Canon/Event Narrative·Time System·시간 배치를 한 Change Set으로 추가하여 Revision 2를 출판했다. 고정 fixture는 Event 3개, Relation 2개, Narrative 2개, 시간 배치 3개다. 원자성, 잘못된 Canon/dangling reference 거부, base Revision 충돌과 동일 digest 재시도는 PostgreSQL 통합 테스트로 검증했다.

공개 Atropos에서 Narrative·시간·Relation 이동과 검색을 확인했다. revision-pinned Event/search JSON은 ETag·immutable cache·CDN HIT/Age를 제공하며, projection allowlist와 private synthetic marker 비노출 검증을 통과했다. 모바일 흐름은 CI WebKit으로 검증했으며 실제 iPhone 기기 검증과 이번 배포의 rollback 실연은 수행하지 않았다.

Milestone 3은 아직 완료되지 않았다. [M3-CLOTHO](M3-CLOTHO.md)의 범위로 진행한다. 사용자는 기존 Railway Lachesis의 인증 필수 HTTPS endpoint와 회수 가능한 world:read/world:write credential 발급·비밀 저장소 보관을 승인했다. Credential 값은 기록하지 않는다. Milestone 4 이후는 미착수다.
