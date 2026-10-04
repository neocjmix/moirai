# IP-012 — 모바일 성능과 표현 연속성 후속 계획

상태: **2026-10-02 사용자 지시로 구현 활성**. IP-011 A5와 IP-012의 후속 성능 작업이며 A6/M5를 활성화하지 않는다. [CURRENT](CURRENT.md)가 실행·배포 상태, [IP-012](IP-012-render-publication-plan.md)가 migration 순서, [ADR-012](../architecture/ADR-012-render-read-architecture.md)가 책임 경계를 소유한다. [A4-B01–03](IP-011-A4-closeout-backlog.md)의 미달과 수치 기준을 유지한다.

## 목표와 권한

모바일 사용자가 평범한 네트워크·단말 조건에서 pan/zoom을 할 때 추가 fetch를 의식하지 않고 세계를 탐색할 수 있어야 한다. hull ↔ ordinary point(big dot) ↔ small point ↔ hidden은 동일한 작성 identity의 자연스러운 표현 변화다. Google Maps 벡터 모바일 지도를 질적 경험 기준으로 사용하지만 동일 구현 방식이나 직접 측정하지 않은 정량 동등성을 요구·주장하지 않는다.

사용자의 실제 환경은 **iPhone 17 Safari 및 설치된 PWA**다. 현재 자동 시험·profile의 iPhone 14 WebKit emulation은 별도 조건으로 기록하며 실제 iPhone 17 성능이나 PWA 검증을 대체하지 않는다.

사용자는 코드 리뷰를 하지 않는다. 작은 구현 checkpoint를 운영에 자주 배포하고 URL·SHA·검증·남은 실패를 제공한다. 쓰기·merge·배포·incident 대응은 이 목표 내에서 사전 승인됐다. CI 실패나 부분 완료는 otherwise deployable checkpoint의 배포 금지가 아니다. 알려진 실패를 통과로 표시하거나 milestone 완료 조건을 낮추지는 않는다.

기존 UI 문법, 작성된 contains/Composite, 공유 Event identity, World 좌표·temporal order, 별도 Narrative, Collection 선택과 camera 복원, HUD·relation·drawer·primary interaction을 유지한다. text와 graphic density는 독립이다. 성능을 위한 작은 표현 차이·approximation은 허용한다. 내부 API·publication·cache·frame pipeline·renderer 선택은 필요에 따라 변경할 수 있다. 사용자가 제시한 overfetch·FE 계산은 해결책 예시이며 고정된 구현 지시가 아니다.

## 현재 checkpoint와 우선 작업

2026-10-04 업데이트: PR #310 `f8143ae…`가 운영에 배포됐고 일반 CI·A5·post-deploy·IP-004·A4 worker/mobile matrix가 모두 성공했다. 계측을 끈 운영30회 profile은 p95=53/57/60ms로 계속 미달이다. 후속 Canvas 배경 hull/point painter는 기존 SVG text·authored DOM·interaction을 유지하며 배경 raster만1.5배로 제한한다. 로컬 모바일37개와 compiler/4 6개가 통과했고 SVG 기준 이미지와 비교했다. 이 painter의 운영 성능 검증이 현재 다음 작업이다.

2026-10-02 여섯 번째 checkpoint 구현 `1d768af`는 main `0069c094308acdf0636f593dd0d56570d0c91bc9`로 배포됐다. actual compiler/4의 0/250/750ms 지연과 touch 4개 시험은 13.3초에 통과했고 persisted 복원 증거는 다음 실행 대기다. 앞선 checkpoint의 CI·smoke 성공, loading 실패와 30회 frame 미달은 [실행 근거](../evidence/ip012/mobile-continuity-2026-10-02.md)에 보존한다. **기능 검증 성공과 성능 완료는 별개다.** 새 기본 DPR 3의 계측 short profile p95 55/54ms는 여전히 미달이다.

