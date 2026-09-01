---
id: TS-008
title: 보안·운영·성능과 배포 품질
status: accepted
layer: technical-specifications
traces:
  - CON-002
  - CON-004
  - CON-005
  - CON-007
  - BR-002
  - BR-003
  - BR-005
  - BR-006
  - BR-007
---

# TS-008 — 보안·운영·성능과 배포 품질

## TS-008.1 목적

이 명세는 Moirai 1차 구현의 인증, 정보 보호, backup, 관측성, 성능 목표, test와 배포 기준을 정의한다. 수치는 제품 의미를 바꾸는 조건이 아니라 구현과 운영 상태를 판단하기 위한 초기 SLO다.

## TS-008.2 환경과 신뢰 경계

| 경계 | 접근 |
|---|---|
| Atropos public web | 익명 읽기 |
| Publication Store | Atropos의 읽기와 worker의 쓰기 |
| Clotho HTTP·MCP | 인증된 operator와 agent·CLI client |
| Lachesis internal application | 신뢰된 서버 Clotho와 제한된 내부 운영 |
| Canonical PostgreSQL | Lachesis application, worker와 제한된 migration job |
| private source storage | Lachesis의 origin 기능과 export job |

- Atropos runtime은 Canonical PostgreSQL credential을 갖지 않는다.
- Clotho application은 데이터베이스와 Publication Store에 직접 접근하지 않는다. 같은 프로세스의 bootstrap만 Lachesis와 DB를 조립한다. 이 배치는 credential 격리를 제공하지 않는다.
- worker는 정본을 읽고 projection을 쓰지만 정본 세계 내용을 수정하지 않는다.
- 관리 endpoint를 public route prefix 아래 두지 않는다.

## TS-008.3 인증과 권한

1차 구현은 하나의 운영 권한으로 충분하지만 인증 없는 쓰기를 허용하지 않는다.

### 인간 operator

- Clotho 서버가 외부 OIDC provider의 토큰을 검증하고 내부 actor로 매핑한다. issuer·audience·signature·만료·scope를 확인하며 OIDC subject나 email을 정본 actor로 쓰지 않는다.
- 애플리케이션이 password database를 직접 운영하지 않는다.
- private 관리 UI가 cookie session을 사용하면 `HttpOnly`, `Secure`, `SameSite`와 CSRF 방어를 적용한다.
- 중요 export와 credential 변경에는 최근 인증을 요구할 수 있다.

### Clotho client

- 짧은 수명 또는 명시적으로 회수 가능한 bearer credential을 사용한다.
- credential은 `world:read`, `world:write`, `export`, `admin` scope를 구분한다.
- token을 skill package, repo, log, Change Set 또는 LLM prompt에 저장하지 않는다.
- CLI는 environment 또는 OS credential store에서 token을 읽고 stdout에 출력하지 않는다.

### 권한 규칙

- 1차 구현에서 한 operator가 모든 World를 관리할 수 있다.
- Lachesis 내부 계약은 인증된 actor, 허용 World, 행위 scope와 만료를 요구한다. 최종 인가는 adapter 밖에서도 실행하며 commit마다 재확인한다. 외부 요청의 actor·scope는 신뢰하지 않는다.
- 같은 process에서는 신뢰된 bootstrap이 인증 adapter와 내부 application을 연결한다. 별도 process로 분리할 때는 검증된 서비스 간 신뢰 전달 계약을 먼저 정의한다.
- 다중 역할, 승인 workflow와 공동 편집은 구현하지 않는다.
- 인증 방식이 Canon의 진실 지위나 Publication 상태를 만들지 않는다.

## TS-008.4 주요 위협과 통제

