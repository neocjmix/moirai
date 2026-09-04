# M3-C 동일 토큰 긴급 차단 시험

대상은 Auth0 자체가 아니라 **Clotho가 OIDC 설정 제거 후 이미 발급된 유효 토큰을 거절하는지**다. 실제 검증 결과는 [M3-C 검증 기록](M3-C-VERIFICATION.md), 현재 상태는 [CURRENT](CURRENT.md)를 따른다.

## 준비한 도구

[`scripts/clotho-oidc-drill.ts`](../../scripts/clotho-oidc-drill.ts)는 기존 API 주소와 synthetic World `01995c2a-7b00-7000-8000-000000000101`에 고정된 운영 검증 도구다. application 실행 경로에는 추가되지 않는다. 인증 설정을 변경하거나 canonical write를 실행하지 않는다.

승인된 실행 환경에서 유효한 Auth0 access token을 `CLOTHO_OAUTH_TOKEN`으로 안전하게 주입한 뒤 다음 명령을 실행한다. 토큰을 명령 인자·채팅·로그·저장소에 넣지 않는다.

```sh
pnpm exec tsx scripts/clotho-oidc-drill.ts
```

도구는 주입 값을 한 번 읽고 환경 변수에서 제거하며, refresh 없이 같은 값을 메모리에 유지한다. stdin으로 단계 이름을 전달한다. 서버 응답 본문과 토큰·subject는 출력하지 않고 phase·HTTP 상태·revision 등 제한된 결과만 출력한다.

| 입력       | 필요한 서버 상태                 | 성공 증거                                                       |
| ---------- | -------------------------------- | --------------------------------------------------------------- |
| `baseline` | 원본 OIDC 설정 활성              | metadata 200과 고정 World 읽기 200                              |
| `blocked`  | OIDC 설정 제거 배포 완료         | metadata 503 `oauth_not_configured`와 **동일 토큰의 HTTP 401**  |
| `restored` | 원본 OIDC 설정 복원 배포 완료    | metadata 200과 **동일 토큰의 World 읽기 200**, `complete: true` |
| `quit`     | 운영자가 복원 상태를 별도로 확인 | 시험 프로세스 종료; 성공 판정 아님                              |

각 HTTP 요청은 10초 제한이며 redirect를 따라가지 않는다. 응답 뒤에도 토큰의 남은 수명을 검사한다. 2분 미만이면 만료와 긴급 차단을 혼동하지 않도록 증거 수집을 거절한다. 임의 200·MCP 오류·다른 World 응답은 성공이 아니다. 실패한 단계는 상태를 전진시키지 않는다.

**설정 복원은 운영자의 책임이다.** 도구 종료, 네트워크 실패, 토큰 만료, 실행 환경 손실 시에도 Clotho 원본 OIDC 설정을 먼저 복원한다. 새 토큰이나 새 프로세스를 사용하면 전체 시험을 baseline부터 다시 시작한다. 세 단계가 모두 끝나기 전에는 긴급 차단 완료로 기록하지 않는다.

## 운영자 실행 전 체크리스트

- Clotho와 Atropos가 정상이고 synthetic World의 current/target/served revision을 기록한다.
- Railway의 **Clotho API 서비스 하나**와 `CLOTHO_OIDC_JSON` 변수 하나를 정확히 식별한다. 인접 서비스·변수는 변경하지 않는다.
- 현재 OIDC 설정값을 Railway 변경 이력 또는 승인된 secret store에서 복구할 수 있는지 확인한다. 값을 채팅, 셸 기록, 문서, 스크린샷에 복사하지 않는다.
- 시험 중 배포를 지켜보며 즉시 복원할 운영자 한 명을 확보한다. 무인 실행하지 않는다.
- 최소 5분 이상 유효한 `world:read` 토큰을 준비한다. CI bearer token이나 다른 앱의 token으로 대체하지 않는다.
- 토큰·issuer·client ID·subject·OIDC JSON을 public evidence에 남기지 않는다.

하나라도 충족되지 않으면 OIDC 설정을 제거하지 않는다.

## 실행 절차

