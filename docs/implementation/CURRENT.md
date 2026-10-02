# 현재 구현 상태

2026-10-02 KST. 이 파일은 현재 상태만 소유한다. 이전 checkpoint는 [PR #303까지의 이력](CURRENT-HISTORY-THROUGH-PR303.md), 검증 수치는 각 evidence 문서에 보존한다.

## 실행 원칙과 활성 목표

사용자는 모바일로만 진행하며 코드를 직접 리뷰하지 않는다. Codex Cloud에서 구현·검증하고 **production에 작은 checkpoint를 자주 배포**한다. 미완료·일부 CI 실패·clean tree 미달은 배포 가능한 checkpoint를 막지 않는다. 이번 성능·표현 전환 작업의 쓰기·merge·배포와 incident 대응은 사전 승인됐다. [AGENTS](../../AGENTS.md)와 [IS-001](IS-001-agent-mobile-strategy.md)이 여러 세션에 적용되는 실행 규칙을 소유한다.

현재 우선 작업은 [IP-012 모바일 성능·표현 연속성](IP-012-mobile-continuity-plan.md)이다. 기존 UI 문법을 유지하며 추가 fetch를 의식하지 않는 탐색과 hull ↔ ordinary point ↔ small point ↔ hidden 전환을 목표로, 진단→개선→실제 브라우저 검증→배포를 반복한다. A4 수치 기준을 완화하지 않는다. Google Maps는 질적 체감 기준이며 실제 측정 없는 동등성 주장은 하지 않는다.

## 단계

- **IP-011 A1–A3 완료. A4 종료·잔여 백로그 이관:** 전체 성능 통과 아님. [A4-B01–03](IP-011-A4-closeout-backlog.md)의 지속 frame, 반복 region 계산, 실기기·heap 증거를 후속 작업에서 판정한다.
- **A5 활성·미완료:** World/주제 HUD, 선택 수 제한 제거, Semantic/Geographic 분리와 일부 label/interaction 개선 구현. capacity·가독성·pin·자동 relevance·전체 catalog는 열린 상태다.
- **IP-012 활성·미완료:** 기존 GraphShell에 Render 데이터를 공급한다. 고정 signed grid와 manifest 없는 viewport 읽기는 #301로 병합·배포됐다. 현재 우선순위는 모바일 frame, 데이터/표현 identity, fetch·LOD 전환 연속성이다.
- A6/M5·대량 역사 입력은 비활성이다. 성능 개선 승인은 이 별도 제품 범위를 자동 활성화하지 않는다.

## 현재 checkpoint와 조사 기준선

- **현재 운영:** [PR #306](https://github.com/neocjmix/moirai/pull/306), `de8d60811fba7866bc69801c97457f7f957a6261`. 과도한 prefetch refill 경계 수정, bounded pan hull/spline 재사용, World geometry identity 공유, 넓은 viewport 복원, compiler/4 browser CI를 배포했다. exact-SHA smoke 통과. branch CI는 성공했으나 main CI의 모바일 flow와 A5 운영 checkpoint는 실패했다.
- **지속 성능 미달·진단 중:** #305의 30 visits/start·middle·return602frame p95=84/95/121ms,382 Render 요청을 재현했다. #306에서 요청 증폭 원인은 수정했지만 운영 재측정 두 번 모두 초기 loading timeout으로 frame 결과를 얻지 못했다. Railway render 응답3.4–11.9초, canonical read8–120ms를 관측했다. 배포 성공을 성능 통과로 해석하지 않는다.
- **다음 checkpoint 검증 중:** SHA로 고정된 Render generation이 서버 immutable cache에서 빠진 원인을 수정하고 Server-Timing을 추가했다. 상세 read action identity·복원 중복 호출과 라벨/point 등장·퇴장 전환도 모바일 브라우저에서 검증 중이다. [진행 evidence](../evidence/ip012/mobile-continuity-2026-10-02.md).
- 기능 출발점은 [#302](https://github.com/neocjmix/moirai/pull/302) `19de027`의 Collection 변경 시 semantic label 연속성이며, 조사 기준선은 [#303](https://github.com/neocjmix/moirai/pull/303) `91cffca`다. #304 `8f9e31a`의 isolated602frame p95=49/49ms도33.4ms 기준 미달이다. 과거 checkpoint와 개별 검증 범위는 evidence에 보존한다.
- World `01995c2a-7b00-7000-8000-000000000101`: Revision 62, 30 Collection, 677 placed/2 unplaced Event. 공개 Render generation은 `render-compiler/4`, `7b3c2fd8…`다. 데이터 수량은 새 입력·백필 전 다시 확인한다.

## 읽기 구조와 불변식

World가 Event identity·transaction·Revision·access 경계다. Collection은 사건 소유자가 아닌 선택 집합이며 공유 Event를 복제하지 않는다. Event/Collection은 각각 독립 Narrative 하나를 갖고 membership 없는 Event는 허용한다. 작성된 contains/Composite 의미, World 좌표, 기존 hull·label·relation·HUD·drawer·camera 동작을 보존한다.

Lachesis는 bounded 표현 후보·작성된 ancestry·geometry support를 준비하고 Atropos는 화면상의 visibility·보간·interaction을 담당한다. 기본 GraphShell은 검증된 v3/v4 Render 데이터를 기존 painter에 공급한다. compiler v4는 `render-publication/2` 고정 signed grid를 사용하며 viewport representation→필요 geometry의 두 단계 읽기를 지원한다. 전체 manifest는 일반 viewport 읽기의 선행 조건이 아니다. `?tileData=0`은 semantic rollback, `?renderTiles=1`은 별도 tile scene 관측 경로다.

## 남은 주요 작업

1. 활성 [모바일 연속성 계획](IP-012-mobile-continuity-plan.md)의 baseline·delayed-fetch·identity·frame gate와 최신 모바일 실패 진단.
2. A5 capacity/200% text·접근성 검증 후 pin/contextual activation/전체 catalog와 탐색 surface.
3. Render generation 증분 재사용·invalidation, 지속 수정/재시작 scheduling 검증. 현재 full compile을 증분 완료로 표현하지 않는다.
4. 실제 단말 장시간 touch·heap 및 1k/10k/100k 성능 증거. CI WebKit emulation과 직렬화 cache bytes를 실기기·heap으로 대체하지 않는다.

- [Atropos 모바일](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01995c2a-7b00-7000-8000-000000000101)
- [Clotho](https://desirable-vitality-production-eb95.up.railway.app)
- [Render architecture decisions](../architecture/ADR-012-render-read-architecture.md)
