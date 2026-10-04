# 현재 구현 상태

2026-10-04 UTC. 이 파일은 현재 실행·배포 상태를 소유한다. [PR #303까지의 이력](CURRENT-HISTORY-THROUGH-PR303.md)과 dated evidence는 역사 기록이다.

## 실행 원칙과 종료 결정

사용자는 iPhone 17 Safari/PWA로만 작업하고 코드를 직접 리뷰하지 않는다. Codex Cloud에서 구현·검증하며 운영에 작은 checkpoint를 자주 배포한다. 후속 구현의 checkpoint 정책은 [AGENTS](../../AGENTS.md)/[IS-001](IS-001-agent-mobile-strategy.md)을 따른다. **후속 사용자 지시로 World 관리 구현과 검증 후 merge·정상 배포가 승인됐다.** PR #323은 W/C 범위로 진행하며 새 개발 세션·표현/배치/Collection 자동화는 시작하지 않는다. 운영 인증 권한 확대는 정확한 설정별 승인을 따로 받는다.

**모바일 성능·연속성 튜닝은 2026-10-04 사용자 체감 수용과 명시적 지시로 종료했다.** 사용자는 운영이 상당히 원활하다고 확인했다. [종료 결정·검증·잔여 backlog](IP-012-mobile-continuity-closeout.md)가 이전 목표 달성까지 자율 튜닝하라는 지시를 대체한다. 기존 p9533.4ms 미달을 통과로 바꾸지 않으며 숫자 미달만으로 자동 재개하지 않는다. 이후 구체적 버그는 정상적인 수정·회귀 검증으로 처리한다.

## 새 우선순위와 단계

[IP-013 실제 역사 기반 병행 계획](IP-013-real-history-development-plan.md)이 기존 A5 전체 완료→A6 순서를 대체한다. 계획 문서 #322 병합 후 **현재 W/C 구현·검증 중**이다. 사용자는 PR-first가 충돌 확인을 뜻한다고 명확히 했으며 검토·필수 CI 통과 후 merge를 승인했다. 데이터 입력은 W/C 운영 수용 후 dot의 제한 pilot부터 시작한다.

- **IP-011 A1–A3 완료, A4 종료·이관:** 전체 성능 통과 아님. A4-B01–03과 #321 종료 결정을 유지한다.
- **W→C 선행, PR #323 검증 중:** create/withdraw/restore, 인증된 전 World 접근의 opt-in, World/Event 선택과 빈 상태를 구현했다. [로컬 근거](../evidence/world-lifecycle/implementation.md): 통합49개, WebKit4개 통과. 기존 main에서도 재현되는 Mac golden 실패1건은 별도 기록했다. PR CI·배포·운영 권한 활성화·실제 Clotho 종단간 확인 전까지 W/C 운영 수용은 미완료다.
- **W/C 수용 후 D1∥R:** dot는 깨끗한 production history World에 제한 조선/임진왜란·인접국 pilot을 축적하고 Codex는 그 실제 사례로 Composite 줌 표현·전환·눈으로 조정 가능한 threshold를 개발·검증한다. pilot 사용자 검토 전 자율 광역 확장·인물별 구성은 보류한다.
- **다음 L, 이후 A:** Composite 수용 후 production main UX와 격리된 X 배치 실험실, 이후 Collection 자동 ON/OFF·discovery. 수동 읽기·선택·camera 보존은 선행 검증에 필요한 범위에서 유지한다.
- **A5 부분 구현/나머지 재배치:** HUD·표현 분리·선택 제한 제거는 보존. 전체 S0–S7 자동화 완료는 역사 입력 gate가 아니다. [A5 disposition](IP-011-A5-collection-discovery-plan.md)을 따른다.
- **IP-012 부분 구현:** 실제 입력의 무결성·발행·복구는 C gate다. 증분 재사용/선택 compile 등 최적화 전체 완료는 pilot 선행 조건이 아니다.
- A6의 새 입력 경로는 IP-013 D로 대체하며 **현재 데이터 입력은 미착수**다. M5·새 governance/다중 Publication 제품은 비활성이다. 합성 fixture는 회귀용, 실제 역사는 주 탐색·수용 자료다.

## 안정화 기준선

- **마지막 runtime:** [PR #320](https://github.com/neocjmix/moirai/pull/320), `d3e79d7fdd92e6977cf68af0cb8f9a9a85a99521`. Railway SUCCESS와 exact-SHA smoke 확인. main/branch CI·A5·IP-004 성공. 후속 종료 정리 commit은 이 runtime을 유지한다.
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
