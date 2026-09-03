# M3-C 실제 OAuth 연결 검증

검증 기간: 2026-09-02~03. 계약: CON-004, TS-004, TS-008, IS-001, IP-001 M3-C.
대상은 `Clotho Synthetic Observatory` (`01995c2a-7b00-7000-8000-000000000101`) 하나다. M4는 시작하지 않았다.

## 연결 복구

첫 MCP `world.get`은 401이었다. 공개 OAuth metadata 두 경로는 503 `oauth_not_configured`, 인증 없는 MCP 요청은 401 `Bearer`를 반환했다. Railway에서 Clotho API의 `CLOTHO_OIDC_JSON`이 없는 것을 확인했다. 2026-09-02 18:39 KST의 해당 변수 삭제·배포 이력이 있었다. 그 삭제의 의도나 당시 토큰의 유효성은 이 기록만으로 추정하지 않는다.

변경 이력의 기존 설정을 같은 Clotho 서비스에 복원했다. 복원 배포 `a89a8b70-eee9-4aed-94fe-874dfc13aff3`이 Active가 된 후 실제 ChatGPT MCP `world.get`, `world.list`, `canon.list`, `context.slice`, `event.search`, `change.validate`가 성공했다. provider 설정값·subject·토큰은 이 문서와 fixture에 포함하지 않는다.

