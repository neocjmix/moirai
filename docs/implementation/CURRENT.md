# 현재 구현 상태

IP-004 — [M5 진입 전 Production Readiness Gate](IP-004-production-readiness-gate.md) 활성.
사용자 승인 범위: Atropos Island/Event product surface 안정화, Clotho 자연어 작성의 semantic E2E·점진적 refinement 검증, 실제 query path의 scale/latency/cache 검증. Graph view는 현재 안정된 regression baseline으로 유지하며 재설계하지 않는다. M5는 계속 비활성이다.

PR-0 baseline은 [evidence](../evidence/ip-004-pr0-baseline-2026-09-13.md)에 고정했다. PR-A1은 PR #81·runtime `54929f7`([evidence](../evidence/ip-004-pra1-island.md)), PR-A2는 PR #82·runtime `9456f13`으로 배포 검증했다([evidence](../evidence/ip-004-pra2-event.md)). Graph renderer/layout/interaction은 M4.7 baseline으로 유지한다. 현재 PR-B1 — 실제 Clotho coarse creation 전 Revision-safe query/readback harness 보강 중이며 canonical write는 아직 없다. PR-C는 PR-B의 실제 query shape를 계측한다.

후속 도그푸딩 수정: Composite 레이블 후보 전환에 화면 기준 히스테리시스 적용.
이전 변을 유지하면서 좌표는 계속 갱신하고, 충분한 개선·화면 이탈 시 전환한다.
M4.7 완료 이력 유지. 후속 수정 완료: PR #77, runtime `3ccb6f1`.
[CI 34735400926](https://github.com/neocjmix/moirai/actions/runs/34735400926)·
[smoke 34735500662](https://github.com/neocjmix/moirai/actions/runs/34735500662) success.
임계점 반복 왕복/역방향 전환/화면 이탈·topology 변경 검사 3개 및 mobile 회귀 통과.
프로덕션 `/__status` SHA 확인, Composite 레이블 8개가 6px 왕복 이동을 그대로 따라가고
원래 위치로 돌아오는 것을 실제 브라우저 DOM으로 확인했다.

M4.7 완료 — [viewport 연속성과 탐색 경계](M4.7-VIEWPORT-CONTINUITY.md).
사용자 승인: 복귀 버튼 제외. A~C 완료.
검증 checkpoint `7f1da7c`, CI `34733627018`·smoke `34733714577` success.
[완료 증거](../evidence/m47-viewport-continuity.md).

2026-09-12 사용자 승인으로 기존 production 샘플 3개를 모두 삭제하고
[조선 전기 도그푸딩 데이터](../evidence/joseon-dogfood.md)로 교체했다.
현재 World는 `조선 전기 — 건국에서 세조까지` 하나이며 revision 1 ready,
주요 사건 32개·Composite 8개·Relation 124개다.
사용자 승인으로 도그푸딩 backlog를 수정했다: Gregorian 축·사건 설명 복구(PR #69)와
시간 cluster의 개별 범위·순서 준수(#57). [검증 기록](../evidence/dogfood-backlog.md).
완료 runtime `91f2230` — CI `34726121209`, smoke `34726218992` success,
Railway 세 서비스 배포 및 mobile WebKit 통과.

세션과 에이전트 사이의 짧은 상태판이다. M4.5-A~G의 데이터·query 작업은 유지한다.
M4.5-H와 남은 M4.5 계획은 폐기했다. M4.6은 현재 URDR renderer·layout·interaction·spatial
read pipeline을 유지하면서 입력을 Moirai Publication data로 교체한다.

| 항목                       | 현재 값                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 기준 계획                  | [IP-004 — Production Readiness Gate](IP-004-production-readiness-gate.md); [IP-001](IP-001-first-product-plan.md)은 상위 제품 계획 |
| 실행 상태                  | `active` — PR-0, PR-A1/A2 배포 검증 완료; PR-B1 진행 중 |
| 활성 milestone             | IP-004 Production Readiness Gate — M5 entry blocker |
| 현재 slice                 | PR-B1 Clotho coarse creation — 고정 Revision query와 identity readback 보강 후 실제 작성 |
| M5 상태                    | 비활성 — IP-004 전체 종료 + 별도 사용자 활성화 필요 |
| Graph 기준                 | M4.7 완료 상태를 regression baseline으로 유지; 재설계 금지 |
| M4.6-B checkpoint          | PR #55 merge `ad00da4ee10d55f8b948ba5fe3a2b737a15a570a`; PR/main CI `34683566545`/`34683671696`, smoke `34683794046` success; stable identity·Canon별 instance·lossless sidecar |
| M4.6-A checkpoint          | PR #54 merge `2427b9b14c448abd0c889e576d05c353eb462b14`; CI `34683157095`, smoke `34683255320` success; spatial/gesture 16개 및 WebKit screenshot 검증 |
| 업로드·배포 승인           | 2026-09-02 KST 사용자가 공개 `neocjmix/moirai` main 업로드·기존 Railway 배포를 명시 승인; 현재 synthetic World 검증 범위 유지 |
| 완료 milestone             | M0 전달·관측·보안 기반; M1 최초 vertical slice; M2 세계 확장; M3 Clotho 최소 작성; M3-R 책임 분리·배포; M3-C 실제 연결; M4 계열 graph/exploration baseline |
| M4.6 runtime 기준선        | `dcad5305aadc8d0181e2b6ff33701385310ebb70`; Atropos `/graph`; URDR `0267c8fd081ca9a3cd556f8f7319c600248c3760`의 renderer·layout·interaction·spatial read 계승 |
| `/graph` 기준 application  | PR #19 merge `458cca0183a8b995b6a4edafa12fc104a0659574`; production route 렌더·interaction 확인                              |
| M4.5-A 계약 checkpoint     | [PR #21](https://github.com/neocjmix/moirai/pull/21) merge `6e8feace3b5d39466b725f44980aede714406a96`; [CI 34390674821](https://github.com/neocjmix/moirai/actions/runs/34390674821) success |
| M4.5-B App shell checkpoint | [PR #22](https://github.com/neocjmix/moirai/pull/22) merge `a012fad3b60df91f1a16819b82d243e5d1283801`; [CI 34392698639](https://github.com/neocjmix/moirai/actions/runs/34392698639) success |
| M4.5-B locale 후속          | [PR #23](https://github.com/neocjmix/moirai/pull/23) merge·production `cf0f5a7f747acb9c110cbea0c7db4a3ae068c6ce`; [CI 34393637840](https://github.com/neocjmix/moirai/actions/runs/34393637840) success |
| M4.5-C Sources checkpoint  | [PR #25](https://github.com/neocjmix/moirai/pull/25) merge·production `2c9002848e91c337876103d21e17804148d9f159`; [CI 34428583825](https://github.com/neocjmix/moirai/actions/runs/34428583825) success |
| M4.5-C 배포 smoke          | [34428902256](https://github.com/neocjmix/moirai/actions/runs/34428902256) `success`; 공개 `/__status` SHA 일치, `/graph` Sources island 확인 |
| M4.5-D1 완료               | [PR #38](https://github.com/neocjmix/moirai/pull/38) merge·production `5157962a821eba7b021db494f59c14bce5d6104e`; CI `34613884767` success; identity dedup·membership match·URL/no-JS 검증 |
| M4.5-D2 완료               | [PR #39](https://github.com/neocjmix/moirai/pull/39) merge·production `b3677cf0fad03d9643c0f09784ae5295a7b926eb`; CI `34615164602` success; R1 filter/evidence/diagnostics 검증 |
| M4.5-E 완료                | [PR #40](https://github.com/neocjmix/moirai/pull/40) merge `bb490bfb83b6e504dd220dc7a595a61bd5acb2e1`; CI `34616417588` success; Revision-fixed Publication composition·digest·budget·production query smoke |
| M4.5-F 완료                | [PR #41](https://github.com/neocjmix/moirai/pull/41) merge `e2260aafdf3ffa9e51bdd7fd7b9f4df29f9ce6c7`; CI `34617357534` success; mobile sheet·stable route 왕복·structured attributes·derived metadata |
| M4.5-G 완료                | [PR #42](https://github.com/neocjmix/moirai/pull/42) merge `f414f571def404070a0ea7f4812d1809437b0860`; v3→legacy bridge, observable loss, 2,500 visible-cell hard cap와 100k fixture; [결정 기록](evidence/m45-g-legacy-viewport-bridge-implementation-2026-09-11.md) |
| Publication→explorer 연결  | [PR #44](https://github.com/neocjmix/moirai/pull/44) merge·rollback 기준선 `0f5554926587bbd01193b57496d82e9c5f2743e3`; 이후 충돌 이력 #45–#48은 의도적으로 폐기 |
| legacy Relation 호환성     | [PR #49](https://github.com/neocjmix/moirai/pull/49) merge·production `e81f4eafd91046346e239d8883a18ff6ad53c3c3`; immutable v1/v2 Relation을 Publication read boundary에서 normalization |
| M4.5-H 철회                | [PR #50](https://github.com/neocjmix/moirai/pull/50)의 native viewport는 검증 이력만 보존하고 2026-09-12 사용자 결정으로 runtime 기준에서 철회; Publication query·검색은 유지하고 URDR 목데이터 viewport 복구 |
| M4.6 전환 결정             | M4.5의 남은 계획을 폐기; URDR graph pipeline을 보존하고 Moirai Publication을 presentation input으로 연결                     |
| IP-003 완료                | Slice 0~7 및 R1 production acceptance 완료; M5 재설계 범위는 [IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위) 유지 |
| public integration URL     | <https://moirai-production-8ed1.up.railway.app/>                                                                              |
| M4.5 graph 기준 URL        | <https://moirai-production-8ed1.up.railway.app/graph>                                                                         |
| Clotho synthetic World     | <https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101>                                   |
| Clotho 인증 API            | <https://desirable-vitality-production-eb95.up.railway.app>                                                                   |
