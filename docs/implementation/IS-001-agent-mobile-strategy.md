---
id: IS-001
title: 에이전트·모바일 중심 구현 전략
status: accepted
layer: implementation-strategy
scope: execution
---

# IS-001 — 에이전트·모바일 중심 구현 전략

## IS-001.1 목적

Moirai는 사용자가 주로 모바일에서 에이전트를 지시하고 배포된 결과를 확인하는 방식으로 개발한다. 사용자가 로컬 full-stack 환경을 직접 운영하거나 모든 diff를 line-by-line으로 검토하는 것을 품질 보증의 전제로 삼지 않는다.

따라서 구현 과정은 다음을 보장해야 한다.

- 작은 단위의 결과가 클라우드에서 빠르게 실행된다.
- 사용자는 모바일 브라우저와 공개 GitHub 화면만으로 핵심 동작을 확인할 수 있다.
- 에이전트가 스스로 diff, test, log와 배포 결과를 검증하고 압축된 증거를 제공한다.
- 공개 저장소와 공개 관측면 어디에도 비밀정보나 비공개 데이터가 남지 않는다.
- 현재 승인된 요구사항과 기술 명세를 구현하되 미래 로드맵을 선행 구현하지 않는다.

이 문서는 구현 순서나 milestone을 정의하지 않는다. 구체적인 build order와 종료조건은 별도 구현 계획에서 정한다.

## IS-001.2 문서 우선순위와 변경 통제

구현자는 다음 순서로 판단한다.

1. 헌법
2. 비즈니스 요구사항과 사용자 여정
3. 기술 명세
4. 이 구현 전략과 저장소의 `AGENTS.md`
5. 현재 구현 계획
6. 코드의 기존 관례

상위 문서와 코드가 충돌하면 코드를 조용히 기준으로 삼지 않는다. 충돌을 보고하고 승인된 문서 또는 구현을 명시적으로 정정한다.

- `accepted` 문서의 제품 의미를 구현 편의로 변경하지 않는다.
- [RM-001](../roadmap/RM-001-personalization-multitenancy.md)은 미래 호환성 점검에만 사용한다.
- 별도 요구사항 없이 Tenant, ACL, private Publication, E2EE와 대량 log ingestion을 구현하지 않는다.
- 미래 확장을 위한 placeholder schema와 추상화 계층을 미리 만들지 않는다.

## IS-001.3 결과 중심 개발 단위

구현 단위는 파일 수나 layer 완성도가 아니라 외부에서 검증 가능한 동작으로 자른다. 가능하면 하나의 작은 vertical slice가 contract, domain, persistence, projection과 사용자 표면을 관통한다.

각 작업은 시작 전에 다음을 짧게 정의한다.

- 사용자가 확인할 동작
- 관련 요구사항·기술 명세 ID
- 변경할 경계와 변경하지 않을 경계
- 자동 검증 방법
- 배포 후 확인할 URL 또는 machine-readable 결과
- 실패 시 되돌릴 단위

한 작업에서 unrelated refactor, dependency upgrade와 기능 변경을 섞지 않는다. 큰 변경이 필요하면 각각 독립적으로 검증 가능한 commit으로 나눈다.

## IS-001.4 사용자의 검토 부담을 코드 품질로 전가하지 않는다

사용자가 line-by-line review를 하기 어렵다는 사실은 review를 생략할 이유가 아니다. 에이전트가 다음 책임을 대신 수행한다.

- commit 전 전체 diff를 직접 다시 읽는다.
- 요구사항 추적과 scope creep 여부를 확인한다.
- 타입 오류, dead code, 임시 우회, 누락된 오류 처리를 점검한다.
- migration과 공개 contract의 호환성을 확인한다.
- 관련 test와 build를 실행한다.
- 배포 후 synthetic smoke test를 실행한다.
- 알려진 한계와 검증하지 못한 부분을 숨기지 않는다.

사용자에게는 코드 변경량보다 판단 가능한 증거를 한 화면 분량으로 우선 제공한다.

| 항목 | 보고 내용 |
|---|---|
| Outcome | 무엇이 실제로 동작하는가 |
| Public URL | 모바일에서 바로 열 수 있는 route |
| Revision | commit SHA와 배포된 build SHA |
| Verification | 통과한 test, build와 smoke scenario |
| Data | 사용한 synthetic fixture와 예상 상태 |
| Risk | 남아 있는 위험, 미검증 범위와 rollback 방법 |
| Next | 다음 구현 단위 또는 사용자 판단이 필요한 한 가지 |

