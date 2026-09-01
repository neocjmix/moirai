# 현재 구현 상태

세션과 에이전트 사이의 짧은 상태판이다. 다음 milestone은 사용자 지시 없이 활성화하지 않는다.

| 항목 | 현재 값 |
|---|---|
| 기준 계획 | [IP-001 — 첫 제품 구현 계획](IP-001-first-product-plan.md) |
| 실행 상태 | `completed` — Milestone 3 종료조건 검증 완료 |
| 활성 milestone | 없음 — Milestone 4 이후 미착수 |
| 마지막 slice | 인증된 query·validate·commit, Clotho CLI·skill, 실제 작성→Publication→Atropos 검증 |
| 완료 milestone | Milestone 0 전달·관측·보안 기반; 1 최초 vertical slice; 2 세계 확장; 3 Clotho 최소 작성 |
| Milestone 3 구현·검증 commit | `894e9030ebb38e2fed326beea74139bbbf346836` |
| public integration URL | <https://moirai-production-8ed1.up.railway.app/> |
| Clotho synthetic World | <https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101> |
| 인증 API | <https://desirable-vitality-production-eb95.up.railway.app> — health 외 작성·탐색 요청은 bearer 인증 필수 |
| 종료조건 CI | [33488232165](https://github.com/neocjmix/moirai/actions/runs/33488232165) `success` |
| 종료조건 smoke | [33488357469](https://github.com/neocjmix/moirai/actions/runs/33488357469) `success` — 기존 M2 및 실제 Clotho 작성 검증 |
| 현재 배포 SHA·마지막 smoke | 공개 `/__status` 참조 |

## 검증 및 운영 경계

[M3-CLOTHO](M3-CLOTHO.md)의 범위를 구현했다. CI에서 format·lint·strict typecheck·unit 26개·PostgreSQL integration 10개·production build·dependency audit·gitleaks·mobile WebKit을 통과했다. 새 CLI 프로세스가 World를 재발견하고 context를 읽은 뒤 validate·commit·동일 요청 replay를 수행했다. 실제 worker가 공개한 Event의 Narrative와 Relation, revision JSON을 검증했다. 원본 Lantern fixture의 Revision 2는 유지한다.

신규 credential은 read/write scope와 Clotho synthetic World 하나로 제한하고 30일 만료를 적용했다. 원문은 GitHub Actions secret, hash 설정은 Railway API에만 저장했다. 외부 PR에는 이 secret을 주입하지 않는다. Atropos·worker에는 credential이 없다. 일반 ChatGPT 대화가 자동 인증되는 것은 아니며, 다른 agent 실행 환경은 별도의 안전한 secret injection 연결이 필요하다.

실제 iPhone 기기 시험과 production rollback 실연은 수행하지 않았다. rollback은 credential hash 회수 또는 API endpoint 폐쇄 후 이전 정상 application commit으로 되돌리며 additive migration과 정본 Revision은 유지한다. 다음 최소 작업은 사용자가 선택한 agent 실행 환경의 Clotho 연결이다. 제품 기능의 다음 milestone은 Milestone 4이며 아직 승인·활성화하지 않았다.
