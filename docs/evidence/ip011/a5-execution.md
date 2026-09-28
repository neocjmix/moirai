# IP-011 A5 execution

## Corpus completion and ranked representative — 2026-09-28

- [Corpus run 36372949326](https://github.com/neocjmix/moirai/actions/runs/36372949326) succeeded: 24 batches, Revision 32→56; current/served/target 56, projection ready. Added 24 Collections, 552 Events, 576 Narratives, 1,008 Relations. No existing records deleted. Browser confirmed new collection catalog, multiple overlays and readable Collection narrative after convergence. While publishing successive revisions, old open-page detail requests were rejected by the existing 409 revision guard; a fresh page succeeded. Automatic revision recovery remains a known limitation, not data loss.
- PR #241 `36a7255` main CI 36373356812 passed. Historical A3 subset remains exact; new mobile corpus assertions check 24 collections, 552 unique events, the same shared Event in 24 memberships and one rendered node/readable Narrative.
- User 12:21 KST instruction supersedes the S1-v1/v2 eligibility/no-topic rules. Policy v3 ranks all visible candidates: 0.55 normalized center proximity, 0.25 viewport-span fit (linear shapes use length, not area), 0.15 relative contains specificity, 0.05 support completeness, plus 0.04 prior-topic stability. Stable ID breaks exact ties. These are versioned initial weights, not validated optimal relevance. There is no minimum score. Partial support remains eligible. A prior still-visible topic stays during the 250ms switch dwell; first acquisition/replacement of an offscreen topic is immediate. Empty visible candidate set alone gives World-only.
- Fixed tests cover lone tiny/linear/partial candidates, unrelated ties/reversed order, 1/4/16 ancestors, a centered narrow shape against huge/remote shapes, stable versus decisively changed scores and narrow/point geometry metrics. Existing full-cover suppression test is preserved; incomplete-support expectation explicitly changes under the latest product decision. Rendering suppression/coordinates/camera and Collection activation are unchanged.
- Automatic corpus seeding on push is disabled after this successful one-shot import. Explicit workflow dispatch remains idempotent; unrelated future code edits do not mutate the World.
- Public readiness smoke also contained frozen global corpus counts. Updated expectations explicitly to 30 Collections, 679 unique Events, 677 placed, 2 unplaced and 841 memberships; separately preserve historical 127 unique Events/153 memberships and the shared historical Event's two memberships. Earlier readiness attempts during this transition must not be reported as passed.

## S1 feedback checkpoint — independent title and operational corpus

User feedback 2026-09-28 11:45 KST authorizes synthetic content directly in the existing development World, superseding the A5 read-only restriction for this corpus only. No schema migration/reset is performed. Corpus v1 adds 24 Collections, 552 Events (72 derived Composites), 576 Narratives and 1,008 Relations in 24 atomic batches. Fixed IDs, World-scoped duplicate search, policy identity check, candidate-state validation and readback prevent accidental duplication. New content is explicitly labeled A5 synthetic. Existing historical records are not deleted. The checked-in workflow uses the existing Clotho secret only for the normal v5 API boundary; no credential extraction or permission expansion.

HUD policy `a5-s1-v2` no longer gates on filled area, center containment or fade. Complete, visible candidates qualify; a sole most-specific candidate wins, otherwise a unique central candidate wins, otherwise a still-visible prior topic is retained, with World-only fallback for fresh ambiguity. First acquisition is immediate and subsequent change dwell remains 250ms. Graph paint/suppression and camera remain unchanged. A mobile fixture now switches full-cover to narrow geometry and checks the title remains while the shape is painted.

The existing first-page default selected every Collection despite the maximum-eight query contract. With this corpus that would cause invalid requests; default bootstrap is bounded to eight without claiming S3 capacity. Explicit selection and catalog remain available. Deployment, corpus Revision and CI results will be recorded after execution.

PR #240 deployed as `a2bbdf615dd9b63b87a066b4552f56e4a3bbeb51` (Railway `ae4226e5-3a1f-40bd-9a85-6f8f1d92fc0e`, SUCCESS); public status confirms this SHA. Browser observed existing `건국 과정` simultaneously in HUD and graph. Main mobile CI 36372949321 passed; corpus runner 36372949326 is executing. The A3 live test's historical exact 6/127/125 subset is now explicitly separated from synthetic additions; its historical membership/placed/unplaced assertions remain intact rather than freezing the whole World at six Collections.

## S0 registration — 2026-09-28, before implementation measurements

- Latest main and production web/API/worker: `8937cb4142215b439d4430e61b9db1ae15f218c8`. Planning #237 head `1cf9745bd278a31cc51ed43d0b10bcc91a902ed9`, CI 36368885368 succeeded; reviewed Markdown-only change, diff check, merged as `55cae82717af34d09683d04e4bd0a7df46c68aef`.
- Authoritative requirements: BR-003.12/14, JRN-004, TS-005.3, TS-006.6 and A5 S0–S7. A5 execution active; A6/M5, canonical migration and bulk authoring inactive.
- Fixed A4 reference: sustained p95 50/56/62ms versus 33.4ms, not a performance pass. Keep A4-B01–03 open. No performance improvement inferred from this UI slice.
- Register combined settled-navigation viewport+discovery cold budget: 1MiB / 256 artifact reads. S1 adds no discovery fetch. S5 must account for both requests and cancellation waste together.
- S1 policy v1: existing coverage fade 0.35→1 and 220ms paint exit unchanged. Topic requires complete hull support, viewport center inside polygon, coverage ≥0.35; retain existing topic down to 0.30. Prefer a contains descendant over its ancestor. Unrelated eligible topics are ambiguous (World only). Change dwell 250ms; a unique fully suppressed topic hands off immediately so its meaning never vanishes. No camera mutation.
- Fixed policy fixtures before outcome: no-topic→null; complete center full-cover→topic; partial hull→null; nested parent/child→child; unrelated equal cover→null; reordered candidates→same result; coverage boundary retention; 1/4/16 ancestors→most specific. Mobile fixture also covers flag on/off, drawer, all-off, camera persistence and keyboard dialog close/focus.
- S1 uses the existing catalog for the minimal Collection escape. Full catalog pagination/search beyond the initial 128 and intent persistence remain S4; this checkpoint must not be described as the completed escape hatch or discovery experience. The existing maximum 8 active selection remains until S3 measurement.
- Instrument on-demand through existing `moirai:graph-inspect`: policy version, candidate/selected HUD, semantic label/primary-target counts and geometric shape/vertex counts. No per-frame telemetry or production content writes.
- First checkpoint scope: SSR-resolved Island flag (default OFF for v5, explicit legacy rollback), container-free World/topic HUD and minimal Collection controls. Existing renderer, source selection, camera restore, drawer and suppression remain the baseline.

## Results

Local production build and strict web typecheck passed. Targeted context/geometry/loader/shell unit tests: 19 passed. Targeted ESLint and diff whitespace checks passed. [Main CI 36369948758](https://github.com/neocjmix/moirai/actions/runs/36369948758) passed quality, secret scan and mobile WebKit (32 passed, one pre-existing skip). S2–S7 are not complete.

### First production checkpoint

- Implementation PR #238 merged as `b09394c6989f895caf7e7d0086d9a953b6531732`. Railway web deployment `452246cb-0a81-4866-8567-b0a66866bccf`; public health/readiness/status confirmed this SHA. Served/current/target Publication remains Revision 32.
- [Post-deploy smoke 36370230458](https://github.com/neocjmix/moirai/actions/runs/36370230458) passed readiness, live mobile navigation and authenticated authoring/replay smoke. Manual public browser verified World HUD, retained six-Collection catalog, title search, all-off/re-enable, Collection narrative and linked Event narrative. Desktop screenshot is supplementary, not physical mobile evidence.
- New mobile fixtures verify full-cover suppression-to-HUD handoff, incomplete-support World-only fallback, Island rollback, modal controls/focus and viewport reload restoration. Pin, automatic relevance, first-visit curated context and >128 catalog completeness are not implemented or claimed.
- [IP-004 reader 36369937539](https://github.com/neocjmix/moirai/actions/runs/36369937539) passed 100/1k/10k.
- [A4 scale 36369937462](https://github.com/neocjmix/moirai/actions/runs/36369937462) failed mobile profiles: inspected dense and sustained logs wait for the removed default Island button (`소스 쿼리 열기`), producing measurement_error/collection_toggle_missing. Sustained additionally fails start/middle/return frame budgets. These failures remain recorded; this is not an A4 pass. Worker 10k passed; worker 100k was still running at inspection.
- Follow-up explicitly selects `discovery=legacy` in the five A4 Island-dependent profiling scripts to preserve their historical comparator. It does not relax timing budgets or make them A5 acceptance tests. A5 measurements must use the new controls. Do not block this deployed checkpoint on an unlimited A4 rerun.

### Next checkpoint

S2 separates Semantic primary interaction from Geographic geometry and removes invisible broad primary hit targets. Measure semantic/graphic density and mobile input before S3 multi-Collection capacity; only then proceed to S4 intent persistence and S5 automation. Existing 8-active/128-catalog limits, selection cache replacement and sustained frame deficit remain explicit. No bottleneck or 16-active success is inferred.

Rollback: `?discovery=legacy` (or `&discovery=legacy` on an existing query) restores the retained Island. Server default can be set with `ATROPOS_COLLECTION_DISCOVERY=legacy`. `discovery=context` explicitly opts into the checkpoint. These flags only select presentation; they do not modify Publication or canonical data.

## 8개 선택 상한 제거 checkpoint (2026-09-28 후속 지시)

- 이전 실패: corpus 입력 후 기존 live 역사 회귀가 고정 32-page 상한에서 종료했다(run 36374450335). selected viewport는 6 Collection × index depth에 따른 작은 raw page로 World 후보를 훑으므로 677개 전체 bounds에 32 page로 충분하지 않았다. 새 검증은 World shape_count 기반 유한 상한과 중복 cursor 실패를 적용하며 역사 125 placed/2 unplaced 정확한 assertion을 유지한다.
- title ranking PR #243 운영 반영과 합성 corpus 24 Collection/552 Event 입력은 완료. 이전 main CI 36374225647 성공, 모바일 32 pass/1 skip. 해당 post-deploy의 신규 합성 corpus 모바일 테스트는 성공했고 기존 역사 paging만 실패했다.
- 새 변경은 사용자 선택 상한을 제거하고 내부 8개 작업 batch를 유지한다. 전체 선택 digest로 continuation을 묶으며 각 batch는 동일 spatial page를 읽고 결과는 Event ID로 union한다. 총 object read 예산은 `256 × ceil(selected/8)`/viewport page, shell은 기존 16 page와 1MiB 응답 상한 유지. 무제한 throughput 보장이 아니다.
- 로컬 9/16/30 Collection 검사: 고차수 공유 Event와 batch 마지막 Collection의 고유 Event를 빠짐없이 조회, 좌표 동일, 페이지 간 중복 없음, cursor 진전. S2 가독성과 S3 성능 exit는 아직 미달/미검증이다.

## main back-merge와 S2a (2026-09-28 15:36 KST)

- 사용자 지시로 최신 main `2fe083c`를 작업 브랜치에 merge. #242 Clotho transport/policy/query parity와 #246 인증 smoke 독립 실행을 포함하며 conflict 없이 main과 동일 tree를 확인했다. MCP/parity·기존 suppression targeted 7 tests와 web typecheck 통과.
- 이전 8개 제한 제거의 최종 main CI `36375218854`와 post-deploy `36375607244` 모두 성공. 30개 선택·29→30 복구·공유 사건 단일 표현·viewport 유지의 운영 모바일 회귀까지 통과.
- S2a: A5 모드에서 label 없는 point/compact Composite의 투명 hit rectangle을 생성하지 않고 label 없는 region은 pointer-events:none 및 aria-hidden. 그림과 좌표는 유지하며 legacy flag의 interaction은 보존한다. Semantic/Geographic 독립 밀도·keyboard 개선은 후속 S2로 남는다.

## S2b — 통합 Semantic 예산 실험

- 시작 확인: main `103a30a`, CI 36387835246, post-deploy/mobile 36388167524 모두 성공.
- 사전 고정 실험값: Event/Composite 합산 `clamp(floor(viewport area / 28000),8,32)` label budget; 충돌 여백 8px; HUD 상단 72px/하단 56px 예약. 기존 label/suppression 자격을 되살리지 않으며 geometry 후보는 제거하지 않는다. 선택된 유자격 대상→이전 label→중심 거리→ID 순으로 배치한다. 텍스트 bounds는 한글/ASCII 폭과 회전의 보수적 추정이며 실제 200% text 검증 완료를 뜻하지 않는다.
- point primary target은 표시된 label 길이에 맞추며 A5에서 높이 44px. region 면 전체는 primary input을 받지 않고 label에서 읽는다. Semantic target은 Enter/Space와 focus 표시를 지원한다.
- 검증: 통합 quota, 서로 다른 종류 간 충돌/선택 우선, 1px 이동 안정성과 입력 geometry 불변. 운영 mobile 회귀에 실제 target 합산 budget과 keyboard 본문 열기를 추가했다. S2 전체 및 S3 성능 exit 완료는 아니다.
