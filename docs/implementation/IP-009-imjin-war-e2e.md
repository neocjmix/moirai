# IP-009 — 임진왜란 실제 역사 구축과 E2E

사용자 2026-09-22 지시에 따라 수행하는 독립 작업. M5 전체는 비활성.

## 계약과 첫 slice

CON-003/004, BR-002, TS-003/004/010을 따른다. 기존 World의 시대 범위를 넓히되 ID와 URL slug, Canon/Event identity, 과거 Revision을 보존한다.

v4 ChangePlan에 World metadata update를 추가한다. value는 world_id, 기존 slug, title, description이다. slug 변경은 거절하며 제목·설명만 교체한다. 기존 World 권한·Revision 충돌·idempotency·before/after·outbox·Publication 경로를 공유한다. schema migration이나 직접 DB 수정은 필요 없다.

검증: domain scope/slug 거절, persistence 이전 Revision·identity·history·idempotency·target 검증, MCP discovery 예산, typecheck/lint/기존 회귀 검사. GitHub PR/CI→main→Railway의 기존 세 서비스→Moirai Live readback으로 배포를 검증한다.

## 데이터 구축 순서

World metadata → Canon → 초기 침공/최상위 Composite → 수군 → 의병/명군/반격 → 강화교섭 → 정유재란 → 철수/노량. 각 slice는 기존 World 검색, 사료 검토, validate, commit, API readback을 거친다. Composite 생성은 contains와 같은 ChangePlan에 넣는다.

월일은 사료의 음력과 Gregorian 좌표를 혼동하지 않는다. 검증한 변환만 사용하고 출처의 원 날짜와 변환 근거를 metadata에 둔다. 임의의 전체 precedes chain을 만들지 않는다. 본문은 역사적 전개·맥락·결과를 설명하고 출처는 public_references, 날짜 해석은 annotation/attributes에 둔다.

## 종료 검증

atomic 중복, nested contains, 부분 순서, 병렬 전선, 공유 Event의 Canon별 Narrative를 확인한다. current/target/served 최신 Revision 및 ready, Atropos graph/drawer/직접 URL/모바일을 실제 확인한다. Event/Composite/Narrative/Relation 수와 사료, 수정 결함, 남은 한계를 evidence에 기록한다.

## 실제 구축에서 발견한 중첩 범위 결함

Revision 23의 임진왜란 최상위 Composite는 날짜가 있는 atomic 후손을 모두 포함하지만 `descendant_span`이 unresolved였다. 하위 Composite를 점 위치가 없는 후손으로 처리한 것이 원인이다. nonempty Composite의 contains closure를 순회해 그 후손의 범위를 사용한다. 빈 Composite 또는 날짜 없는 atomic 후손은 계속 unresolved이며, 이 계산은 실제 Duration이나 Composite의 점 위치를 생성하지 않는다. projection algorithm version을 2로 올린다.

실제 공개 데이터의 desktop/WebKit iPhone 14 E2E는 별도 `playwright.imjin-live.config.ts`로 실행한다. PR의 `feat/imjin-e2e`에서만 production read-only acceptance를 추가 실행하며 일반 fixture CI는 외부 데이터에 의존하지 않는다. merge·배포 후 같은 acceptance job을 다시 실행해 최종 Publication을 확인한다.
