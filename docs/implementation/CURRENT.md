# 현재 구현 상태

2026-10-07 UTC, IP-013 세계사 화면 복원·계층 표현 후속. 이 파일은 현재 실행·배포 상태를 소유한다. [PR #303까지의 이력](CURRENT-HISTORY-THROUGH-PR303.md)과 dated evidence는 역사 기록이다.

## 실행 원칙과 종료 결정

사용자는 iPhone 17 Safari/PWA로만 작업하고 코드를 직접 리뷰하지 않는다. Codex Cloud에서 구현·검증하며 운영에 작은 checkpoint를 자주 배포한다. 후속 구현의 checkpoint 정책은 [AGENTS](../../AGENTS.md)/[IS-001](IS-001-agent-mobile-strategy.md)을 따른다. **2026-10-05 사용자가 이번 Composite 표현·독립 Layout Lab 범위의 자율 merge·배포·검증을 명시적으로 승인했다.** PR 기반 검토는 유지하며 이 slice의 이전 자동 merge 금지를 대체한다. 운영 GraphShell의 runtime layout/실험 UI 추가는 금지한다. 역사 World는 read-only이며 후보 채택·canonical 설정 승격·backfill·Collection 자동화는 별도 범위다.

**모바일 성능·연속성 튜닝은 2026-10-04 사용자 체감 수용과 명시적 지시로 종료했다.** 사용자는 운영이 상당히 원활하다고 확인했다. [종료 결정·검증·잔여 backlog](IP-012-mobile-continuity-closeout.md)가 이전 목표 달성까지 자율 튜닝하라는 지시를 대체한다. 기존 p9533.4ms 미달을 통과로 바꾸지 않으며 숫자 미달만으로 자동 재개하지 않는다. 이후 구체적 버그는 정상적인 수정·회귀 검증으로 처리한다.

## 새 우선순위와 단계

**2026-10-07 오른쪽 조작부·계층 표시 후속:** 사용자는 World 옆 사건 목록 제거, 오른쪽 World 선택기→활성 Event 제목→숫자 배지의 레이어 아이콘 순서와 더 많은 텍스트를 요청했다. 부모가 자식보다 먼저 사라지지 않도록 발행 후보와 화면 전환을 함께 고치며 Y 길이를 주로 사용하는 흐린 Hull→큰 점→작은 점→숨김을 유지한다. 기준선은 `047bfc92`, 검증 대상은 같은 새 세계사 r51이다. 같은 revision의 Render generation만 재생성하고 정본을 보존한다. [재현·검증 기록](../evidence/ip013/right-hud-hierarchy-2026-10-07.md)과 해당 PR의 최종 배포 기록을 따른다.

**2026-10-07 사용자 후속 지시 — 구현·배포 완료:** [PR #331](https://github.com/neocjmix/moirai/pull/331)의 `a390e69a`에서 마지막 World·좌표 복원, 두 줄 HUD·World 선택 화면, Y 구간별 깊이 패딩, Composite 색상·축소 단계·부모/자식 연동 및 터치 관성을 배포했다. 작업 전 main/운영 기준선은 `f85c800b`이며 새 **세계사** World `01a107fb-4018-7fcb-8390-836a40fa91cc`의 r51(518 Event·486 Relation·6 Collection)로 운영 검사 37개를 통과했다. 이 World의 동일 source revision Render generation만 재생성했고 원본 Publication·역사 정본 digest는 유지됐다. [기준선·동작·완료 증거](../evidence/ip013/world-layout-continuity-2026-10-07.md)와 PR의 최종 CI·배포 기록을 따른다.

[IP-013 실제 역사 기반 병행 계획](IP-013-real-history-development-plan.md)이 기존 A5 전체 완료→A6 순서를 대체한다. **#324의 runtime 구현 commit은 `290cbbe1ed15b4927a6bbeb964fcd37a40d9bf2d`다.** 이 SHA의 3서비스 배포·공개 smoke·Lab 모바일 WebKit 5개 검증을 완료했다. 이전 W/C 검증 중·역사 미착수 표기는 #323과 실제 데이터보다 뒤처져 있었다. R/L 검증에 사용한 공개 역사 World revision26(147 Event·3 Collection)과 read-only export는 고정 evidence로 보존한다. 이것을 별도의 역사 정확성/사용자 pilot 수용으로 확대하지 않는다.

- **IP-011 A1–A3 완료, A4 종료·이관:** 전체 성능 통과 아님. A4-B01–03과 #321 종료 결정을 유지한다.
- **W/C 구현 배포:** #323의 create/withdraw/restore, World/Event 선택과 빈 상태가 main/운영에 반영됐다. 당시 근거는 [W/C evidence](../evidence/world-lifecycle/implementation.md)에 보존한다.
- **R + L #324 배포·검증 완료:** `/labs/layout`에서 snapshot 1회 로드 → 브라우저 shared engine 재계산 → 같은 camera의 A/B 비교. force baseline·deterministic slots, schema별 controls, 표현 threshold/fade/hysteresis/density, local/JSON snapshot preset을 구현했다. 운영 r26 input digest 일치·preset 복원·Collection의 visibility 한정·조절 중 network0/오류0을 확인했다. 근거는 [Lab evidence](../evidence/ip013/layout-lab.md)를 따른다. 현재 사용자 표현/후보 채택 수용 전이다.
- **Lab 조작성 후속 수정:** 지도 안의 휠·터치가 페이지 스크롤로 전파되는 문제를 고치고, 조절 항목·도움말·오류 안내를 쉬운 한국어로 정리했다. [수정 원인·사용법·검증 범위](../evidence/ip013/layout-lab-korean-interaction.md)를 따른다. 최종 배포 SHA와 운영 검증은 해당 수정 PR 본문과 공개 상태 페이지에서 확인한다.
- **모바일 전용 Lab:** 이동·확대 버튼과 줌 슬라이더를 제거하고 Atropos의 순수 멀티터치 계산으로 한 손가락 이동·축별 핀치를 연결했다. 휴대폰 크기의 단일 A/B 비교, 화면 높이에 맞는 지도, 기존 저장 파일 호환을 제공한다. [동작·검증](../evidence/ip013/layout-lab-mobile-touch.md)과 해당 수정 PR의 배포 근거를 따른다.
- **Lab 진입·단계별 가시성:** 긴 snapshot 읽기 동안 로딩 안내를 제공하고, 영역·보통 점·작은 점의 그림/이름표 진하기와 숨김 기준을 묶어 시험한다. 기존 preset 표시를 보존하며 [검증·배포 근거](../evidence/ip013/layout-lab-stage-visibility.md)를 따른다.
- **텍스트·Composite 표현 후속:** 화면 가장자리와 짧은 Hull에서 제목을 유지하고 이름표 억제를 완화한다. 영역→테두리 없는 영역→보통 점→작은 점 순서와 색상 유지, 더 늦은 점 전환을 운영 GraphShell과 Lab 기본 표현에 적용한다. [동작·검증·배포 근거](../evidence/ip013/layout-text-composite-visibility.md)를 따른다. 배치 좌표·Publication·역사 정본을 바꾸는 작업은 아니다.
- **실제 역사 read-only:** World `01a107fb-4018-7fcb-8390-836a40fa91cc`, source/served26, Event147·Relation386·Collection3·membership270. dot의 계속되는 입력과 별개로 실험은 고정 snapshot을 쓴다. 대량 확장·인물별 구성·canonical 수정은 수행하지 않는다.
- **다음:** 실제 Composite의 X/Y 왕복 표현과 baseline/slot 후보를 사용자가 비교한다. constraint/packing/local relaxation, canonical 설정 승격/발행, Collection 자동 ON/OFF·discovery는 별도 후속 범위다.
- **A5 부분 구현/나머지 재배치:** HUD·표현 분리·선택 제한 제거는 보존. 전체 S0–S7 자동화 완료는 역사 입력 gate가 아니다. [A5 disposition](IP-011-A5-collection-discovery-plan.md)을 따른다.
- **IP-012 부분 구현:** 실제 입력의 무결성·발행·복구는 C gate다. 증분 재사용/선택 compile 등 최적화 전체 완료는 pilot 선행 조건이 아니다.
- A6의 새 입력 경로는 IP-013 D로 대체하며 **현재 역사 pilot 입력이 존재한다**. M5·새 governance/다중 Publication 제품은 비활성이다. 합성 fixture는 회귀용, 실제 역사는 주 탐색·수용 자료다.

## 안정화 기준선

- **runtime 구현과 배포 식별:** [PR #324](https://github.com/neocjmix/moirai/pull/324)의 `290cbbe` Atropos·Clotho·worker 배포와 공개 readiness smoke를 확인했다. 후속 문서 전용 commit도 배포를 유발할 수 있으므로 동일 runtime 코드와 실제 deployed SHA를 구분한다. 최종 deployed SHA는 문서 closeout PR 본문과 공개 [`/status-public`](https://moirai-production-8ed1.up.railway.app/status-public)으로 확인하며 [Lab evidence](../evidence/ip013/layout-lab.md)에 검증 시점을 남긴다. 아래 #320 측정은 보존된 안정화 근거다.
- **표현:** WebGL2 background hull/point + native SVG text·relation·input. 미지원/context loss 시 SVG로 복귀하고 `?gsGraphics=canvas`/`svg` 비교 경로를 유지한다. 전체 화면 gesture cache는 제거됐으며 atomic resize, bounded contour cache, 동일 응답 no-op publication, native label path 평행 이동이 반영됐다.
- **#319–#320 기능 검증(보존):** 모바일40개 통과/기존 조건부1개 skip, 실제 compiler/4 11개 통과(0/250/750ms reads·identity·glyph touch·camera/Collection 반전·resize·fallback). 기존1008-placement digest 유지. 당시 runtime 전체 unit609개 통과/2개 skip. 동일 응답 commit 회귀는50회 이동=50 commits로 수정했고 #319 main/branch CI·A5·IP-004가 통과했다.
- **원래 성능 기준은 미달:** #319 정상30회/각602frame p9548/48/47ms, max62/60/61ms, 초기2579.9ms/4요청, 전체62요청·오류0. #320 마지막 short0회/각602frame은49/48ms, max64/60ms, 초기1718.5ms/4요청, 전체11요청·오류0. short를30회 통과로 표시하지 않는다. cache/DOM은 bounded working set 안에 머문다.
- **증거 한계:** Cloud native EGL은 llvmpipe software다. 사용자 질적 체감 수용과 별개로 실제 iPhone17 GPU frame·장시간 heap은 계측하지 않았다. A4 sustained CI 실패는 이관된 수치 미달이며 기능 CI 성공으로 덮지 않는다. 최신 CI와 raw artifact는 [실행 evidence](../evidence/ip012/mobile-continuity-2026-10-02.md)를 따른다.
- World `01995c2a-7b00-7000-8000-000000000101`: Revision62, 30 Collection, 677 placed/2 unplaced Event, `render-compiler/4`. 데이터 작업 전 수량·revision을 다시 확인한다.

## 구조·불변식

World가 Event identity·transaction·Revision·access 경계다. Collection은 선택 집합이며 공유 Event를 복제하지 않는다. Event/Collection은 각각 독립 Narrative 하나를 갖고 membership 없는 Event는 허용한다. 작성된 contains/Composite 의미, World 좌표, 기존 hull·label·relation·HUD·drawer·camera 문법을 유지한다.

Lachesis는 bounded 표현 후보·authored ancestry·geometry support를 publication으로 준비하고 Atropos는 현재 화면의 visibility·보간·interaction을 담당한다. compiler/4는 `render-publication/2` signed grid를 사용하고 viewport representation→필요 geometry의 두 단계 읽기를 지원한다. 전체 manifest는 일반 읽기의 선행 조건이 아니다. `?tileData=0`은 semantic rollback, `?renderTiles=1`은 별도 tile scene 관측 경로다. full compile을 증분 구현 완료로 표현하지 않는다.

- [Atropos 모바일](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01995c2a-7b00-7000-8000-000000000101)
- [Composite / Layout Lab — 실제 역사 r26](https://moirai-production-8ed1.up.railway.app/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc&revision=26)
- [Composite / Layout Lab — 합성 회귀 fixture](https://moirai-production-8ed1.up.railway.app/labs/layout?demo=1)
- [Clotho](https://desirable-vitality-production-eb95.up.railway.app)
- [Render architecture decisions](../architecture/ADR-012-render-read-architecture.md)