| 위협 | 통제 |
|---|---|
| 원자료 prompt injection | source를 instruction과 분리하고 typed tool만 허용 |
| private 정보의 공개 Snapshot 유출 | allowlist projection, 누출 검증 test |
| Markdown XSS | raw HTML 제한, sanitizer, CSP |
| Change replay·중복 write | idempotency key, request digest, expected Revision |
| 권한 없는 직접 DB write | network와 DB role 분리, write path 제한 |
| import path traversal·zip bomb | TS-007 container validation과 resource limit |
| graph resource exhaustion | LOD, viewport budget, server-side artifact 제한 |
| SSRF를 통한 원자료 fetch | URL scheme·host policy, size/time limit, private IP 차단 |
| log를 통한 본문·token 유출 | 구조화된 metadata allowlist와 redaction |
| 공급망 변조 | lockfile, provenance가 있는 build, dependency audit |

## TS-008.5 데이터 보호

- network traffic은 TLS를 사용한다.
- managed PostgreSQL, object storage와 backup은 at-rest encryption을 사용한다.
- 원자료 attachment는 public bucket과 물리적·권한상 분리한다.
- public reference URL이 private source object URL을 재사용하지 않는다.
- production data를 local fixture로 복사하지 않는다.
- 개발용 sample World는 합성 또는 공개 가능한 자료만 사용한다.
- secret rotation 후 이전 credential을 즉시 회수할 수 있어야 한다.

## TS-008.6 로그와 개인정보

구조화된 log의 기본 필드:

- timestamp, level, service, environment
- trace ID와 request ID
- World ID, Change Set ID와 Revision
- route 또는 operation kind
- duration, result code와 retry count

기본적으로 기록하지 않는 값:

- Narrative와 원자료 본문
- LLM prompt와 출력 전문
- authorization header, cookie와 signed URL
- Change Operation의 before·after payload
- attachment filename에 포함된 민감한 정보

디버깅을 위해 content logging이 필요하면 production 기본값으로 켜지 않고 명시적·단기적·감사 가능한 절차를 사용한다.

## TS-008.7 관측성

### metrics

#### Clotho

- 외부 request·tool rate, latency와 error rate
- 인증 실패, scope 거부, 입력·응답 예산과 호출 제한

#### Lachesis

- 내부 command·query latency와 최종 인가 거부
- validation error code 분포
- commit latency와 transaction rollback
- Revision conflict와 idempotent replay 수
- DB connection, lock wait와 query latency

#### Projection

- `publication_target_revision - served_revision`
- commit부터 served pointer 교체까지의 시간
- queue depth, oldest job age, retry와 dead-letter
- Snapshot 생성 시간, 크기와 completeness failure
- projection type·algorithm version별 실패

#### Atropos

- HTML·Snapshot document latency와 cache hit
- current pointer fetch 실패
- graph artifact size와 visible cell 수
- client error, hydration failure와 long task
- Core Web Vitals

### trace

Change commit → outbox → projection build → pointer swap까지 Change Set ID와 World Revision으로 연결한다. public request trace에는 private actor와 origin을 넣지 않는다.

## TS-008.8 health check

| check | 의미 |
|---|---|
| `/health/live` | process event loop가 응답하는지 확인 |
| `/health/ready` | 해당 service가 요청을 안전하게 받을 dependency 상태인지 확인 |
| projection freshness | target과 served Revision 차이 및 oldest age |
| Publication integrity | current pointer가 완성된 manifest와 digest를 가리키는지 확인 |

Lachesis DB 장애가 Atropos process readiness를 자동 실패시키지 않는다. Atropos는 마지막 완성 Snapshot을 제공할 수 있다.

## TS-008.9 초기 SLO

### 공개 읽기

- Atropos HTML availability: 월 99.9% 목표
- cached immutable Snapshot document p95: 200ms 이하
- uncached Event detail origin p95: 500ms 이하
- 모바일 p75 LCP: 2.5초 이하
- layout shift CLS: 0.1 이하

### 비공개 작성

- 일반 context read p95: 750ms 이하
- text search p95: 1초 이하
- 500 Operation 이하 Change validation p95: 2초 이하
- 500 Operation 이하 Change commit p95: 3초 이하

commit latency는 Publication projection 시간을 포함하지 않는다.

### Publication 전파

- 정상 상태에서 commit→served p95: 60초 이하 목표
- 5분 이상 target과 served가 다르면 warning
- 15분 이상 다르거나 연속 projection 실패 시 alert

