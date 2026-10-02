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

- 첫 개선 checkpoint: [PR #304](https://github.com/neocjmix/moirai/pull/304), `8f9e31a`가 main에 병합됐고 운영 배포 중이다. bounded viewport/level cache·geometry prefetch 재사용과 기존 배치 결과를 보존하는 label 계산 축소를 포함한다. hull 전환·서랍 요청 생명주기 수정과 운영 재측정은 진행 중이다.
- 조사 시작 main: PR [#303](https://github.com/neocjmix/moirai/pull/303), `91cffca`. 조사 시작 시 운영 SHA도 동일했다. 이후 checkpoint 결과는 검증 후 이 섹션을 교체한다.
- 기능 기준: PR [#302](https://github.com/neocjmix/moirai/pull/302), `19de027`, Collection loader 교체 중 semantic label 이력 보존. [검증 근거](../evidence/ip012/mobile-label-continuity-2026-10-02.md#codex-cloud-review-and-rollout).
- #302의 unit 527 pass/2 skip, 핵심 quality 검사, 운영 모바일 4개와 인증 authoring smoke 성공은 해당 실행 범위의 결과다. 최신 #303 [CI 36961070802](https://github.com/neocjmix/moirai/actions/runs/36961070802)와 [post-deploy 36961544001](https://github.com/neocjmix/moirai/actions/runs/36961544001)는 실패로 확인돼 재진단 중이다. 앞선 smoke 성공으로 최신 실패를 가리지 않는다.
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