긴 실행 로그는 기본 보고가 아니다. 실패 원인이나 의사결정에 필요한 경우에만 요약하고 원본 artifact를 연결한다.

## IS-001.5 Cloud-first 관측면

로컬 실행은 에이전트의 빠른 개발·진단 수단이지만 사용자의 검수 조건이 아니다. 의미 있는 checkpoint는 cloud environment에 배포해 모바일에서 확인할 수 있어야 한다.

### 영구 공개 표면

최소한 다음 표면을 유지한다.

| 표면 | 목적 | 공개 정책 |
|---|---|---|
| Atropos URL | 실제 독자 경험 검증 | 완전 공개 |
| 고정 synthetic World | Event·graph·Revision의 반복 가능한 fixture | 완전 공개 |
| `/health` | 배포 readiness의 최소 machine check | 완전 공개, 최소 정보만 반환 |
| `/__status` | 현재 build와 공개 pipeline 상태 확인 | 완전 공개, allowlist metadata만 반환 |
| GitHub Actions | test·build·secret scan 결과 | 공개 repository의 check와 summary |

`/__status`는 모바일에서 읽기 쉬운 HTML과 machine-readable JSON 중 적어도 하나를 제공한다. 다음 정보만 allowlist로 노출한다.

- application version과 commit SHA
- 배포 시각
- contract, schema와 Publication format version
- synthetic World의 `current_revision`, `served_revision`과 projection 상태
- 마지막 post-deploy smoke test 결과와 시각
- 각 공개 표면의 정상·지연·실패 상태

다음은 공개하지 않는다.

- 환경 변수 값과 credential 존재 여부의 상세
- database, bucket과 private service hostname
- stack trace, SQL, filesystem path와 dependency topology
- request header, cookie, token과 actor 정보
- 원자료나 비공개 본문
- 임의 World의 목록·통계·오류 내용

Raw infrastructure log, trace와 metric은 문제 해결을 위한 운영 표면이지 사용자용 공개 관측면이 아니다. 이들은 비공개 운영 도구에 두고, 공개 `/__status`에는 검증된 요약만 투영한다.

### 배포 식별

- 공개 화면에서 현재 배포의 짧은 commit SHA를 확인할 수 있게 한다.
- 사용자에게 전달한 URL이 어느 Revision을 보고 있는지 표시한다.
- server, client와 Publication Snapshot이 서로 다른 build·Revision을 섞으면 진단할 수 있어야 한다.
- 이전 정상 deployment로 되돌릴 수 있는 단위를 유지한다.

### 모바일 검수

- 핵심 route는 실제 mobile viewport와 touch 입력으로 Playwright 검증한다.
- pointer hover만으로 의미가 드러나는 동작을 만들지 않는다.
- graph의 pan, pinch zoom, bottom sheet와 stable URL을 실제 모바일 브라우저에서 확인 가능하게 한다.
- 사용자에게 terminal command 실행이나 localhost 접근을 요구하지 않는다.
- 모바일에서 재현하기 어려운 내부 동작은 `/__status`, synthetic scenario 또는 공개된 결과 route로 관측 가능하게 만든다.

## IS-001.6 배포 흐름

기본 흐름은 작고 자주 배포되는 public integration environment다.

1. 에이전트가 관련 문서와 현재 구현 계획을 읽는다.
2. 작은 변경과 자동 test를 함께 작성한다.
3. diff self-review와 secret scan을 수행한다.
4. commit하고 public GitHub에 push한다.
5. CI가 typecheck, test, build와 보안 gate를 실행한다.
6. CI가 성공한 commit만 cloud environment에 배포한다.
7. healthcheck가 성공한 뒤 새 deployment로 traffic을 전환한다.
8. post-deploy smoke test가 공개 URL에서 핵심 scenario를 확인한다.
9. 에이전트가 URL, commit과 증거 요약을 사용자에게 전달한다.

