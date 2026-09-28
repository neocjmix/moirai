# 현재 구현 상태

2026-09-29 IP-012 implementation started: offline `compileV5RenderPublication` prototype and revision/digest-checked tile scene selection are implemented in graph-presentation with deterministic closure, relation and cross-tile tests. This is an isolated prototype, not integrated into served Publication or Atropos. Full hull semantics, LOD scale mapping, tile size/100k budget, cross-tile external geometry, A5 selection and runtime cutover remain open. The active A5 production path and A4 backlog are unchanged.

Prototype measurement: a 10k-point synthetic 100×100 grid compiled in 81ms locally, producing 85 tiles / 9.53MB total; its largest tile is 2.38MB. This exceeds the TS-006 initial viewport payload budget and rules out attaching the current naive all-points-at-every-level format to the served pointer. Next implementation slice must implement bounded level representations and verify pinned Collection selection before publication integration. This synthetic measurement is not an A4 production performance result.

Follow-up compiler prototype: dense coarse tiles now aggregate by exact Collection membership signature; finer tiles restore individual Event points. A local synthetic 100k/30-Collection uniform grid compiled in 5.1s into 1,365 tiles / 29.6MB total with a largest tile of 25.6KB (five Levels, 0–5). This is an offline synthetic size/compile measurement only. Collection filtering of clusters is exact for membership eligibility, while scene styling, HUD, zoom transitions, cross-tile hull externalization and production network/mobile performance are not yet verified. The existing 10k naive measurement above is historical evidence of the replaced prototype.

IP-012 hybrid geometry follow-up: large or many-tile Composite polygons are now emitted as revision-scoped immutable geometry documents with digest-checked tile references; small polygons remain inline. The code still produces standalone offline documents, without publication manifest/served pointer integration or Atropos tile consumption. Earlier notes about externalization being open describe the preceding prototype.

IP-012 staging checkpoint: an opt-in worker setting `LACHESIS_RENDER_PUBLICATION=shadow` compiles the Render Publication, checks finest-Level Event coverage and attaches its manifest/tiles/geometry to the existing verified v5 staging index before the normal atomic pointer swap. Default worker operation is unchanged. This is not yet enabled on production: direct tile serving, Atropos consumption, camera/LOD and mobile gates remain open. The preceding standalone-only note describes the previous checkpoint.

IP-012 read bridge: `POST /graph/v5/render` now exposes only manifest-listed, revision-pinned immutable render assets through the authenticated v5 root and staged digest index, with bounded batches and no-store responses. It returns 404 if the served revision has no render sidecar and 409 for a changed pointer. This route is not the ordinary Graph loader yet; CDN/direct immutable delivery, Atropos tile scene and real device gates remain pending.

IP-012 browser working-set checkpoint: an isolated `createV5RenderTileClient` fetches the manifest, XY tiles at current and neighboring Levels with spatial overscan, deduplicates primitives, filters Collection membership and resolves external geometry from bounded revision-pinned batches. Cache reuse across pan and Collection changes is tested. It is not yet wired to GraphShell; effective Level mapping, renderer scene, camera hot path, label policy and mobile acceptance are still open.

IP-012 transition checkpoint: `levelForCamera` now maps independent X/Y scales to a continuous semantic Level, and `interpolateRenderLevels` blends prepared adjacent representations with fade intervals. The isolated tile client exposes `loadFrame` with weighted renderer-neutral primitives. These are pure/runtime-library results, not a GraphShell cutover or frame-time acceptance result.

2026-09-29 planning update: [IP-012 Render Publication](IP-012-render-publication-plan.md) reconciles the handoff with current v5 code as a subsequent implementation baseline. No IP-012 runtime migration is active; A5 remains active, A4-B01–03 remain open, and A6/M5 remain inactive.

2026-09-28 역사 6개 선택 누락 수정: 운영 `75f5520`에서 1330–1460년 범위가 사건 3개·건국 과정만 반환되는 것을 재현했다(`truncated:true`). 꺼진 합성 후보를 거르는 도중 shell 16-page budget이 소진되고 client가 continuation을 받지 못했다. 요청당 budget은 유지하며 cursor를 전달하고 client가 동일 query/revision 안에서 끝까지 합친다. 취소·cursor 정체·중복 방어와 실제 mobile shell 회귀를 추가한다. 여러 응답에 걸친 relation 완전성은 별도 미달로 유지한다. A5 pin/자동 relevance보다 이 누락 수정을 우선한다.