이 전파 SLO는 콘텐츠를 draft나 승인 대기로 분류하지 않는다. commit 성공 시 target Publication이라는 [TS-003](TS-003-change-revision-publication.md)의 상태 모델을 유지한다.

## TS-008.10 규모 기준선

1차 구조는 최소 다음 fixture에서 기능과 성능을 검증한다.

- World 하나당 Event 100,000개
- Relation 500,000개
- Canon 20개
- Narrative 본문 합계 1GB
- Subject Handle 50,000개
- 동시 public reader 1,000명
- operator write는 드물고 한 World에 순차적으로 commit

이 수치는 브라우저가 한 화면에 모두 렌더링해야 한다는 뜻이 아니다. TS-006의 LOD와 scope artifact가 필수다.

## TS-008.11 graph runtime budget

중간급 모바일 기기의 한 viewport에서 목표 budget:

- JointJS cell 총합 1,000 이하
- 동시에 표시되는 text label 250 이하
- 초기 graph artifact 압축 크기 500KB 이하
- pointer interaction 중 30fps 미만 frame이 연속 500ms 이상 지속되지 않음
- 일반 pan·zoom 목표 60fps

budget을 넘기면 cell을 전부 생성한 뒤 숨기지 않고 더 낮은 LOD 또는 좁은 scope를 요청한다.

## TS-008.12 backup과 disaster recovery

### Canonical PostgreSQL

- point-in-time recovery를 지원하는 continuous backup
- daily full backup 또는 provider equivalent
- 30일 보존
- 분기마다 isolated environment에서 restore drill
- 목표 RPO: 15분
- 목표 RTO: 4시간

### Publication Store

- Revision artifact는 immutable
- current pointer의 이전 값과 변경 이력을 보존
- 정본 Revision에서 전체 rebuild 가능
- Publication Store 손실은 정본 데이터 손실로 간주하지 않지만 Atropos 복구 절차를 자동화한다.

### private source storage

- versioning과 lifecycle policy
- database의 digest reference와 attachment 존재 여부를 정기 검사
- source 누락은 World 사실을 삭제하지 않지만 owner-full 복구 completeness를 낮춘다.

## TS-008.13 queue와 worker 운영

- 초기 queue는 PostgreSQL outbox와 job table을 사용한다.
- 별도 Redis를 1차 필수 dependency로 추가하지 않는다.
- worker는 `FOR UPDATE SKIP LOCKED` 또는 동등한 원자적 claim을 사용한다.
- job은 lease, heartbeat, attempt count와 next retry time을 가진다.
- retry는 exponential backoff와 jitter를 사용한다.
- 같은 World의 오래된 작업이 최신 served pointer를 되돌리지 못한다.
- full rebuild와 scoped rebuild는 같은 projector를 호출한다.

## TS-008.14 배포 구조

논리적 production 단위:

- `clotho-api`: 인증된 public TLS endpoint; Lachesis application은 같은 process의 private module
- `lachesis-worker`: private network
- `atropos-web`: public edge/web runtime
- managed PostgreSQL
- public Publication Store/CDN
- private source object storage

모든 service는 같은 monorepo와 contract package에서 build할 수 있지만 독립적으로 rollback 가능해야 한다.

## TS-008.15 database migration

- migration은 version control에 저장하고 application startup의 암묵적 side effect로 실행하지 않는다.
- 배포 pipeline의 명시적 단계에서 한 번 실행한다.
- 가능한 경우 expand → backfill → switch → contract 순서를 사용한다.
- 오래 걸리는 index는 online/concurrent 방식 또는 별도 maintenance step으로 만든다.
- destructive migration 전에 backup과 restore 가능성을 확인한다.
- migration 중 구버전 API와 worker가 안전하게 동작할 compatibility window를 둔다.
- schema rollback이 불가능하면 forward fix 절차를 준비한다.

## TS-008.16 application 배포와 rollback

