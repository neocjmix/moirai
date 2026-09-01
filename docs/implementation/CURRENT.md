# 현재 구현 상태

세션과 에이전트 사이의 짧은 상태판이다. 다음 milestone은 사용자 지시 없이 활성화하지 않는다.

| 항목 | 현재 값 |
|---|---|
| 기준 계획 | [IP-001 — 첫 제품 구현 계획](IP-001-first-product-plan.md) |
| 실행 상태 | `active` — M3-R 구현 검증 완료, 원격 업로드·배포 진행 |
| 활성 milestone | M3-R — Clotho/Lachesis 경계 재정렬; 이후 M3-C Auth0 연결; M4 이후 미착수 |
| 현재 slice | Slice A 원격 반영 완료; B 로컬 구현·검증 완료; C 배포 검증 진행 |
| 연결 blocker | Auth0 Free 선정 완료; tenant·운영자·ChatGPT OAuth client 미설정. 실제 OAuth 연결 미완료 |
| 업로드·배포 승인 | 2026-09-02 KST 사용자가 이번 코드를 공개 `neocjmix/moirai` main에 업로드하고 기존 Railway에 배포하는 것을 명시적으로 승인함. |
| 완료 milestone | Milestone 0 전달·관측·보안 기반; 1 최초 vertical slice; 2 세계 확장; 3 Clotho 최소 작성 |
| Milestone 3 구현·검증 commit | `894e9030ebb38e2fed326beea74139bbbf346836` |
| public integration URL | <https://moirai-production-8ed1.up.railway.app/> |
| Clotho synthetic World | <https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101> |
| Clotho 인증 API | <https://desirable-vitality-production-eb95.up.railway.app> — health 외 작성·탐색 요청은 bearer 인증 필수 |
| 종료조건 CI | [33488232165](https://github.com/neocjmix/moirai/actions/runs/33488232165) `success` |
| 종료조건 smoke | [33488357469](https://github.com/neocjmix/moirai/actions/runs/33488357469) `success` — 기존 M2 및 실제 Clotho 작성 검증 |
| 현재 배포 SHA·마지막 smoke | 공개 `/__status` 참조 |

## 검증 및 운영 경계

[M3-CLOTHO](M3-CLOTHO.md)의 범위를 구현했다. CI에서 format·lint·strict typecheck·unit 26개·PostgreSQL integration 10개·production build·dependency audit·gitleaks·mobile WebKit을 통과했다. 새 CLI 프로세스가 World를 재발견하고 context를 읽은 뒤 validate·commit·동일 요청 replay를 수행했다. 실제 worker가 공개한 Event의 Narrative와 Relation, revision JSON을 검증했다. 원본 Lantern fixture의 Revision 2는 유지한다.

신규 credential은 read/write scope와 Clotho synthetic World 하나로 제한하고 30일 만료를 적용했다. 원문은 GitHub Actions secret, hash 설정은 Railway API에만 저장했다. 외부 PR에는 이 secret을 주입하지 않는다. Atropos·worker에는 credential이 없다. MCP 배포 `4c80ee6`의 CI·[smoke 33512933575](https://github.com/neocjmix/moirai/actions/runs/33512933575) 성공 이력도 유지한다. 일반 ChatGPT 대화가 자동 인증되는 것은 아니며, 다른 agent 실행 환경은 별도의 안전한 secret injection 연결이 필요하다.

실제 iPhone 기기 시험과 production rollback 실연은 수행하지 않았다. rollback은 credential hash 회수 또는 API endpoint 폐쇄 후 이전 정상 application commit으로 되돌리며 additive migration과 정본 Revision은 유지한다. 사용자는 외부 OIDC 로그인과 Clotho MCP 연결 확장을 승인했다. [연결 확장](M3-CONNECTION.md)은 실제 provider·ChatGPT 인증까지 검증하기 전 완료가 아니다. 제품 기능의 다음 milestone은 Milestone 4이며 아직 승인·활성화하지 않았다.

M3-R 문서 기준선은 원격 `18638a5bddbf2852a0b23bf100ad8bd0b4e25434`에 반영했다. 로컬 구현 checkpoint는 `4565be9`이며 원격에 업로드되지 않았다. Clotho API/application과 Lachesis 내부 실행기를 분리하고 43 tests·strict typecheck·production build·format·lint·dependency audit·의존성 검사·staged secret-pattern scan을 통과했다. 새 구조의 PostgreSQL·mobile WebKit·CI gitleaks·배포 smoke는 원격 업로드 이후 검증해야 한다.

기존 `@moirai/lachesis-api` package는 전환 중 시작 명령 호환용 launcher만 남으며 정본 API를 노출하지 않는다. Railway source·Wait for CI·build/pre-deploy/start·필수 변수 이름만 확인했고 설정은 변경하지 않았다. `CLOTHO_OIDC_JSON`은 없다. Auth0 계정 생성·연결과 M4는 진행하지 않았다.

다음 조치: 승인된 코드를 원격 main에 반영하고 CI와 smoke를 검증한다. start를 `@moirai/clotho-api`로 전환한 뒤 M3-C로 진행한다. runtime code는 이전에 검증한 `4565be9`와 동일하다.
