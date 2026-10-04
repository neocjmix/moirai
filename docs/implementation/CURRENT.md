# 현재 구현 상태

2026-10-04 UTC, IP-013 R/L 세션 재확인. 이 파일은 현재 실행·배포 상태를 소유한다. [PR #303까지의 이력](CURRENT-HISTORY-THROUGH-PR303.md)과 dated evidence는 역사 기록이다.

## 실행 원칙과 종료 결정

사용자는 iPhone 17 Safari/PWA로만 작업하고 코드를 직접 리뷰하지 않는다. Codex Cloud에서 구현·검증하며 운영에 작은 checkpoint를 자주 배포한다. 후속 구현의 checkpoint 정책은 [AGENTS](../../AGENTS.md)/[IS-001](IS-001-agent-mobile-strategy.md)을 따른다. **이번 사용자 지시로 Composite 표현 실험과 독립 Layout Lab의 공유 engine 구현을 활성화했다.** 운영 GraphShell의 runtime layout/실험 UI 추가는 금지한다. 역사 World는 read-only이며 canonical 설정 승격·backfill·Collection 자동화는 범위 밖이다. PR-first와 자동 merge 금지는 유지한다.

**모바일 성능·연속성 튜닝은 2026-10-04 사용자 체감 수용과 명시적 지시로 종료했다.** 사용자는 운영이 상당히 원활하다고 확인했다. [종료 결정·검증·잔여 backlog](IP-012-mobile-continuity-closeout.md)가 이전 목표 달성까지 자율 튜닝하라는 지시를 대체한다. 기존 p9533.4ms 미달을 통과로 바꾸지 않으며 숫자 미달만으로 자동 재개하지 않는다. 이후 구체적 버그는 정상적인 수정·회귀 검증으로 처리한다.

## 새 우선순위와 단계

[IP-013 실제 역사 기반 병행 계획](IP-013-real-history-development-plan.md)이 기존 A5 전체 완료→A6 순서를 대체한다. 최신 main과 운영 SHA는 **#323 `4c726661c913de5920b9866344f2ca76e80a388d`**다. #323은 이미 병합·배포됐고 공개 smoke는 passed다. 이전 W/C 검증 중·역사 미착수 표기는 뒤처져 있었다. 공개 역사 World revision 26(147 Event·3 Collection)을 확인했고 연결된 read-only export로 고정 입력을 확보했다. 이것을 별도의 역사 정확성/사용자 pilot 수용으로 확대하지 않는다.

- **IP-011 A1–A3 완료, A4 종료·이관:** 전체 성능 통과 아님. A4-B01–03과 #321 종료 결정을 유지한다.
- **W/C 구현 배포:** #323의 create/withdraw/restore, World/Event 선택과 빈 상태가 main/운영에 반영됐다. 당시 근거는 [W/C evidence](../evidence/world-lifecycle/implementation.md)에 보존한다.
- **R + L 경계 구현:** `/labs/layout`에서 snapshot 1회 로드 → 브라우저 shared engine 재계산 → 같은 camera의 A/B 비교. force baseline·deterministic slots, schema별 controls, 표현 threshold/fade/hysteresis/density, local/JSON snapshot preset을 구현했다. 검증·PR·배포 상태는 [Lab evidence](../evidence/ip013/layout-lab.md)를 따른다. 현재 사용자 표현/후보 채택 수용 전이다.
- **실제 역사 read-only:** World `01a107fb-4018-7fcb-8390-836a40fa91cc`, source/served26, Event147·Relation386·Collection3·membership270. dot의 계속되는 입력과 별개로 실험은 고정 snapshot을 쓴다. 대량 확장·인물별 구성·canonical 수정은 수행하지 않는다.
- **다음:** 실제 Composite의 X/Y 왕복 표현과 baseline/slot 후보를 사용자가 비교한다. constraint/packing/local relaxation, canonical 설정 승격/발행, Collection 자동 ON/OFF·discovery는 별도 후속 범위다.
- **A5 부분 구현/나머지 재배치:** HUD·표현 분리·선택 제한 제거는 보존. 전체 S0–S7 자동화 완료는 역사 입력 gate가 아니다. [A5 disposition](IP-011-A5-collection-discovery-plan.md)을 따른다.
- **IP-012 부분 구현:** 실제 입력의 무결성·발행·복구는 C gate다. 증분 재사용/선택 compile 등 최적화 전체 완료는 pilot 선행 조건이 아니다.
- A6의 새 입력 경로는 IP-013 D로 대체하며 **현재 역사 pilot 입력이 존재한다**. M5·새 governance/다중 Publication 제품은 비활성이다. 합성 fixture는 회귀용, 실제 역사는 주 탐색·수용 자료다.

## 안정화 기준선

- **현재 runtime:** [PR #323](https://github.com/neocjmix/moirai/pull/323), `4c726661c913de5920b9866344f2ca76e80a388d`; 공개 status/health와 smoke passed 확인. 아래 #320의 성능·표현 측정은 보존된 안정화 근거이며 #323의 새 성능 측정으로 주장하지 않는다.
- **표현:** WebGL2 background hull/point + native SVG text·relation·input. 미지원/context loss 시 SVG로 복귀하고 `?gsGraphics=canvas`/`svg` 비교 경로를 유지한다. 전체 화면 gesture cache는 제거됐으며 atomic resize, bounded contour cache, 동일 응답 no-op publication, native label path 평행 이동이 반영됐다.
- **기능 검증:** 모바일40개 통과/기존 조건부1개 skip, 실제 compiler/4 11개 통과(0/250/750ms reads·identity·glyph touch·camera/Collection 반전·resize·fallback). 기존1008-placement digest 유지. 직전 runtime 전체 unit609개 통과/2개 skip. 동일 응답 commit 회귀는50회 이동=50 commits로 수정했고 #319 main/branch CI·A5·IP-004가 통과했다.
- **원래 성능 기준은 미달:** #319 정상30회/각602frame p9548/48/47ms, max62/60/61ms, 초기2579.9ms/4요청, 전체62요청·오류0. #320 마지막 short0회/각602frame은49/48ms, max64/60ms, 초기1718.5ms/4요청, 전체11요청·오류0. short를30회 통과로 표시하지 않는다. cache/DOM은 bounded working set 안에 머문다.
- **증거 한계:** Cloud native EGL은 llvmpipe software다. 사용자 질적 체감 수용과 별개로 실제 iPhone17 GPU frame·장시간 heap은 계측하지 않았다. A4 sustained CI 실패는 이관된 수치 미달이며 기능 CI 성공으로 덮지 않는다. 최신 CI와 raw artifact는 [실행 evidence](../evidence/ip012/mobile-continuity-2026-10-02.md)를 따른다.
- World `01995c2a-7b00-7000-8000-000000000101`: Revision62, 30 Collection, 677 placed/2 unplaced Event, `render-compiler/4`. 데이터 작업 전 수량·revision을 다시 확인한다.

## 구조·불변식

World가 Event identity·transaction·Revision·access 경계다. Collection은 선택 집합이며 공유 Event를 복제하지 않는다. Event/Collection은 각각 독립 Narrative 하나를 갖고 membership 없는 Event는 허용한다. 작성된 contains/Composite 의미, World 좌표, 기존 hull·label·relation·HUD·drawer·camera 문법을 유지한다.

Lachesis는 bounded 표현 후보·authored ancestry·geometry support를 publication으로 준비하고 Atropos는 현재 화면의 visibility·보간·interaction을 담당한다. compiler/4는 `render-publication/2` signed grid를 사용하고 viewport representation→필요 geometry의 두 단계 읽기를 지원한다. 전체 manifest는 일반 읽기의 선행 조건이 아니다. `?tileData=0`은 semantic rollback, `?renderTiles=1`은 별도 tile scene 관측 경로다. full compile을 증분 구현 완료로 표현하지 않는다.

- [Atropos 모바일](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01995c2a-7b00-7000-8000-000000000101)
- [Clotho](https://desirable-vitality-production-eb95.up.railway.app)
- [Render architecture decisions](../architecture/ADR-012-render-read-architecture.md)
