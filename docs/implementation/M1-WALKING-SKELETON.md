# Milestone 1 walking skeleton

상위 계약: CON-002, CON-003, CON-005, BR-002, BR-003, BR-007, TS-001, TS-002, TS-003, TS-006, TS-008, IP-001 Milestone 1.

## Observable outcome

고정 합성 fixture의 World, Canon, Event를 하나의 typed Change Set으로 생성한다. PostgreSQL commit은 World Revision을 정확히 한 번 증가시키고 같은 transaction에 Publication outbox를 남긴다. Worker는 지정된 Revision view만 읽어 불변 Snapshot을 만든 뒤 더 최신 pointer를 되돌리지 않는 조건으로 `current.json`을 교체한다. 모바일 독자는 안정적인 World, Canon, Event URL에서 같은 served Revision의 내용을 읽고 `/__status`에서 current, target, served Revision과 smoke 결과를 확인한다.

## Excluded

- Relation, Narrative, Time System과 파생 Subject·Timeline
- 일반 사용자 편집, Clotho 도구와 공개 write endpoint
- 정정·철회·복구, import/export
- JointJS graph, 검색과 Canon 비교
- 다중 actor, OIDC와 권한 workflow

## Verification

- domain/contract: operation 순서, opaque UUIDv7, allowlist Snapshot
- PostgreSQL integration: all-or-nothing, conflict, digest idempotency, Revision·outbox 동일 transaction, 지정 Revision read
- projection: retry idempotency와 stale pointer rollback 거부
- Playwright: 모바일 World → Canon → Event 탐색과 served Revision
- production build, dependency audit, gitleaks
- deployed synthetic commit → worker → public route smoke

## Rollback unit

API, worker와 web process는 같은 application commit 단위로 각각 이전 배포를 재배포한다. additive Milestone 1 migration은 롤백 중 유지하며 application rollback이 World Revision을 되돌리지 않는다. Publication pointer는 검증된 이전 immutable Revision으로 조건부 교체할 수 있고, 정본 내용 오류는 후속 compensating Change Set으로만 고친다.

## URDR UI inheritance

Atropos shell의 warm canvas, compact status island, rounded surface, mobile detail sheet와 짧은 easing은 URDR `urdr/apps/web/src/App.tsx`, `app-shell.module.css`, `components/graph-shell.module.css`를 기준으로 옮긴다. 기준 commit은 `0267c8fd081ca9a3cd556f8f7319c600248c3760`이다. Moirai의 World·Canon 비우열, Snapshot-only 읽기와 server-rendered stable route 계약에 맞게 정보 구조와 구현 framework만 변경하며 URDR runtime 또는 data model에 의존하지 않는다.