2026-09-28 S2b/S3 후속: PR #251 `ec4b8d2`를 운영 배포했다. 공개 동일 viewport의 61 point/12 region ID·좌표·경로가 변경 전과 동일하며 Semantic primary target 4개, Geographic 69개를 확인했다. Enter 키 본문 열기도 성공했다. 이어 S3의 동일 viewport/Revision 요청 내부 batch 간 immutable object 재사용을 추가한다. 로컬 30-Collection fixture 전체 pagination의 store 호출은 326→242(중복 84 제거), 9/16/32/64 정확성·좌표·continuation 검증은 통과했다. 운영 latency/frame 개선이나 S3 전체 완료로 해석하지 않는다.

2026-09-28 16:19 KST: `103a30a`의 CI `36387835246`와 운영 smoke `36388167524` 성공을 확인했다. S2b에서 Event/Composite 통합 Semantic 예산과 종류 간 label 충돌 회피를 추가한다. 실험값은 viewport 면적/28,000, 최소 8·최대 32개이며 기존 suppression/label 자격 위에서만 적용한다. Geographic geometry/paint는 그대로 보존하고 이전 label 우선으로 흔들림을 줄인다. Semantic 대상 Enter/Space·focus 표시와 44px point target을 제공한다. 200% text 실측 및 S3 scale/누적 비용 검증은 아직 완료되지 않았다.