1. contract와 migration compatibility test
2. artifact build, SBOM과 dependency scan
3. migration dry-run 또는 shadow database 검증
4. Clotho API(내부 Lachesis 포함)/worker 순차 배포
5. health·error·projection canary 확인
6. Atropos 배포
7. synthetic public route와 Change→Publication 검증

application rollback은 World Revision을 되돌리지 않는다. 잘못된 세계 내용은 TS-003의 복구 Change Set으로 고친다.

## TS-008.17 test 전략

### contract test

- Clotho command/query schema와 CLI·MCP 동등성
- adapter 없는 Lachesis 최종 인가·World 격리·만료·actor 위조 차단
- Publication Snapshot format
- export/import package version
- 구버전 reader와 새 optional field compatibility

### domain test

- Canon 경계와 Relation endpoint
- contains cycle
- Time System 좌표와 uncertainty
- Change 원자성, conflict와 idempotency
- Subject reconciliation과 Timeline partial order

### property test

- Relation graph 생성에서도 cross-Canon 불변식 유지
- Change Operation 재생으로 임의 Revision 재구성
- export/import semantic fingerprint round-trip
- 오래된 worker가 pointer를 되돌리지 못함

### integration·E2E

- 새 World 작성→commit→Snapshot→Atropos 공개
- 기존 World 확장과 안정적 URL 유지
- 정정·철회와 tombstone
- Canon 비교
- restore-in-place와 clone import
- Lachesis 중단 중 마지막 Snapshot 읽기

test runner가 종료되지 않거나 background handle을 남기는 것도 실패로 취급한다. 일부 test subset 통과로 전체 suite hang을 성공으로 간주하지 않는다.

## TS-008.18 정적 분석과 품질 gate

- Clotho application→persistence, Lachesis core→MCP·OIDC·CLI 의존 금지 검사
- TypeScript strict mode
- formatter와 lint
- SQL migration lint와 schema drift 검사
- dependency vulnerability와 license 검사
- secret scan
- Markdown local link와 document ID 검사
- Publication private-field leakage fixture
- bundle와 graph artifact budget 검사

실패하는 필수 gate를 장기간 allow-failure로 두지 않는다. flaky test는 실패 증거와 owner를 남기고 격리하되 검증 범위에서 조용히 삭제하지 않는다.

## TS-008.19 alert와 운영 대응

즉시 대응 alert:

- Canonical DB 쓰기 불가
- backup 또는 restore verification 실패
- Publication integrity failure
- private field leakage 검사 실패
- served pointer rollback 시도
- 인증 실패 급증 또는 credential misuse

warning:

- publication lag 5분 초과
- queue oldest age 증가
- graph artifact budget 초과
- p95 latency SLO 초과
- source attachment digest mismatch

alert에는 World ID와 Revision은 포함할 수 있지만 Narrative·원자료 본문은 포함하지 않는다.

## TS-008.20 운영 runbook

최소 runbook:

- Lachesis DB 장애
- projection queue 정체와 poison job
- target/served Revision 불일치
- 잘못된 Snapshot pointer와 rollback
- private 정보 공개 의심
- credential 유출·회수
- database PITR
- Publication 전체 rebuild
- export/import 실패와 손실 report

각 runbook은 감지, 안전한 즉시 조치, 복구, 검증과 사후 기록을 포함한다.

## TS-008.21 수용 기준

1. Atropos credential로 private API 또는 정본 table을 읽을 수 없다.
2. Clotho token이 log, prompt와 Change history에 남지 않는다.
3. private source fixture가 Publication Snapshot에 들어가면 build가 실패한다.
4. Lachesis를 중단해도 마지막 완성 Snapshot의 public 읽기가 유지된다.
5. target/served 차이와 projection 실패 원인을 운영자가 확인할 수 있다.
6. 100k Event fixture에서 전체 World를 browser에 적재하지 않고 graph를 탐색한다.
7. PostgreSQL backup을 isolated environment에 실제 restore할 수 있다.
8. application rollback이 World Revision을 되돌리지 않는다.
9. 전체 test suite가 background process를 남기지 않고 종료한다.
10. Change commit에서 공개 route까지의 synthetic test가 production 배포 후 통과한다.
