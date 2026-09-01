# M3-R — Clotho/Lachesis 책임 경계 재정렬

2026-09-02 KST 사용자 승인. 기준: CON-002, BR-001·002, TS-001·004·008, IS-001, IP-001. `4c80ee6`의 MCP/CLI 기능과 기존 M0~M3 완료 이력을 보존한다. 책임 정의는 기술 명세에 두고 이 문서는 전환과 검증을 소유한다.

## 결과와 범위

사용자·에이전트는 Clotho HTTP·MCP·CLI를 통해 탐색·작성한다. 서버 Clotho가 외부 인증과 도구 계약을 소유하고 내부 Lachesis가 최종 World·행위 인가와 원자적 정본 실행을 담당한다. 기존 synthetic World와 Publication 의미를 유지한다. 같은 프로세스의 모듈 분리이며 OS·credential 격리가 아니다.

## 실행 순서

1. Slice A: CON·BR·TS·INDEX·IS·AGENTS·IP·CURRENT 변경. 문서 링크·ID·trace 및 format 검증 후 checkpoint.
2. Slice B: `apps/clotho-api`, `packages/clotho-application`, `packages/lachesis`로 외부 접점·도구 실행·정본 실행을 분리한다. DB 조립은 API bootstrap만 허용한다. 내부 최종 인가와 adapter 동등성을 CI로 고정한다.
3. Slice C: 기존 API service의 build/start/source/variable 참조를 확인하고 public URL을 유지하여 전환한다. health와 CI·배포 smoke를 확인한다.
4. M3-C: Auth0 Free 연결. 실제 사용자 OAuth 검증과 CI bearer 검증을 별도로 기록한다.

## 필수 증거

- Clotho application에서 persistence 직접 호출 금지, Lachesis core에서 transport·OIDC·CLI 의존 금지.
- HTTP/CLI와 MCP의 입력·결과·오류 동등성 및 도구의 동일 application 호출.
- adapter 없는 내부 호출의 만료·World·행위 거부, actor 위조 차단, commit 재검증.
- PostgreSQL 원자성·conflict·idempotency 회귀와 공개 private-field 격리.
- 기존 URL의 새 service/commit readiness, CLI/MCP 읽기·validate·commit·replay 후 Atropos Publication.
- 실제 OAuth 로그인·회수 검증은 M3-C 종료조건이며 M3-R 성공으로 대신하지 않는다.

## 배포·rollback 단위

기존 Moirai API service `fe402236-354f-4088-8182-aaf5f7b34a99`와 URL `https://desirable-vitality-production-eb95.up.railway.app`를 재사용한다. worker·web·PostgreSQL·Publication 자원은 유지한다. runtime 설정 inventory와 실제 검증 증거는 전환 시 아래 기록한다.

전환 전 정상 기준은 `4c80ee6`이다. 새 app과 build/start 설정을 함께 되돌린다. rollback 시 이전 `@moirai/lachesis-api` 실행 경로와 해당 revision의 build를 사용한다. 정본 schema·World ID·Revision·Change Set·Publication 형식을 바꾸지 않으며 정본을 되감지 않는다. 이미 회수한 credential을 rollback 때문에 다시 활성화하지 않는다.

## 제외

LLM wrapper, 가입 제품·Tenant·ACL, 고정 workflow 엔진, M4, 별도 서버·서비스 인증, 새로운 유료 자원은 포함하지 않는다. 실제 진행과 blocker는 [CURRENT.md](CURRENT.md)에만 기록한다.

## 전환 inventory — 2026-09-02 KST

- Railway source: `neocjmix/moirai`, branch `main`, Wait for CI 활성화.
- 기존/유지 build: `pnpm build`; pre-deploy: `pnpm migrate && pnpm bootstrap:synthetic`.
- 기존 start: `pnpm --filter @moirai/lachesis-api start`.
- 전환 start: `pnpm --filter @moirai/clotho-api start`; readiness `/health/ready`, public URL 유지.
- 전환 commit에는 기존 package 이름의 launcher를 남겨 이전 start도 새 Clotho 서버를 실행하게 한다. 이 package에는 HTTP·인증·정본 코드가 없다. 새 start 확인 후 launcher를 제거할 수 있다.
- UI에서 `DATABASE_URL`·`CLOTHO_CREDENTIALS_JSON` 이름 존재와 `CLOTHO_OIDC_JSON` 부재를 확인했다. 값은 열람·복사하지 않았다. API credential과 DB reference는 같은 자원에 유지한다. `CLOTHO_OIDC_JSON`은 M3-C 실제 계정 연결 전까지 설정하지 않는다.
- 새 health service 이름은 `clotho-api`; health schema는 이전 `lachesis-api` 값도 읽을 수 있어 rollback 관측 호환성을 유지한다.

구현 checkpoint `edfc16ee74afe06ef2ae6152472dcd66b370c3ad`: [CI 33543491177](https://github.com/neocjmix/moirai/actions/runs/33543491177)와 [배포 smoke 33543795041](https://github.com/neocjmix/moirai/actions/runs/33543795041) 성공. API readiness의 service는 `clotho-api`이며 API·web SHA가 일치한다. Railway 시작 명령 설정도 전환 start로 변경했다. 이후 현재 배포 상태는 CURRENT와 공개 관측면을 따른다.