1. 아래의 등록된 시험 앱을 사용해 단기 토큰을 발급한다. 새 앱을 중복 생성하거나 refresh token을 요청하지 않는다.
2. 토큰을 명령 인자나 셸 history가 아닌 승인된 secret injection 경로로 `CLOTHO_OAUTH_TOKEN`에 주입한다.
3. `pnpm exec tsx scripts/clotho-oidc-drill.ts`를 실행하고 `ready` 출력을 확인한다.
4. `baseline`을 입력한다. metadata 200, MCP 200, 올바른 World ID와 revision이 모두 확인되지 않으면 중단한다.
5. Railway에서 Clotho API의 `CLOTHO_OIDC_JSON` **하나만** 제거하고 배포한다. Active가 될 때까지 기다린다.
6. 같은 프로세스에 `blocked`를 입력한다. metadata 503 `oauth_not_configured`와 MCP HTTP 401이 함께 나와야 한다. 토큰 만료·timeout·자동 재인증은 성공이 아니다.
7. 성공 여부와 관계없이 즉시 원본 `CLOTHO_OIDC_JSON`을 같은 서비스에 복원하고 배포한다. Active와 readiness 200을 확인한다.
8. 같은 프로세스에 `restored`를 입력한다. metadata 200, MCP 200, 같은 World와 `complete: true`를 확인한다.
9. Atropos의 current revision과 기존 공개 Event·Narrative·Relation이 유지되는지 확인한다. 이 시험은 canonical write를 만들지 않아야 한다.
10. 아래 증거만 문서에 기록한다. 시험을 더 하지 않는다면 임시 시험 앱만 삭제하고 기존 ChatGPT 앱과 CI bearer credential은 유지한다.

`blocked` 전후 어느 단계에서든 도구가 실패하거나 운영 연결이 끊기면 판정을 보류하고 7번 복원부터 수행한다. 설정 복원과 readiness 확인 전에는 세션을 종료하지 않는다.

## 기록할 증거

| 항목 | 기록 값 |
| --- | --- |
| 시험 시각 | UTC 또는 KST와 timezone |
| 대상 | Clotho Synthetic Observatory / 고정 World ID |
| baseline | metadata 상태, MCP 상태, revision |
| 차단 배포 | Railway deployment ID와 Active 시각 |
| blocked | metadata 503, MCP 401, `same_token: true` |
| 복원 배포 | Railway deployment ID와 Active 시각 |
| restored | metadata 200, MCP 200, revision, `complete: true` |
| 공개 상태 | Atropos current revision과 projection ready 여부 |

응답 본문, Authorization header, token claim, provider 식별자와 설정값은 기록하지 않는다. 세 단계와 복원을 모두 확인한 경우에만 `긴급 차단 live 검증 완료`로 판정한다.

## 토큰 확보

별도 시험 앱 `Moirai M3-C Emergency Verification`은 Native·Device Code 전용이며, API user-delegated scope는 `world:read` 하나다. 기존 운영자 Database 연결만 켜고 refresh token과 client credentials는 사용하지 않는다. 실제 client ID·issuer·subject는 Auth0/Railway 설정에만 보관하고 문서에 복사하지 않는다.

Device Authorization Flow는 callback 서버 없이 운영자 로그인을 받을 수 있어 이번 시험에 사용한다. 기존 ChatGPT의 authorization-code + PKCE 경로와는 별도다. 관리자 GitHub 로그인과 Moirai 운영자 로그인도 구분한다.

1. 등록된 시험 앱을 재사용한다. 새 앱을 중복 생성하지 않는다.
2. 해당 issuer의 `/oauth/device/code`에 시험 client ID, 기존 Moirai API audience, `openid world:read`를 제출한다. device code는 격리된 프로세스 메모리에만 보관한다.
3. 제공된 기기 승인 화면에서 운영자가 안전하게 로그인한다. `/oauth/token` polling은 provider의 interval·slow_down·만료를 존중하고 시간 제한을 둔다. 토큰을 공개 출력하지 않는다.
4. 받은 access token을 보안 실행 경로로 도구에 주입한다. baseline이 성공하기 전에는 OIDC 설정을 제거하지 않는다.
5. 원본 설정을 안전하게 확보하고, 위 세 단계를 같은 프로세스·같은 유효 토큰으로 수행한다. 원본 설정 복원과 정상 조회를 확인한다.
6. 증거를 기록하고 이 시험 앱의 grant·연결 또는 앱 자체를 정리한다. 기존 ChatGPT 앱과 기존 CI bearer credential은 별도다.

현재까지 시험 앱 등록·설정과 Device Authorization 시작은 확인했다. 운영자 로그인 완료와 토큰 수신, 실제 세 단계 응답은 미확인이다.

근거: [Auth0 Device Authorization Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/device-authorization-flow), [공식 API 호출 절차](https://auth0.com/docs/get-started/authentication-and-authorization-flow/device-authorization-flow/call-your-api-using-the-device-authorization-flow).
