# M4.5-H native graph viewport 결정 기록

날짜: 2026-09-11

## 결정

- `/graph`의 기본 입력은 현재 ready Publication directory에서 `graph-scope-observatory`를 우선 선택하고, 없으면 첫 ready World를 사용한다. 이는 UI 시작점일 뿐 Canon authority/default 의미가 아니다. 선택한 World의 active peer Canon은 모두 동등하게 query한다.
- server가 같은 immutable artifacts로 초기 `MoiraiGraphQueryResult` v3와 no-JavaScript fallback을 만들고, hydrated viewport는 동일 query를 `/graph/query`에 보낸다.
- Event node key와 Relation edge key는 각각 `(world_id, id)`다. multi-Canon membership은 node/edge 복제가 아니라 matched/all membership text로 표현한다.
- exact, bounded, relative-only, mixed, unplaced는 별도 temporal lane으로 둔다. 환산 근거가 없는 값을 공통 날짜 좌표로 만들지 않는다.
- Subject, Composite/Process, State, virtual Time Event, Narrative, evidence, algorithm version, completeness와 diagnostics는 native result에서 직접 읽는 Derived/Diagnostics surface로 둔다.
- zoom level은 overview 250, standard 1,000, full 2,500 Event budget의 새 server query를 발생시킨다. 100k 전체를 browser에서 CSS로 숨기는 방식은 사용하지 않는다.
- mobile pan, two-pointer pinch, wheel/button zoom, keyboard/touch selection, bottom inspector와 versioned URL focus를 native component가 소유한다.
- G의 temporary adapter를 제거하고 production App entry에서 `GraphShell`, mock loader와 `@urdr/*` runtime import를 끊는다. URDR source는 visual/interaction provenance 참고용으로만 남고 build marker 검사에서 production graph bundle에 포함되지 않는다.

## 근거

legacy shape를 production 입력으로 유지하면 virtual Time Event, derived evidence, R1 N:M membership과 World별 Revision vector를 필연적으로 축소한다. 초기 SSR과 hydrated query를 같은 v3 결과로 고정하고 renderer geometry만 local presentation state로 두면 canonical 의미가 viewport로 역류하지 않는다.

## 검증

- unit 29 files / 149 tests, strict typecheck, ESLint, architecture boundary, production build
- local Publication SSR에서 native viewport marker, Revision 2와 실제 Event 확인
- CI mobile WebKit: native viewport → Entities search → selection sheet → World Event stable route, focused URL reload, Relations와 accessible fallback
- post-deploy smoke: exact SHA readiness, production `/graph` native marker와 A/B, `/graph/query` Revision 4 A/B/shared R1 Relation identity 각각 1회
- production Clotho read: World current/target/served Revision 4, A/B membership, shared influences와 K1 causes/K2 prevents 유지

M5 lifecycle, portability, governance/access 구현은 활성화하지 않는다.