| 상태 | 현재 범위와 다음 검증 |
| --- | --- |
| 구현·배포됨, 전체 gate 열림 | metadata LRU/공간 margin, finer-level prefetch 안쪽 readiness 경계, authored paint owner·hull/point fade, bounded pan hull/path 재사용, response structural sharing, 넓은 camera 복원. 중간 개선과 뒤이은 regression을 함께 보존 |
| 네 번째 서버 checkpoint 배포·측정 완료, frame 미달 | generation hash immutable cache·동일 object coalescing·Server-Timing. 30회 profile ready 2099.7ms/4요청, 전체 68요청, frame p95 68/76/96ms. 반복 서버 reads 감소와 잔여 client frame 비용을 구분 |
| 다섯 번째 UI checkpoint 배포·기능 검사 성공 | network detail identity와 drawer presentation history 분리, history quota/중복 detail 회귀 및 label/point paint entrance·exit·reversal·prune 검증. main CI/public A5/post-deploy와 actual compiler/4 기존 fixture 성공. 성능 gate는 계속 열림 |
| 같은 SHA short 진단 완료 | 일반 blend p95 57/53ms·max 89/148ms, blend-off p95 49/45ms·max 64/72ms, 정지 scene RAF p95 17/17ms·max 17/18ms. 모두 0 visits short control이며 full 30회 gate나 실기기 동등성 증거 아님 |
| 여섯 번째 checkpoint 배포·진단 중 | Composite one-pass/HUD memo·idle camera identity·bounded 8-asset 읽기. actual compiler/4 지연/touch 4 tests 성공. 기본 DPR 3 p95 55/54ms·max 71/88ms, DPR 1 control 34/32ms·max 86/47ms. 둘 다 원래 profile의 성능 완료 증거 아님 |
| SVG 대조 실험 완료, draw/React 개선 진행 | 같은 DPR 3에서 visible p95 56/54ms, hidden 25/24ms, display-none 25/23ms. 표시 SVG/paint 비용이 큰 구성 요소임을 확인했으나 화면을 숨긴 control은 acceptance 아님. bounds read 약 0.6ms/frame만으로 전체 지연 설명 불가 |
| dense10k semantic continuation 수정, mobile 통과·미배포 | 유효 cursor 예산과 query·traversal 제한을 분리. 실제 built-app WebKit에서 262 Event가 160+102로 완결되고 21.6KB continuation을 수용. cold 786ms/repeat 466ms, 실제 drawer·HUD 2회 toggle·오류 0. 전체 A4 matrix 성능 통과는 아님 |
| 다음 slice shared build·28개 기능 시험 성공, 미배포 | legacy RSC initial-detail 1회·명시 Retry 1회 검증을 결정적으로 정리하고 unchanged color setter no-op 적용. actual compiler/4 synthetic pagehide 포함 5개 재시험은 결과 대기 |

운영 Render 응답 3.4–11.9초, canonical 응답 8–120ms의 차이와 낮은 관측 CPU/메모리 사용은 server object I/O/cache 경로를 우선 조사할 근거다. 이 관측만으로 storage만이 유일한 원인이거나 CPU/메모리·browser lifecycle 문제가 없다고 단정하지 않는다. scale overfetch·geometry compression·서버 증설에 앞서 immutable cache 적용 여부, 반복 object reads, request coalescing, resolved metadata 이후 pending scene 상태를 확인한다.

위 서버 지연은 cache 적용 전 관측이며 최신 서버 timing과 구분한다. 다섯 번째 checkpoint의 blend-off도 frame 기준을 만족하지 못했으므로 기존 blend 표현을 유지하고 changing-scene 계산·reconciliation·paint를 더 줄인다. 정지 RAF가 빠르다는 사실을 gesture 성능 통과로 바꾸지 않는다.

여섯 번째 CPU 계측의 첫 602 frame에서 World preparation은 4ms, region projection/label은 4413ms였다. 호출 수만으로 준비 단계를 병목으로 단정하지 않는다. Cloud에 `/dev/dri`가 없고 WPE가 Mesa EGL/LLVM을 로드한 사실도 특정 active driver나 실기기 원인을 증명하지 않는다. 기본 DPR/화면을 유지하는 drawing·React 개선을 우선하고 원래 실패 기준을 보존한다.

## 측정 시나리오

각 결과에 commit/deployed SHA, World/Revision/Render generation, browser/version, viewport/device emulation 여부, network/CPU 조건, selection, cache 상태를 기록한다. 실제 단말과 Playwright emulation을 구분한다.

1. **운영 wide view:** 현 30 Collection 전체 선택, 최대 실용 viewport와 dense authored Composite. cold 진입→준비→pan→독립 X/Y zoom→return→Collection off/on→drawer 열기.
2. **반복 탐색:** 같은 World/Revision에서 30 visits/returns. 시작·중간·복귀의 연속 active 600+ frame 및 전체 interaction interval을 기록한다. cache/DOM/entity/history/retired 객체가 방문 횟수에 따라 누적되는지 확인한다.
3. **Fetch 교차:** XY 경계와 representation scale 경계를 양 방향으로 넘고 곧바로 반전한다. 정상 응답과 추가 250ms/750ms 지연을 분리한다. 지연·취소·순서 역전·partial/error 중 이미 준비된 coverage의 scene continuity와 최신 요청 ownership을 검증한다. 이미 비어 있던 세계 영역을 로딩 blank로 오인하지 않는다.
4. **Identity/전환:** 하나의 authored Event/Composite를 hull→ordinary point→small point→hidden→복귀로 추적한다. 같은 identity가 여러 tile/level/response에 등장해도 한 논리 객체다. 새 response가 label/history/selection/transition을 불필요하게 초기화하지 않고 drawable counterpart가 준비될 때 교체한다. topology가 다른 hull은 불일치 vertex를 억지 보간하지 않는다.
5. **규모 회귀:** 1k/10k/100k 및 sparse/dense/shared/large fixtures에서 동일 local viewport를 유지하고 먼 Event만 늘린다. 1/9/16/30+ Collection, child가 viewport 밖인 큰 Composite, 긴 relation, all-off, revise/generation 교체를 포함한다. production-scale 관측과 synthetic scale 결과를 구분한다.

