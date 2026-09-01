# M3 연결 확장 — OIDC·Clotho MCP

계약: CON-002·004·005, BR-001, TS-001·004·008, IS-001. 사용자는 기존 synthetic World 하나의 읽기·쓰기로 제한한 외부 OIDC·MCP 연결을 승인했다. RM-001은 외부 subject와 내부 actor를 분리하는 호환성 점검에만 사용한다.

## Observable outcome

ChatGPT가 외부 인증 후 MCP로 World 맥락을 읽고 기존 Change Plan 계약을 호출한다. 성공한 commit은 자동 공개 대상이며 synthetic/public 데이터만 쓴다. CI credential을 대화로 복사하지 않는다.

## Scope and exclusions

- 기존 Lachesis API에 stateless Streamable HTTP MCP adapter, 10개 M3 도구와 기존 JSON schema 노출.
- 외부 authorization server의 OAuth discovery, resource audience와 JWT 검증. 비밀번호·로그인 세션·자체 token 발급 서버는 만들지 않는다.
- 명시된 issuer와 subject를 별도의 내부 actor에 매핑하며, World `01995c2a-7b00-7000-8000-000000000101`만 허용한다. token scope와 승인된 `world:read`·`world:write`의 교집합을 적용한다.
- 제외: 신규 World 권한, admin/export, 관리 UI, Tenant·ACL, 실제 개인·회사 데이터, M4 제품 기능, 승인 없는 유료 provider.

## Verification and rollout

인증 누락·만료·잘못된 issuer/audience/signature/subject, scope 및 World 초과, Origin·body limit, MCP schema와 안전한 오류를 자동 검증한다. 기존 CI·Publication smoke와 bearer CLI는 유지한다. 외부 issuer 미설정 시 OAuth 경로는 fail-closed다.

기존 Railway API에 배포한다. 실제 provider의 OAuth client 등록, PKCE S256, API audience·scope, 허용 operator subject와 ChatGPT 연결은 별도 live 검증이 필요하다. provider 계정·설정이 없으면 연결 완료로 보고하지 않는다.

## Provider provisioning contract

- API-only `CLOTHO_OIDC_JSON`: `issuer`, `jwks_uri`, `resource`, `operator_subject`, `actor_id` 다섯 필드. subject는 운영자의 인증 설정에만 보관하고 정본 actor와 분리한다. JSON·credential을 채팅이나 저장소에 붙이지 않는다.
- `resource`는 API의 HTTPS `/mcp` URL과 정확히 일치한다. issuer와 JWKS는 같은 HTTPS origin이어야 한다. access token은 RS256 또는 ES256, 해당 issuer·audience, `sub`, `iat`, `exp`, 공백 구분 `scope`가 필요하다. 최대 수명 1시간이며 `nbf`도 검증한다. ID token이나 다른 API의 token을 재사용하지 않는다.
- 외부 provider가 authorization-code + PKCE S256, resource audience, OAuth discovery, CIMD/DCR 또는 명시적인 ChatGPT client 등록을 제공해야 한다. 이 기능을 갖춘 provider 설정은 아직 확보하지 않았다. provider 선택과 실제 계정 연결 전에는 로그인 완료가 아니다.
- `/mcp`는 인증 전 401이며 OIDC 설정 후 resource metadata challenge를 제공한다. metadata에는 issuer·resource·scope만 허용한다. subject, actor, JWKS 설정과 credential은 노출하지 않는다.
- 기존 GitHub Actions bearer는 CI에서 MCP 경로도 검증한다. 이는 ChatGPT OAuth 인증 검증이 아니다. post-deploy smoke는 MCP initialize/list/read/validate/new commit, CLI·MCP idempotent replay와 실제 Publication을 확인한다.
- token 회수는 provider의 짧은 token 수명과 설정 제거를 사용한다. 긴급 차단은 API의 OIDC 설정 제거 후 재배포한다. 제거한 provider의 이미 발급된 token도 더 이상 허용하지 않는다.
- transport는 세션 없는 POST와 JSON 응답만 사용한다. GET SSE·DELETE session은 405, batch는 400, cross-origin 브라우저 요청은 403이다. request 1MiB, 결과 JSON 4MB, process별 동시 요청 32개 제한을 둔다. 응답에는 `no-store`를 적용한다.

설계 참고: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth), [MCP server](https://developers.openai.com/plugins/build/mcp-server). 공식 계약의 resource discovery, issuer/audience/scope 검증과 도구별 OAuth metadata를 따른다.

## Rollback

OIDC 설정 제거로 해당 issuer의 접근을 즉시 차단하고 API를 재배포한다. 기존 CI bearer credential은 독립적으로 유지한다. 필요하면 application을 `d6effa974ceed27ea849abec917836aa32fee04b`로 되돌린다. migration·정본 삭제·Revision 되감기는 없다.
