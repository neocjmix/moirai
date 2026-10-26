# 현재 구현 상태

2026-10-26 UTC. **활성 실행 기준은 [IP-018 Layout Lab v2](IP-018-layout-lab-v2.md)다.** v1 전체 연구는 실패로 종료했다. 미완료 Force 튜닝·global-incidence·TSTL·Bubble Sets·Ribbon·Lanes/Aligned/Anchored·Organic Surface 후속은 **cancelled / superseded**다. [이전 CURRENT](CURRENT-HISTORY-THROUGH-LAB-V1.md)와 날짜별 evidence는 역사이며 재개 지시가 아니다.

## 현재 작업

사용자 교정에 따라 별도 합성 그래프 UI를 제거하고 **실제 GraphShell의 opt-in v2 + live Iteration 오버레이**로 교체했다. PR #370 / `addf7871e879c276ee832074b4d38fc3b604774e`가 구현을 소유한다. `/labs/layout-v2`는 실제 역사 Graph로 연결된다. 정확한 tick·드래그 중 갱신·시작/정지·되감기·Force 설정·JSON 재현을 제공하며, 요청 tick과 실제 그린 tick을 구분한다. 같은 카메라·시간 Y·Event 선택·Collection·기존 Y-sweep을 유지한다. [교정 및 검증 증거](../evidence/ip018-graph-overlay-2026-10-26.md)를 따른다.

고정된 public World 입력을 한 번 읽고 Worker에서 계산한다. 실제 r56은 539 Events / 430 물리 노드 / 109 Composite다. 기본 물리 모델과 두 물리 노드 사이의 직접 authored 관계만 연결했다. Composite/Collection 결집, 유형별 세부 Force 옵션, 저장된 전체 A/B 비교, 실제 iPhone 17 Safari/PWA 시각 승인은 아직 미완료다. **v2 기본 알고리즘 승격은 금지한다.** “현재 운영”은 기존 발행 기준선이다.

## 기준선·데이터

P0 PR #366 / `595830221bb250321f0c1d72d7070062480109a9`는 v1 직전 `4c726661c913de5920b9866344f2ca76e80a388d` (#323)를 근거로 Force X + 고정 시간 Y + Y-sweep을 선택적으로 복구했다. 전체 저장소 reset 없이 인증·데이터 무결성·IP-015 카메라·WebGL 렌더러·인프라 개선을 보존했다. [재조사](../evidence/ip018-baseline-audit-2026-10-25.md), [실행 증거](../evidence/ip018-execution-2026-10-25.md)가 상세 계보와 한계를 소유한다.

P0 Render 재발행은 2 World 성공·0 실패, 이전 generation은 immutable backup readback 후 보존됐다. 역사 r56과 합성 r62의 정본 pointer·source root는 유지됐고 one-shot 변수는 비웠다. `v5-world-layout/2`는 기존 bounded Force 버전이며 새 Lab v2가 아니다. 이번 GraphShell 통합은 정본 쓰기·발행·backfill을 하지 않는다.

## 배포·검증

실제 GraphShell 동작 검증 SHA는 `c8d4ecce6fc6ef08beafcf4dce4c0fadd02938bf` (PR #370·#371)다. Railway 세 서비스 SUCCESS, 실제 r56 desktop/mobile Chromium 2/2, 공개 mobile WebKit 오버레이·A3 탐색 4건·인증 smoke 전체 `40342804168` 성공을 확인했다. 두 World의 정본 pointer와 Render manifest hash는 변경되지 않았다.

전체 unit·PostgreSQL·빌드·보안 스캔과 오버레이 검증을 수행했다. `addf787`의 main CI는 unit 792(2 skip)·통합 49·mobile WebKit 68(1 skip)·Render 연속성 11 통과다. `c8d4ecc`의 첫 CI에서는 A5 기존 탐색의 WebKit 취소 요청/access-control console 검사가 실패해 재실행했으며, 기록을 숨기지 않는다. 의존성 audit의 기존 critical 2/high 7도 남아 있다.

첫 World 입력 로딩은 초기 공개 검증에서 120초를 초과했다. 마지막 [PR #372](https://github.com/neocjmix/moirai/pull/372)는 필요한 content/temporal 범위만 검증하며 최대 64개 steady read로 읽고, 단계별 시간·읽기 수를 계측한다. 최신 배포 SHA와 첫 로딩 실측은 해당 PR 설명 및 공개 상태 페이지를 따른다. Iteration 조작은 입력 로딩 뒤 Worker 내부에서 동작하며 매 tick 서버 읽기를 하지 않는다.

- [실제 역사 Lab v2](https://moirai-production-8ed1.up.railway.app/labs/layout-v2)
- [기본 역사 Graph](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc)
- [공개 배포 상태](https://moirai-production-8ed1.up.railway.app/status-public)
- [새 세션 인계](IP-018-codex-handoff.md)

공개 Atropos는 개발·검수 환경이다. 실제 iPhone 17 Safari/PWA 검수는 자동 에뮬레이션으로 대체하지 않는다. IP-012의 성능 튜닝 종료와 deferred frame/heap 수치는 유지한다. #337 renderer 문서 PR은 무관한 open 작업이며 닫지 않는다.
