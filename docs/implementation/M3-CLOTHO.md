# Milestone 3 — Clotho 최소 작성

계약: CON-002·004·005, BR-001·002·005, TS-001·002·003·004·008, IP-001.7. RM-001은 World·actor·인증 경계 호환성만 점검한다.

## Observable outcome

새 세션이 World ID에서 Canon과 Event 맥락을 조회하고, 검증한 Change Plan을 인증된 Lachesis API에 commit한 뒤 Atropos에서 새 Revision을 확인한다. CLI는 JSON stdin/stdout을 사용하고 credential은 환경에서만 읽는다. 서버가 actor를 인증 정보에서 결정하며 validate 결과는 쓰기 권한이 아니다. 성공한 내용은 자동 공개 대상이다.

## Scope and exclusions

- world.list/get, canon.list/get, event.search/get/neighbors, context.slice
- change.validate/commit, expected Revision과 idempotency recovery
- 제한·pagination·Revision pinning, origin 요약과 field-level 연결
- 회수 가능한 bearer credential의 read/write scope 분리, body·credential 비기록
- 제외: graph, Subject·Timeline, update/withdraw/restore, import/export, 인간 관리 UI·OIDC 로그인, Tenant·ACL·private Publication

## Verification

Unit/schema: 잘못된 입력, 인증·권한, 제한·cursor·scope·잘림, token 비노출. PostgreSQL integration: validate 무저장, commit 재검증, 충돌 후 재조회, 같은 요청 replay, origin 연결. Synthetic E2E: CLI→실제 HTTP API→PostgreSQL→worker→Publication→공개 Event. 기존 모바일 WebKit·build·audit·gitleaks와 post-deploy smoke를 유지한다.

## Deployment and rollback

기존 Moirai API·worker·web·Postgres·Bucket만 사용한다. 사용자는 Lachesis의 인증 필수 HTTPS endpoint와 read/write credential 신규 발급을 승인했다. Credential은 API와 승인된 Clotho 실행 환경의 secret store에만 배치하고 Atropos에는 제공하지 않는다. 인증 구성 전 작성 경로는 fail-closed다.

실패 시 API endpoint를 닫거나 credential을 회수하고 이전 정상 application commit으로 복귀한다. additive migration과 정본 Revision은 유지한다. 새로운 세계 내용은 삭제하거나 Revision을 되감지 않는다.

## Provisioning boundary

- API: `https://desirable-vitality-production-eb95.up.railway.app`; 기존 `desirable-vitality` 서비스, readiness `/health/ready`.
- Railway API의 `CLOTHO_CREDENTIALS_JSON`에는 SHA-256 token hash, 내부 actor ID, scopes, 허용 World ID, 만료 시각만 저장한다. 원문은 GitHub Actions `CLOTHO_TOKEN` secret에만 저장한다. 30일 만료이며 회전 시 새 token을 발급하고 이전 hash를 제거한 뒤 API를 재배포한다.
- 범위: `world:read`, `world:write`, World `01995c2a-7b00-7000-8000-000000000101` 하나. 기존 Lantern fixture에는 쓰기 권한이 없다. Atropos와 worker에는 이 credential을 전달하지 않는다.
- post-deploy workflow가 CLI subprocess로 이 World를 재발견하고 build별 Event·Relation·Narrative를 추가한 뒤 공개 페이지와 revision JSON을 검증한다. 기존 M2 smoke는 그대로 유지한다.
- 일반 대화 세션에는 token을 복사하지 않는다. 별도 실행 환경에서 쓰려면 승인된 secret injection 연결이 필요하다. 저장소 skill·CLI가 있다고 모든 ChatGPT 세션이 자동 인증되는 것은 아니다.

## Verified outcome

`894e9030ebb38e2fed326beea74139bbbf346836`에서 CI `33488232165`와 post-deploy smoke `33488357469`가 성공했다. PostgreSQL 통합 10개와 unit 26개, mobile WebKit을 통과했다. 실제 CLI가 synthetic World 생성과 맥락 조회, validate 무변경, commit 및 idempotent replay를 실행했고, worker가 내보낸 새 Event·Narrative·Relation을 공개 Atropos와 revision JSON에서 확인했다. 기존 Lantern Revision 2도 유지된다.

저장소 전체 이력과 공개 `.next/static` artifact의 gitleaks 검사는 통과했다. Next.js 서버 내부의 생성 키는 비공개 build metadata이며 commit이나 공개 static artifact에 포함하지 않는다. 실제 기기와 production rollback 실연은 미검증이다.