2026-09-28 15:36 KST: main `2fe083c`의 Clotho v5 계약 복구(#242)와 독립 인증 smoke(#246)를 A5 작업 브랜치에 back-merge했다. 충돌 없음, merge 직후 tree는 main과 동일. 8개 선택 상한 제거(#245/#247)의 main CI `36375218854`와 운영 모바일/인증 smoke `36375607244`는 성공했다. **다음 checkpoint S2a**는 A5에서 이름 없는 Geographic point/Composite의 primary hit target·접근성 노출을 제거한다. geometry와 paint/suppression, label 밀도 정책은 유지한다. S2 전체(독립 밀도·keyboard·200% text) 및 S3 성능 exit 완료는 아니다.

2026-09-28 12:40 KST 사용자 지시로 **8개 선택 제한 해제를 우선 진행**한다. 제목 상대 ranking은 PR #243으로 구현·배포됐고 합성 corpus 입력은 완료했다. v5 shell/viewport/search의 8개 입력 상한과 기본 선택 절단을 제거하며, 선택 판정은 8개 내부 batch의 동일 spatial page를 union한다. batch당 256 object read·shell 16 page·응답 byte budget을 유지한다. 총 요청 비용은 batch 수에 비례하므로 capacity/S2 표현·성능 완료로 보지 않는다. 9/16/30 Collection의 좌표 불변·공유 Event 중복 제거·continuation 진전을 검증하고 운영 모바일 30개 선택을 확인한다. 기존 selection 변경 시 loader/cache 교체와 catalog 첫 128개 제한은 후속 과제로 남는다.

2026-09-28 후속 corpus 입력 완료: 실행 36372949326 성공, World current/served/target **56**으로 일치. 합성 24 Collection·552 Event·1,008 Relation·576 Narrative 추가(전체 30 Collection·679 Event). 현재 개발 World에 직접 입력했으며 기존 역사 기록은 유지했다. 입력 중 열어둔 구 Revision 화면은 본문 409가 발생할 수 있어 완료 후 reload 검증했다. 12:21 KST 지시의 상대 ranking 단일 대표 선정(`a5-s1-v3`)을 배포했다.

2026-09-28 11:45 KST 후속: HUD 면적/fade 독립 선정과 현재 운영 World의 합성 corpus 직접 입력을 사용자 승인으로 진행한다. 24 Collection·552 Event·1,008 Relation 후보를 24개 bounded atomic batch로 검증한다. 출시 reset은 지금 수행하지 않으며 A6/M5는 비활성이다. 당시 기본 선택은 기존 query 제한에 맞게 최대 8개였다(아래 후속 제한 해제 작업으로 대체). corpus 추가 자체를 capacity 확대 완료로 보고하지 않는다.

**IP-011 A1–A3 완료; A4는 2026-09-28 사용자 승인으로 잔여 백로그를 이관하여 종료했다.** 원래 성능 exit 전체 통과를 뜻하지 않는다. A5는 2026-09-28 명시적 사용자 지시로 **구현 활성**이다. 계획 PR #237을 main `55cae82717af34d09683d04e4bd0a7df46c68aef`에 통합했다. [S0–S7 계획](IP-011-A5-collection-discovery-plan.md)에 따라 S0/S1 첫 checkpoint를 PR #238 `b09394c`로 운영 배포했다. main CI(모바일 32 pass/1 skip)와 공개 모바일 post-deploy smoke가 성공했다. 다음은 S2 표현·입력 분리이며, pin·자동 relevance·capacity 완료를 뜻하지 않는다. A4 scale의 구형 Island selector 실패와 sustained frame 미달도 보존한다. [실행 근거](../evidence/ip011/a5-execution.md)에 checkpoint와 미달을 기록한다. CI 실패는 숨기지 않고 배포 가능한 작은 checkpoint를 자주 운영에 노출한다. A6/M5·대량 역사 입력·canonical migration·새 유료 서비스는 비활성이다.

[종료 결정·후속 백로그](IP-011-A4-closeout-backlog.md)가 잔여 A4-B01(지속 frame), B02(region 계산), B03(실기기·메모리 증거)의 상태와 완료 조건을 소유한다. 기존 수치 기준·실패 기록·테스트는 유지한다. A5는 [Graph 중심 발견·이중 밀도 계획](IP-011-A5-collection-discovery-plan.md)을 따른다. 표현 capacity를 먼저 검증하고 contextual activation을 도입하며 tile/cluster는 조건부 실험이다.

종료 시 runtime main은 PR #235 `035cc069b00c0cc722c17f8b976b36c8738335ad`다. [main CI](https://github.com/neocjmix/moirai/actions/runs/36357907586)와 [배포 후 smoke](https://github.com/neocjmix/moirai/actions/runs/36358106084)가 성공했다. 최종 PR 후보 [scale](https://github.com/neocjmix/moirai/actions/runs/36357642646)는 기존 모바일 12개·worker 2개 성공, sustained 실패다. 30회 왕복에서 DOM 229·동일 복귀 geometry와 cache 상한은 유지됐으나 연속 frame p95 50/56/62ms는 33.4ms 예산을 넘었다. 성능 검증 완료로 보고하지 않는다.

2026-09-25 운영 World는 Revision 30→31의 v5 schema/content로 이전됐고 새 암호화 owner-full 백업·격리 복원·clone migration 재현을 통과했다. 인증된 v5 정책 기반 운영 쓰기와 동일 Change Set 재생으로 Revision 32가 됐으며 공개 완전 Publication 포인터는 v5 served/current/target 32다. 127 Event·6 Collection·415 Relation·133 Narrative가 보존됐다. API·worker·web은 v5로 동작하고 구형 v4 변경 경로는 404, 미인증 v5 commit은 401이다. v5 공개·인증 배포 smoke 36093424585와 운영 iPhone WebKit 미배치 Event·Collection·Composite 탐색이 통과해 A3의 아홉 시나리오를 충족했다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정한 PR #129가 main `814a577`에 병합되어 초기 authoritative baseline이 됐다. 당시 문서 개정 이후 A1·A2·A3 실행을 순서대로 완료했다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 전환 당시 배포 health SHA·policy route의 401·Live Revision 30을 확인했다. 당시 연결된 Live 도구 catalog는 새 method를 노출하지 않았으며, A3의 인증된 운영 v5 호출은 API action과 CI smoke로 확인했다. 2026-09-28 PR #242로 HTTP/MCP/CLI의 v5 13-method 계약을 복구하고 운영 배포·Live catalog 갱신·연결된 World 조회 성공을 확인했다. [Clotho 복구 근거](../evidence/ip011/clotho-v5-contract-repair.md)에 검증과 제한을 기록한다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

A2의 격리 clone은 별도 [A2 gate review](../evidence/ip011/a2-gate-review.md)에 기록한다. 운영 공개 UI는 `/graph/v5`와 검증된 포인터를 통해 v5를 읽으며 공간 요약은 125개 배치·2개 미배치를 반환한다. 인증된 v5 commit/replay는 임시로 제한한 운영 API action의 성공 로그로, 모바일 탐색은 post-deploy WebKit 실행으로 확인했다. A4의 측정·개선 이력은 [A4 실행](../evidence/ip011/a4-execution.md), 종료 후 미충족 항목은 [후속 백로그](IP-011-A4-closeout-backlog.md)를 따른다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