검증한 application SHA는 `3a95df73b23902160b2892497d2fddb8a9042ffa`다. API health와 Atropos status가 일치했다. 해당 코드의 [CI 33612931903](https://github.com/neocjmix/moirai/actions/runs/33612931903)와 [bearer smoke 33613079035](https://github.com/neocjmix/moirai/actions/runs/33613079035)는 success였다. bearer smoke는 이 문서의 실제 OAuth 검증과 별도 근거다.

## 실제 MCP 작성과 Publication

| 항목               | 결과                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 최신 revision      | 기존 전달값 14 대신 MCP로 15를 확인. 09-03 작업 재개 시에도 15를 재조회                                             |
| 목록·맥락          | 허용 World 1개, Canon `Synthetic Signals` 1개. revision 15 고정 context에서 `truncated: true`와 continuation을 확인 |
| 중복 후보 검색     | `ChatGPT OAuth recovery signal` 검색 결과 0개                                                                       |
| validate           | `valid: true`, errors/warnings 없음. 재검증 digest 동일                                                             |
| validate 무저장    | validate 후 World revision 15, 신규 Event 검색 결과 0개 유지                                                        |
| commit             | Event·Relation·Narrative를 하나의 Change Set으로 반영, current/target 16, 최초 응답 served 15                       |
| 동일 요청 replay   | `idempotent_replay: true`, current/target 16 유지                                                                   |
| 동일 키·다른 내용  | intent만 바꾼 요청을 `idempotency_key_reused`, `retryable: false`로 거절                                            |
| 최종 재조회        | current/target/served 모두 16, projection ready, 검색 결과 신규 Event 정확히 1개                                    |
| 공개 반영          | Event HTML·revision 16 JSON 200, Narrative 1개·Relation 1개 확인                                                    |
| Publication 무결성 | manifest complete, Event SHA-256과 manifest digest 일치, ETag 존재                                                  |
| 공개 격리          | Event JSON에서 origin refs·actor·operator subject·credential hash 및 synthetic origin summary 부재 확인             |

Change Set: `019ee950-9000-7000-8000-000000000001`.
Event: `019ee950-9000-7000-8000-000000000002`.
Relation/Narrative ID는 같은 prefix의 `003`/`004`다.
Plan digest: `da664c8e4906e13a57ae03c0dac94668568cc912622db276400358a94eebadac`.

[정확한 synthetic Change Plan](evidence/m3-c-oauth-recovery-plan.json)을 보존한다. 09-02 검증에서 준비한 제목을 유지한 채 09-03에 commit했다. 이미 commit된 plan이므로 그대로 재호출하면 replay여야 한다. 새 쓰기를 만들 목적으로 ID나 expected revision을 임의 변경하지 않는다.

- [공개 Event](https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101/canons/01995c2a-7b00-7000-8000-000000000102/events/019ee950-9000-7000-8000-000000000002)
- [Revision 16 Event JSON](https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101/revisions/16/events/019ee950-9000-7000-8000-000000000002.json)
- [현재 Publication pointer](https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101/current.json)

## 권한 초과와 긴급 차단

실제 OAuth 연결로 허용 범위 밖의 검증용 World ID `019ee950-9000-7000-8000-000000000099`를 조회했으며, 서버 본문이 `forbidden`을 반환했다. adapter의 외부 `INVALID_ARGUMENT` 분류와 서버 권한 오류를 구분했다. 다른 World의 내용은 읽거나 쓰지 않았다.

OIDC·MCP·adapter 없는 Lachesis 인가 테스트 3개 파일, 15개 테스트가 통과했다. read-only scope의 commit 거절, admin/export scope 미승격, 고정 World 제한, 잘못된 signature/issuer/audience/subject·만료 거절, validate 후 인가 재검사, OIDC 미설정 fail-closed를 포함한다. 별도의 Auth0 read-only 토큰 발급·live write 거절은 수행하지 않았으며 이 항목의 근거는 자동 테스트다.

### 긴급 차단 live 시험의 한계

2026-09-03 정상 OAuth 읽기·쓰기 후, 복원할 원본 설정을 확보하고 Clotho의 OIDC 변수 하나만 제거했다. 차단 배포 `c0fc6c00-f4fc-4e67-9549-2a198772a780`이 Active가 됐으며 공개 metadata는 503 `oauth_not_configured`로 바뀌었다. Atropos revision 16과 정본 내용은 보존했다.

그 상태에서 실제 ChatGPT MCP `world.get`을 호출했으나 인증 처리에서 완료되지 않고 사용자 중단으로 끝났다. HTTP 거부 응답이나 동일한 유효 토큰의 전후 결과를 받지 못했으므로, 이 호출을 긴급 차단 성공으로 계산하지 않는다. 서버의 OIDC 미설정 상태와 자동 fail-closed 테스트는 확인됐지만 **기발급된 유효 Auth0 토큰의 live 거부 검증은 미완료**다.

원본 설정을 같은 서비스에 다시 저장하고 복원 배포를 시작했다. API 인증 차단 시험은 단일 토큰으로 시간 제한이 있는 요청을 실행할 수 있는 클라이언트에서 수행해야 한다. 자동 재인증이 개입하는 ChatGPT 호출을 무한 대기하거나, 설정이 제거된 상태로 작업을 종료하지 않는다. 토큰은 승인된 secret injection 경로에만 두고 대화나 public evidence에 복사하지 않는다.

### 복원 후 확인

2026-09-03 복원 배포 `c4eb2a7f-f60b-40e6-80a4-6c9a4e1d4790`의 Active / Deployment successful을 Railway에서 확인했다. 차단 배포는 Removed이며 OIDC 변수는 다시 존재한다. 공개 OAuth resource metadata는 200으로 resource·authorization servers 필드를 반환했고, `/health/ready`는 200·`status: ok`·기존 application SHA `3a95df73b23902160b2892497d2fddb8a9042ffa`를 반환했다. 설정이 제거된 상태로 종료하지 않았다.

복원 후 실제 MCP `world.get` 재조회는 25초 제한 내 결과를 받지 못했다. 서버 설정 복원은 확인했지만 이 마지막 호출을 OAuth 재연결 성공으로 계산하지 않는다. 앞선 revision 15→16 읽기·쓰기 성공 근거와 구분한다. 다음 최소 단계는 정상 OAuth 재연결 확인과, 안전하게 주입한 동일 유효 토큰을 사용하는 시간 제한 클라이언트로 긴급 차단의 실제 거부 응답을 확보하는 것이다. M3-C는 active로 유지하고 M4는 시작하지 않는다.

문서 변경에는 application 코드·의존성 변경이 없다. 관련 OIDC/MCP/Lachesis 15개 테스트, synthetic plan의 World·revision·operation 검사, 문서 내부 링크 검사, diff 공백 검사 및 공개 문서 secret scan을 통과했다.

### 후속 재연결·CI 확인 — 2026-09-03

실제 ChatGPT OAuth `world.get`이 다시 성공했다. 첫 재조회는 current/target/served 16·ready였고, 자동 bearer smoke 종료 후 재조회는 모두 17·ready였다. 이번 수동 검증에서는 신규 commit을 호출하지 않았다. revision 17은 같은 synthetic World를 대상으로 실행된 배포 smoke 이후 관측한 값이며, 기존 OAuth Change Set의 revision 16 근거를 대체하지 않는다.

문서 commit `5db28c89096fb2881e9f155dbb82e3fc52b9940d`의 [CI 33787348576](https://github.com/neocjmix/moirai/actions/runs/33787348576)와 [배포 smoke 33787516972](https://github.com/neocjmix/moirai/actions/runs/33787516972)가 success로 완료됐다. Atropos status와 Clotho readiness에서 해당 SHA를 확인했고, Railway Clotho 배포 `21a3e929-b9cd-4521-bb30-edaff466023a`가 Active였다. Lantern fixture는 revision 2·ready를 유지했다.

남은 긴급 차단 시험에는 동일한 유효 Auth0 access token을 차단 전·중·복원 후까지 유지하는 별도 요청 클라이언트가 필요하다. 현재 ChatGPT MCP 인터페이스는 인증을 내부 관리하며 token을 지정·내보내는 인터페이스를 제공하지 않는다. 실행 환경에도 시험용 Auth0 token이 주입되어 있지 않다. 기존 CI의 `CLOTHO_TOKEN`은 별도 bearer credential이라 OAuth 차단 증거로 사용할 수 없다.

이 조건에서 OIDC 설정을 다시 제거하지 않았다. 다음 준비 조건은 기존 운영자·같은 resource·World 범위의 authorization-code + PKCE 시험 클라이언트와 안전한 토큰 주입 경로다. 토큰을 채팅에 복사하거나 서버에서 인증 헤더를 수집하지 않는다. 이 준비 없이 긴급 차단 live 검증 완료를 주장하지 않으며 M3-C active·M4 미착수를 유지한다.

### 동일 토큰 시험 준비

별도 Native 앱 `Moirai M3-C Emergency Verification`을 등록했다. Device Code grant만 켜고 Implicit·Authorization Code·Refresh Token·Password·Client Credentials는 사용하지 않는다. 이 시험 앱의 기존 운영자 Database 연결만 유지하고 Google 연결을 껐다. Moirai API의 user-delegated grant는 `world:read` 하나로 제한했다. 기존 ChatGPT 앱과 API의 운영자·World 매핑은 변경하지 않았다.

Device Authorization 요청은 성공해 운영자 로그인 화면까지 진행했다. 그러나 보안 로그인 요청의 완료 결과를 받기 전에 실행 연결이 중단됐고, 이후에도 로그인 화면이 남아 있었다. 토큰 수신·정상 baseline·차단·복원 응답은 확보하지 못했다. 이 준비 과정에서 Clotho의 OIDC 설정을 제거하거나 배포하지 않았다. 시험 앱은 다음 검증을 위해 등록 상태로 남아 있으며 검증 종료 후 해당 앱만 정리한다.

[검증 도구와 재개 절차](M3-C-OIDC-DRILL.md)를 추가했다. 도구는 토큰을 한 번 주입받아 메모리에 유지하고 같은 synthetic World의 `world_get`만 호출한다. 단계별 metadata와 실제 HTTP 응답을 확인하며, 401 없이 metadata만 차단된 상태나 만료 직전 토큰을 성공으로 계산하지 않는다. 5개 테스트·root typecheck·해당 파일 lint가 통과했다. 도구 준비와 실제 환경 검증 완료를 구분하며 M3-C active·M4 미착수를 유지한다.