## 분리할 비용과 완료 기준

| 영역 | 기록 | 완료 판단 |
| --- | --- | --- |
| Fetch | server p50/p95, object reads, critical/non-blocking 요청 수, waterfall, transferred/decoded bytes | ADR-012 목표: normal cold 약 2, warm 약 1, cached Collection toggle 0 critical round trip. 별도 prefetch는 개수·bytes·cancel을 보고하며 무료로 간주하지 않음. 같은 cached XY/scale 재방문에서 불필요 재요청 없음 |
| Coverage/identity | 로딩/준비 coverage, Event/representation ID, response sequence, generation, camera, transition state | retained covered scene에서 fetch 때문에 비는 frame 0, 같은 identity 중복 primary target 0, stale 응답 덮어쓰기 0, mixed Revision 0. 명시적 all-off/실제 empty 응답은 정상 제거 |
| 표현 전환 | ID별 point radius, hull/point opacity, label eligibility/history, DOM identity·screenshots/trace | 양방향 경계에서 fetch로 transition이 재시작하거나 중간 representation이 사라지는 gap 없음. 화면에서 허용된 approximation 외의 위치 점프 없음. 숨김→복귀는 동일 의미/World 좌표·선택을 유지 |
| Client CPU | parsing/decode, data transformation, world/screen geometry, label/HUD, React commit, paint | 지배적 비용을 profiling으로 확인하고 같은 scenario before/after 기록. World graph 재탐색이나 전체 geometry 재구축이 ordinary frame path에 남으면 책임 이동 또는 bounded 계산으로 해결 |
| Frame | active gesture 및 whole interval p50/p95/max, long tasks, 시작/중간/복귀 | 기존 A4 기준 **p95 ≤33.4ms, max ≤100ms**, 각 600+ active frame. 평균 FPS·정지 RAF·소수 DOM으로 대체하지 않음. 60fps는 제품 목표이며 33.4ms는 기존 acceptance 하한 |
| Latency | cold/warm query, initial ready, drawer를 독립 기록 | [A1 고정 예산](../evidence/ip011/a1-execution.md): cold/warm p95 ≤500/100ms, graph-ready ≤3000ms, drawer ≤1000ms. profile/sample 수가 다르면 diagnostic으로 표시하고 gate 통과를 주장하지 않음 |
| Bounds/memory | active candidates/geometry, request concurrency, LRU entries/bytes, retired/pending count, 가능한 heap | local working set이 먼 World 증가에 선형 비례하지 않음. 30회 복귀 후 bounded plateau와 동일 scene 확인. 직렬화 bytes는 heap 아님; 실제 iPhone 장시간/heap 근거는 A4-B03으로 별도 판정 |

고정 A4 profile에서 p95·max가 실패하면 원래 실패를 보존한다. host contention, 브라우저 계측 비용, 네트워크 대역폭 등 외부 한계가 의심되면 대조 실행으로 확인하고 구분한다. 새 profile에서만 좋아진 결과를 기존 gate 통과로 보고하지 않는다. 로컬 진단 성공과 최종 배포 동작 검증도 구분한다.

## 실행 순서

1. 최신 main/PR/CI/운영 SHA와 authoritative code path를 재확인한다. 위 시나리오의 baseline과 narrow reproduction을 만든다. 이미 실패하는 tests의 실제 assertion/fixture/service origin을 진단한다.
2. request lifetime, pending ownership, XY/scale cache coverage, immutable generation keys와 semantic ID 연결을 조사한다. 재사용 가능한 scene은 pending 읽기 중 유지하고 확정된 empty/selection 제거와 구별한다. 필요한 회귀 시험을 추가한다.
3. 원인에 따라 bounded 공간·scale buffer/인접 Level prefetch, local LOD interpolation, response merge, immutable cache reuse, in-flight coalescing/cancel을 비교·구현한다. prefetch는 현재 scene을 막지 않고 memory/network 상한과 역방향 탐색을 고려한다.
4. 브라우저 profile에서 geometry·labels·React·SVG paint 중 지배 비용을 찾아 줄인다. World-stable 계산은 Publication으로 이동할 수 있고 gesture-time은 transform·bounded visibility·interpolation 중심으로 좁힐 수 있다. 내부 구조 보존이 목표가 아니다.
5. 작은 checkpoint마다 diff review·관련 tests/build·secret 검사 후 commit/merge/deploy한다. deployed SHA·readiness·모바일 pan/zoom/selection/drawer를 확인하고 evidence와 CURRENT를 갱신한다. 전체 gate를 기다리지 않고 중간 URL을 제공한다.
6. 동일 profile before/after와 normal/delayed fetch, warm return, scale regression을 비교한다. 미달이면 원인을 따라 다음 구조적 변경까지 이어간다. 최종적으로 통과 범위·미달·측정 불가·실제 사용자 판단이 필요한 한계를 분리한다.