Railway의 GitHub autodeploy를 사용할 때 [Wait for CI](https://docs.railway.com/deployments/github-autodeploys)를 활성화해 실패한 commit의 배포를 건너뛴다. `/health`는 process가 떴다는 사실만이 아니라 필수 설정과 안전한 dependency readiness를 확인한 뒤 `200`을 반환한다. Railway [healthcheck](https://docs.railway.com/deployments/healthchecks)가 성공하기 전에는 이전 정상 deployment를 계속 제공한다.

### PR preview 사용 기준

Railway의 [PR environments](https://docs.railway.com/environments)는 다음 경우에 선택적으로 사용한다.

- 사용자 경험의 두 대안을 비교할 때
- migration이나 infrastructure 변경을 main과 격리해야 할 때
- 큰 graph interaction을 모바일에서 merge 전에 확인해야 할 때

모든 사소한 변경에 PR environment를 강제하지 않는다. preview는 synthetic data와 preview 전용 credential만 사용한다. 외부 contributor의 PR에는 secret이 전달되거나 infrastructure가 자동 생성되지 않게 한다.

## IS-001.7 검증 전략

라인 단위 인간 검토가 제한되므로 자동 검증을 구현의 일부로 취급한다.

### 기본 gate

- format·lint
- TypeScript strict typecheck
- unit test
- PostgreSQL을 사용하는 persistence·migration integration test
- JSON Schema contract test
- deterministic projection golden test
- public/private fixture leakage test
- production build
- dependency vulnerability audit
- secret scan

### 변경 종류별 추가 gate

| 변경 | 추가 검증 |
|---|---|
| schema·migration | 빈 DB와 이전 fixture 양쪽에서 migrate, semantic invariant 확인 |
| Change Set | 원자성, conflict, idempotency와 history round-trip |
| Projection | 같은 입력의 동일 digest, 오래된 worker의 pointer 역행 방지 |
| Atropos | mobile viewport E2E, URL 안정성, accessibility와 graph budget |
| export/import | semantic fingerprint round-trip와 path/resource 공격 fixture |
| auth·secret | unauthorized case, log·artifact·client bundle leakage 검사 |
| deployment | public health, status, synthetic World와 revision-pinned read smoke test |

Test를 통과시키기 위해 요구사항을 약화하거나 assertion을 삭제하지 않는다. flaky test는 원인과 owner 없이 retry로 덮지 않는다.

## IS-001.8 공개 저장소와 비밀정보 관리

저장소, CI 결과와 사용자 관측면은 모두 공개라고 가정한다. 저장소에 들어간 값은 삭제 commit만으로 회수됐다고 보지 않는다.

### 절대 금지

- 실제 secret, token, password, private key와 connection string commit
- `.env` 파일, Railway variable dump와 credential 포함 command 출력 첨부
- secret을 prompt, issue, PR 본문, commit message, test snapshot과 fixture에 입력
- client bundle의 `NEXT_PUBLIC_*` 또는 유사 public 환경 변수에 secret 저장
- URL query, error message, screenshot, Playwright trace와 console log에 token 포함
- 실제 개인 기록, 회사 데이터 또는 비공개 원자료를 개발 fixture로 사용
- secret을 난독화·base64 encoding한 뒤 안전하다고 간주

### 필수 통제

- `.env.example`에는 변수명과 명백한 placeholder만 둔다.
- local `.env*`, test artifact, dump, coverage와 runtime data를 `.gitignore`한다.
- credential은 Railway/GitHub의 secret store 또는 OS credential store에서만 주입한다.
- CI와 배포 token은 environment·service 범위의 최소 권한과 짧은 수명을 우선한다.
- GitHub push 전과 CI에서 gitleaks 또는 동등한 scanner를 실행한다.
- GitHub Actions log와 공개 test artifact에는 synthetic data만 사용한다.
- dependency update와 lockfile 변경을 review하고 provenance와 vulnerability를 검사한다.
- secret 의심 값이 공개되면 commit 수정만 하지 않고 즉시 credential을 회수·회전한 뒤 history 노출을 평가한다.

공개 `/health`와 `/__status`는 secret이 없다는 사실을 검증하는 allowlist serializer를 사용한다. 범용 environment dump, error object serialization과 debug console을 연결하지 않는다.

## IS-001.9 URDR UI·인프라 재사용

URDR repository는 역사적 참고 자료로 보존한다. URDR의 기존 runtime, deployment와 database 내용은 Moirai를 위해 보존할 필요가 없다. 다만 삭제·재사용 전에 대상 resource가 URDR 전용이며 다른 프로젝트가 의존하지 않는지 확인한다.

### Atropos UI 계승 원칙

Atropos의 시각적 표현과 interaction은 URDR UI를 기본 reference implementation으로 삼는다. 새로 재해석하거나 비슷하게 다시 만드는 대신, 작업 시작 시 URDR의 대응 화면과 동작을 확인하고 관련 component, style, asset과 interaction 구현을 Moirai로 복사한 뒤 필요한 차이만 명시적으로 변경한다.

기본적으로 계승하는 범위는 다음과 같다.

- 전체 visual identity, 색·타이포그래피·간격·표면과 정보 밀도
- 화면 구조, navigation과 responsive/mobile 배치
- graph의 시각 문법, selection, pan·zoom, touch와 세부 feedback
- panel, sheet, tooltip, transition과 상태 변화의 interaction 감각
- 의미가 같은 icon, asset과 microcopy의 표현 방식

변경은 다음 근거 중 하나가 있을 때 수행한다.

- Moirai의 accepted 헌법, 요구사항 또는 기술 명세와 의미가 달라진 경우
- 사용자가 해당 시각·interaction 변경을 명시적으로 지시한 경우
- accessibility, mobile usability, 성능 또는 명백한 기존 결함을 개선하는 경우
- Next.js, JointJS와 Moirai의 현재 runtime 경계에 맞게 기술적으로 이식해야 하는 경우

명시적 근거 없이 URDR UI를 전면 재설계하거나 일반적인 placeholder UI로 대체하지 않는다. 반대로 URDR의 NestJS, Drizzle, Vite application architecture, data model, service contract와 runtime dependency는 복사하지 않는다. UI 코드를 크게 복사하는 slice는 self-review가 가능한 수준으로 URDR source path와 기준 commit을 구현 기록에 남기되, URDR를 제품 의미의 source of truth나 Moirai의 runtime dependency로 만들지 않는다.

### 인프라 재사용

역사 문서에서 확인된 재사용 후보는 다음과 같다.

- Railway workspace와 기존 project 운영 기반
- Railway Postgres resource
- GitHub 연동과 public domain 배포 경험
- pnpm monorepo, Vitest와 Playwright 운영 패턴
- healthcheck, structured logging과 synthetic verification 패턴

URDR의 NestJS, Drizzle, Vite application 구조, 데이터 모델과 배포된 sample data는 Moirai의 구현 기준이 아니다. Moirai는 TS-001의 Fastify, Kysely, Next.js와 분리된 API·worker·web 책임을 따른다.

### 재사용 절차

첫 infrastructure 작업은 다음 순서를 따른다.

1. URDR Railway project, service, database, domain, volume, bucket과 variable의 **이름과 연결 관계만** inventory한다.
2. 다른 repository·service 또는 개인 작업이 resource를 공유하지 않는지 확인한다.
3. 보존할 URDR repository와 폐기 가능한 runtime state를 명확히 구분한다.
4. 기존 credential과 write secret을 회수하고 Moirai용 최소 권한 credential로 회전한다.
5. URDR database 내용과 deployment artifact는 필요하면 삭제·초기화한다. 별도 콘텐츠 backup은 요구하지 않는다.
6. project와 service를 Moirai 이름으로 바꾸거나 새 service로 교체해 운영 중 혼동을 없앤다.
7. Moirai repository의 GitHub deployment source와 CI gate를 연결한다.
8. infrastructure mapping, public URL과 rollback 방법만 구현 기록에 남긴다. secret 값은 남기지 않는다.

삭제 또는 비용이 발생하는 새 resource 생성은 inventory 결과와 정확한 대상을 먼저 제시한다. URDR runtime 보존은 요구하지 않지만 같은 workspace의 다른 resource까지 포괄적으로 삭제하지 않는다.

### 목표 runtime 배치

Railway를 우선 후보로 사용하되 책임 경계를 유지한다.

| Service/resource | exposure |
|---|---|
| `lachesis-api` | 인증된 Clotho가 접근할 public TLS endpoint, 쓰기 권한 필수 |
| `lachesis-worker` | public domain 없음, private network 사용 |
| `atropos-web` | 완전 공개 |
| PostgreSQL | application private network만 사용 |
| Publication bucket | application credential로만 쓰고 public artifact 경로만 CDN으로 제공 |

Railway는 private S3-compatible [Storage Buckets](https://docs.railway.com/storage-buckets)와 service 단위 [CDN](https://docs.railway.com/networking/cdn)을 제공한다. 첫 Publication infrastructure spike에서 다음을 검증한 뒤 재사용 여부를 확정한다.

- 단일 object write와 pointer 교체의 TS-006 일관성 보장
- immutable JSON artifact의 cache header와 `ETag`
- Railway Bucket을 private origin으로 사용하면서 Atropos 또는 artifact service를 통해 공개하는 경로
- CDN의 JSON caching, `x-cache`, stale 동작과 purge 없이 versioned URL을 제공하는 방식
- 비용, region, backup과 전체 rebuild 절차

이 보장을 만족하지 못하면 Publication Store/CDN만 별도 S3-compatible provider로 확보한다. 기존 인프라 재사용을 위해 TS-006의 원자성과 공개 격리를 약화하지 않는다.

기존 `railway.toml`을 복사하지 않는다. Railway의 legacy Config as Code는 폐기 예정이므로 새 구성은 현재 [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code/reference) 또는 당시 지원되는 명시적 설정을 사용한다.

## IS-001.10 데이터와 환경 정책

개발 초기 public environment에는 합성 fixture만 사용한다.

- fixture는 작고 결정적이며 repository에서 생성 과정을 검토할 수 있어야 한다.
- graph, Canon 비교, 철회, projection 지연과 복구를 검증할 수 있는 사례를 포함한다.
- fixture ID는 안정적이어야 하며 공개 확인 URL을 반복 사용할 수 있어야 한다.
- test와 public environment의 fixture가 달라져 같은 버그를 재현하지 못하는 상황을 피한다.
- CI는 격리된 ephemeral PostgreSQL을 사용하고 shared deployed DB에 쓰지 않는다.
- preview environment는 production/integration database를 공유하지 않는다.

첫 제품의 공개 데이터도 비밀정보 관리 관점에서는 synthetic/public data로 취급한다. 개인화 로드맵이 활성화되기 전에는 실제 개인 일지나 회사 내부 데이터를 넣지 않는다.

## IS-001.11 migration과 운영 변경

- 모든 schema 변경은 versioned migration으로 수행한다.
- application startup이 무제한 자동 migration을 수행하게 두지 않는다.
- migration은 deploy 전 단계에서 한 번 실행하고 동시 실행을 방지한다.
- destructive migration은 영향, rollback 또는 forward repair와 data verification을 먼저 제시한다.
- application rollback과 database rollback을 같은 것으로 간주하지 않는다.
- Publication artifact는 정본에서 재생성 가능하므로 복구 가능한 cache로 다룬다.
- canonical database를 초기화할 수 있는 시기는 구현 계획에 명시한다. 실제 사용자 데이터가 들어간 뒤에는 URDR 폐기 권한을 Moirai 데이터에 확대 적용하지 않는다.

## IS-001.12 에이전트의 자율성과 중지 조건

승인된 구현 계획 안의 통상적인 code, test, commit, push와 development deployment는 에이전트가 끝까지 수행한다. 사용자가 모바일에서 terminal 작업을 대신하도록 넘기지 않는다.

다음 경우에는 추정해서 진행하지 않고 대상을 설명한 뒤 사용자 결정을 요청한다.

- 승인된 요구사항이나 기술 명세의 의미를 바꿔야 하는 경우
- roadmap 기능을 현재 scope로 끌어와야 하는 경우
- URDR 외의 데이터 또는 공유 infrastructure를 삭제할 가능성이 있는 경우
- 새로운 유료 provider, 큰 비용 또는 장기 lock-in이 생기는 경우
- 실제 credential의 재발급·권한 확대가 필요한 경우
- canonical data를 복구하기 어렵게 삭제·변환하는 경우
- 보안 모델이나 공개범위에 관한 선택이 필요한 경우

일시적인 tool 실패, test failure와 배포 오류는 먼저 안전하게 진단하고 고친다. 실패한 상태를 성공으로 보고하지 않는다.

## IS-001.13 완료의 정의

구현 단위는 다음 조건을 만족해야 완료다.

1. 관련 문서 ID와 의도한 동작이 명확하다.
2. scope 밖의 미래 기능이 들어가지 않았다.
3. diff self-review가 끝났다.
4. 관련 static, unit, integration, E2E와 security gate가 통과했다.
5. migration과 rollback 영향이 확인됐다.
6. public cloud surface에 배포됐다.
7. `/health`, `/__status`와 synthetic smoke test가 배포된 commit을 확인했다.
8. 모바일에서 열 수 있는 URL과 한 화면의 증거 요약이 제공됐다.
9. secret, private data와 내부 diagnostic이 public repository·artifact·surface에 없음을 확인했다.
10. 알려진 위험과 다음 단계가 기록됐다.

문서만 변경하는 작업처럼 runtime 결과가 없는 경우에는 배포를 강제하지 않는다. 이때는 링크·ID·trace·format 검사와 public GitHub commit을 관측 가능한 결과로 삼는다.
