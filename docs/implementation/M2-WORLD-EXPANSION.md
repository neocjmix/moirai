# Milestone 2 world expansion

상위 계약: CON-003, CON-004, CON-005, CON-007, BR-002, BR-003, BR-004, BR-005, JRN-001, JRN-002, JRN-005, TS-002, TS-003, TS-004의 임시 참조·오류 계약, TS-005의 검색 파생 경계, TS-006, TS-008, IP-001 Milestone 2.

## Observable outcome

고정 합성 World의 기존 Revision 1에 하나의 Change Set으로 Time System, Canon 연결, 시간 배치된 복수 Event, 인과·구조 Relation과 Canon·Event Narrative를 추가한다. 같은 Change Set의 뒤 Operation은 `client_ref`로 앞서 만든 레코드를 참조할 수 있다. 모바일 독자는 Event detail에서 Narrative, 시간 배치와 양방향 주변 Relation을 따라가고, World 범위의 공개 검색 document에서 해당 Event를 찾는다.

## Excluded

- Subject·Process·State·Duration·Timeline projection과 Canon 비교
- JointJS graph, 범용 편집 UI와 Clotho executable client
- update·withdraw·restore와 import/export
- 다중 actor, OIDC, Tenant·ACL과 private Publication
- 정본 데이터와 무관한 Atropos 전면 재설계

`IP-001`의 “World·Canon·Event Narrative” 표현은 상위 계약인 `BR-004.10`과 `TS-002.9`의 Narrative scope(`canon` 또는 `event`)를 확장하지 않는다. 이번 slice는 World의 기존 `description`을 World 진입 prose로 유지하고 Canon·Event Narrative를 정식 Narrative 레코드로 구현한다. 별도의 `world` Narrative scope를 만들지 않는다.

## Verification

- domain/contract: client reference 해석, Relation registry, Time System 좌표, Canon 경계, dangling reference, stable validation error와 warning
- PostgreSQL integration: 복수 Operation 원자성, 동일 base Revision 충돌, 동일 digest timeout retry, Revision·outbox 단일 transaction, 지정 Revision 재생
- projection: Narrative·Relation·시간 배치·검색 allowlist, 결정적 artifact, actor·origin·validation detail 누출 방지
- Playwright: 모바일 World → Canon → Event 주변 맥락 탐색과 공개 검색
- production build, dependency audit, gitleaks
- deployed Revision 2 fixture → worker → immutable Snapshot → public route post-deploy smoke

## Rollback unit

API, worker와 web process는 같은 application commit의 이전 정상 deployment로 각각 되돌린다. additive Milestone 2 migration은 유지하고 application rollback이 World Revision을 되돌리지 않는다. 새 정본 내용은 삭제하거나 Revision을 되감지 않으며 필요하면 이후 compensating Change Set으로 정정한다. Publication은 검증된 이전 immutable Revision pointer로 조건부 전환할 수 있다.

## URDR UI inheritance

기존 Atropos shell과 mobile detail sheet는 URDR commit `0267c8fd081ca9a3cd556f8f7319c600248c3760`의 `urdr/apps/web/src/App.tsx`, `app-shell.module.css`, `components/graph-shell.module.css`에서 이어받은 구현을 유지한다. 이번 slice의 Narrative·Relation·시간·검색 표면은 같은 rounded sheet, compact island, warm canvas와 touch-first expansion 문법을 확장하며, Moirai의 Snapshot·Canon·접근성 계약 때문에 필요한 정보만 추가한다.