현재 다음 checkpoint의 구체적 순서는 다음과 같다.

- [x] 서버 cache/계측을 PR #307 `eaa9002`로 배포하고30회 격리 profile을 마쳤다. ready2099.7ms/4요청, 전체68요청, frame p95=68/76/96ms로 미달이다.
- [x] history quota·상세 read feedback을 분리했다. 최종 모바일3개에서 초기/Collection/Retry 각1회와 Back/Forward 단계 복원 통과. 라벨·point fade/reversal/prune/re-entry도 로컬 통과했다.
- [x] UI checkpoint를 PR #308 `a8e5f5…`로 배포하고 exact-SHA smoke·main CI·public A5·post-deploy와 actual compiler/4 기존 fixture 통과를 확인했다.
- [x] 같은 SHA에서 normal/blend-off/static short control을 격리 측정했다. blend는 유지하며 일반·blend-off 모두 frame p95 미달을 기록했다.
- [x] 여섯 번째 one-pass/HUD·idle camera·bounded 8-read 변경을 `0069c09…`로 배포하고 actual compiler/4 지연/touch 4개 시험을 확인했다. persisted 복원 완료는 별도다.
- [x] 같은 SHA에서 기본/DPR 1 CPU phase 및 visible/hidden/display-none 대조 실험을 기록했다. 기본 profile p95 미달·숨김 control 비수용을 명시했다.
- [ ] 기존 SVG 표현·blend·primary interaction을 유지하면서 drawing·React의 changing-scene 비용을 낮춘다. World preparation·bounds read를 주원인으로 오인하지 않는다.
- [x] dense10k continuation budget 수정을 built-app mobile에서 검증했다. 실제 drawer/HUD·262 Event·160+102 continuation·오류 0과 cold/repeat 관측을 보존했다. 별도 배포는 아직 대기다.
- [x] shared build·28개 기능 시험 성공을 PR #310으로 배포하고 exact-SHA smoke와 전체 CI 성공을 확인했다. 유효 cursor만 별도 허용하며 query·traversal 상한을 무제한 확대하지 않는다.
- [x] actual compiler/4 지연·반전·retained scene과 synthetic persisted 복원5개가 통과했다. 실제 iOS suspension/process eviction 검증은 별도로 열려 있다.
- [x] hull/text 분리 control과 Canvas/SVG 비교를 근거로 배경 graphics painter를 구현했다. Canvas ink·identity·rollback을 포함한6개 및 전체 모바일37개가 통과했다.
- [x] Canvas painter를 PR #311로 배포해 원래 DPR3/602frame/30회 profile을 측정했다. p95=62/59/60ms, max=122/125/75ms로 개선하지 못했다. 배경 raster 근사와 전체 device DPR 변경을 혼동하지 않는다.
- [ ] buffered background raster의 camera-only pan 재사용을 배포·측정하고 branch steady-pan CI와 sustained1000 실패를 진단·복구한다. 기능 시험 성공을 frame 통과로 바꾸지 않는다.
- [ ] 작은 checkpoint를 배포한 뒤 계측을 끈 같은 기본 profile의 short 및30회 방문·복귀,250/750ms 지연 경계를 측정한다. frame 미달이나 loading timeout을 보존하며 전체 gate 전에 완료로 판정하지 않는다.

## 중지·인계 기준

코드 작성, unit 성공, build 성공, 일부 smoke 성공만으로 완료하지 않는다. 명시한 목표 통과, 실측으로 확인한 환경/기기 한계, 또는 승인 범위 밖의 제품 의미·정책 결정이 blocker일 때 상태와 근거를 남긴다. 실기기 접근이 없으면 A4-B03을 열린 상태로 유지하며 독립적으로 가능한 코드·브라우저·운영 검증은 끝까지 수행한다. 장애·flaky·CI 실패는 먼저 에이전트가 진단·수정할 작업이다.
