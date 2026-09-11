# M4.5-H native graph viewport 결정 기록

날짜: 2026-09-11

## 결정

- `/graph`의 기본 입력은 현재 ready Publication directory에서 첫 graph-compatible Time System frame과 그 frame에 호환되는 World들을 사용한다. 이는 UI 시작점일 뿐 Canon authority/default 의미가 아니다. 선택한 World의 active peer Canon은 모두 동등하게 query한다.
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

- PR #45 merge `e6c3465eaca4e57250d3b8dd9103c34758726c25`; PR CI `34621836053`, main CI `34622070825` success
- production에서 발견한 immutable v1/v2 temporal Relation ownership은 PR #46에서 read boundary adapter로 정규화했고 `/graph` 500을 복구했다.
- PR #47은 기본 UI source와 명시적 R1 acceptance query를 smoke에서 분리했다. 최종 runtime `14d6d2cd7f1f8e61d96a676231ad46ecae640bd4`, main CI `34625338440`, post-deploy smoke `34625557923`가 success다.
- unit 29 files / 150 tests, strict typecheck, ESLint, architecture boundary, PostgreSQL integration, production build
- local Publication SSR에서 native viewport marker, Revision 2와 실제 Event 확인
- CI mobile WebKit: native viewport → Entities search → selection sheet → World Event stable route, focused URL reload, Relations와 accessible fallback
- post-deploy smoke: exact SHA readiness, production `/graph` native marker, 명시적 `/graph/query` Revision 4 A/B/shared R1 Relation identity 각각 1회
- production Clotho read: World current/target/served Revision 4, A/B membership, shared influences와 K1 causes/K2 prevents 유지
- Railway production deployment: Atropos `03de2924-90a6-459a-a61d-008ca1ad0003`, Clotho `867f674d-1750-4db8-b965-ae8cf95c267b`, worker `f4ba68b9-697a-4a08-b3e7-bb4cd4fc1412`, 모두 최종 runtime SHA에서 success

Railway connector는 direct SQL을 제공하지 않아 이 closeout에서 production 전체 orphan aggregate를
재실행하지는 못했다. H와 두 stabilization PR은 persistence write/migration을 포함하지 않는다.
기존 migration acceptance의 orphan/cross-World/duplicate 0 증거를 보존하며, 최종 PostgreSQL CI와
Clotho Revision 4 bounded read에서 Event 2·Relation 3의 membership, shared identity 단일 반환과
warning/truncation 0을 재확인했다.

M5 lifecycle, portability, governance/access 구현은 활성화하지 않는다.
