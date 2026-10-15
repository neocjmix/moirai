# 현재 구현 상태

2026-10-15 UTC · **IP-017 Organic Surface 첫 슬라이스를 기존 Layout Lab에 배포했다.** [공개 임진왜란 비교](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=organic&organicBaseline=anchored&gsViewport=260,223420,650,1800)는 절충의 고정 XY에 수직·관계 필드, 독립 중첩 패딩, 기본/패딩/중첩 검수와 JSON 재현을 제공한다. PR #363/#364, 최종 리뷰 소스 `75da0ac`, 공개 확인 runtime `a5c5a9`(14:34 UTC). 같은 형태 설정의 카메라·선택 복원은 재계산하지 않는다. main CI unit1,020·PostgreSQL49·mobile/continuity·build·secret scan과 인증 포함 post-deploy smoke 통과. 공개 desktop/mobile Chromium의 조절·JSON 재현·선택 검증은 통과했고, mobile WebKit은 3개 역사 뷰 비교 후 전체→상세 복귀에서 멈춰 전체 세션 검증이 미완료다. 신규 WebKit 세션도 3개 표시·반경 재계산 후 JSON 재적용 중 연결이 종료되어 재현·후속 선택은 미검증이다. [날짜별 증거](../evidence/organic-surface-lab-2026-10-15.md)가 실제 r56·위상 반례·시각 결과와 한계를 소유한다. 기존 후보·운영 기본값·역사 pointer·Render manifest·고정 asset을 보존했다. WebKit 전체→상세 전환·JSON 재적용, 조밀한 색 중첩, 비소속 glyph 회피에 따른 패딩 손실, 실제 iPhone17 Safari/PWA 검증이 남으며 **시각 완성도는 사용자 승인 전**이다. 후속 슬라이스나 기본값 승격은 진행하지 않는다. 이후 증거·검증 스크립트 전용 배포 SHA는 공개 `/status-public`이 소유한다.

2026-10-13 UTC · **X 배치 3종을 운영 Settings → Labs에 추가했다.** [분리·흐름·절충 비교](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=anchored&gsViewport=260,223420,650,1800)는 실제 GraphShell에서 동일 r56·539 Event ID·원래 시간 Y·DAG·Collection을 유지한다. PR #359, 리뷰 소스 `cea4a74`, 배포 SHA `85a5d11`; main CI와 인증된 post-deploy smoke, 공개 desktop/mobile Chromium·WebKit 3/3(오류0) 통과. [배포·시각 비교·한계 증거](../evidence/tstl-positioned-product-lab-2026-10-13.md)가 상세 결과를 소유한다. 기본 운영 레이아웃과 역사 served pointer는 그대로다. 분리는 독립 역사를 벌리지만 옆 이동이 커지고, 흐름은 이동을 줄이지만 국가 방향이 약해지며, 절충은 국가별 독립 구간을 좁은 corridor에 유지한다. 모바일 drawer를 가리던 확장 Labs 바는 선택 중 숨기고 drawer 헤더 안의 작은 선택기로 후보 전환·현재 운영 복귀를 유지한다. 조밀한 임진왜란 면 중첩·공유 흐름·실제 iPhone17 Safari/PWA 검증은 남아 있고 기본값 승격은 하지 않는다. 합성 A4 최종 15개 job 중 2개 Collection frame gate는 미달이다. 후속 문서 전용 SHA는 공개 `/status-public`이 소유한다.

2026-10-13 UTC · **B0 좌표의 버블·리본을 운영 실험실에 배포하고 공개 검증했다.** [버블](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=bubble&gsViewport=260,223420,650,1800)·[리본](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=ribbon&gsViewport=260,223420,650,1800)은 같은 539 Event XY와 실제 외곽·hole을 보존한다. [IP-016](IP-016-tstl-product-lab.md) / PR #356·#357, 최종 소스 `09e7ecd`, 공개 검증 runtime `14895db`. 공개 desktop/mobile Chromium·WebKit 3/3(오류0), main CI unit970·PostgreSQL49·mobile75·continuity11 통과. [비교·배포·한계 증거](../evidence/tstl-smooth-product-lab-2026-10-13.md)가 결과를 소유한다. 두 후보 각각 1,210 소속은 nominal glyph 면 포함, 180개는 목록 대체다. 기본값·역사·served pointer는 유지하며 이전 A/B/C는 설정에 남긴다. 합성 성능 기준 일부 미달, 조밀한 색 중첩·리본의 일부 각진 경계와 완전한 의미 인증·실제 iPhone17 Safari/PWA 미검증이 남는다. 다음은 실제 기기의 가독성 비교이며 기본값 승격은 하지 않는다. 문서 전용 후속 SHA는 공개 `/__status`가 소유한다.

2026-10-13 KST · **이전 B/C checkpoint — TSTL 후보 B/C를 운영 실험실에 배포했다.** [설정](https://moirai-production-8ed1.up.railway.app/graph/settings?world=01a107fb-4018-7fcb-8390-836a40fa91cc)과 그래프의 현재/B0/A/B/C 버튼에서 같은 r56의 B 분기 면, C 중심선·소속 연결·국소 면을 비교한다. 리뷰 소스 `c175451`, 공개 runtime SHA `85bf228`(PR #353/#354); [배포·검증·비교와 한계](../evidence/tstl-bc-product-lab-2026-10-13.md)가 상세 결과를 소유한다. 공개 desktop Chromium·mobile Chromium/WebKit 3/3(오류0), 최종 CI unit933·PostgreSQL49 통과. 539 Event ID·원래 Y, A와 같은 B/C X, 운영 기본값·역사·served pointer를 유지한다. 면은 의미 인증 전의 실험 표현이며, 실제 iPhone17 Safari/PWA 검증은 남는다. 이후 문서 전용 배포 SHA는 공개 `/__status`로 확인한다.

2026-10-13 KST · **이전 A 단독 checkpoint — TSTL 제품 실험실을 운영에 배포하고 공개 검증했다.** [설정](https://moirai-production-8ed1.up.railway.app/graph/settings?world=01a107fb-4018-7fcb-8390-836a40fa91cc)에서 현재 운영 / r56 B0 / 후보 A를 선택하고 기존 GraphShell의 면·축별 확대·순차적 비가시화·Collection·선택·drawer로 비교한다. [IP-016](IP-016-tstl-product-lab.md)이 사용자 승인 범위를, [배포·비교·한계 증거](../evidence/tstl-product-lab-2026-10-13.md)가 결과를 소유한다. 리뷰 소스 `0c55135`, PR #351의 최초 배포·공개 검증 SHA `131611f`. 공개 desktop Chromium 및 mobile Chromium/WebKit 3/3 통과, 오류 0. 539 Event의 ID·원래 Y를 보존하며 A는 105개 면/1,207 fragment와 4개 점 fallback을 표시한다. 실험 면의 의미 검증은 미완료이며 실제 iPhone17 Safari/PWA 검증은 남는다. 기본값·역사·served pointer·Render manifest·B/C는 변경하지 않았다. 이후 문서 전용 배포의 SHA는 공개 `/__status`로 확인한다.

2026-10-13 KST · **TSTL B0/A 독립 프리뷰를 별도로 배포했다.** [프리뷰](https://neocjmix.github.io/moirai/tstl-candidate-a/)는 실제 history-r56의 단일 539 Event·시간 Y를 보존하며 국가 history·임진왜란·이순신 공유 관계를 비교한다. 런타임 소스 `4ffb47c`, Pages 배포 `939e16d`; [증거와 한계](../evidence/tstl-candidate-a-preview-2026-10-13.md)가 검증 결과를 소유한다. 당시 프리뷰의 fail-closed 의미 인증 정책으로 B0/A 모두 의미 면 0, 선·포트·목록 fallback이었다. scalar-only provenance가 면 생성을 막는다는 뜻은 아니며, 후속 IP-016은 검증 미완료 실험 면을 별도로 표시한다. 제한된 A 구현이며 B/C·운영 기본값·served pointer·역사는 변경하지 않았다. 이 프리뷰의 배포·검증 수치는 당시 증거로 보존하며, 후속 제품 통합은 PR #351과 IP-016을 따른다.

2026-10-12 UTC. **Clotho 인증·CI 복구를 완료했다.** [인증·CI 복구 증거](../evidence/clotho-oauth-2026-10-12.md)가 결과와 검증 한계를 소유한다. PR #347 / `f52b8d9`로 v5 OAuth metadata·World 인가 회귀와 Next high advisory를 수정했고, PR #348 / `8eea159`로 CI smoke를 지정 GitHub Actions workflow·main·기존 World에 한정된 5분 OIDC 인증으로 복구했다. 운영 3개 서비스와 main CI·인증된 smoke는 문서 후속 커밋 `ab4b1d5`까지 검증됐다. Auth0 관리 조회로 실제 code 교환·수 시간 간격 refresh 성공과 정확한 audience·scope를 확인했다. 사용자는 05:17 UTC 새 대화의 Moirai Live 조회 성공을 확인했고 운영 API에도 HTTP 200이 기록됐다. 남은 오류는 기존 대화가 유지하던 연결 상태에 한정됐다. Auth0 설정·토큰 수명·rotation을 바꾸지 않았으며 사용자 인증은 Auth0를 유지한다. 도구 metadata 변경 후 Refresh와 새 대화 검증이 운영 절차다.

전역 incidence의 운영 승격·전체 Render 재발행은 아래 완료 상태로 보존한다. IP-015 realtime camera / eventual scene은 보존하는 렌더러 기준선이다. 이 파일과 [IP-015](IP-015-realtime-camera-eventual-scene.md)가 실행 상태·요구사항을 소유한다. [이전 CURRENT](../evidence/ip015/current-before-2026-10-10.md)는 역사 기록이다. 이번 인증·CI 작업은 deferred 모바일 성능 튜닝·canonical 역사 편집을 재개하지 않는다.

## 전역 incidence 운영 승격 — 배포·전체 재발행 완료

2026-10-10 사용자는 GitHub Pages의 `전역 incidence · 데이터 기반 중심`을 운영에 배포하고 전체 퍼블리싱하도록 명시적으로 요청했다. 이는 이전 Lab-only/no-backfill 경계를 이 후보에 한해 대체한다. 모든 공개 v5 World의 served Revision과 모든 Time System에서 전체 Render generation을 재생성한다. 역사 정본·Revision·Event identity·시간 Y는 그대로이며 membership은 World-wide X 계산 입력이다. 선택/줌/패닝 중에는 solver를 실행하지 않는다.

[연구 보고서](../evidence/ip013/collection-layout-experiment-v2.md)는 당시 실험 결과이고 [승격·발행 증거](../evidence/ip013/global-incidence-rollout.md)가 현재 배포 상태·결과와 롤백을 소유한다. 고정된 Render grid/compiler v4와 IP-015 GraphShell을 재사용한다. 운영 확인은 아래 역사 Graph URL이다. 이번 변경으로 Collection discovery·canonical 역사 편집·M5·성능 튜닝을 재개하지 않는다.


PR #345 / `45c637bce8e7730f562d0a7842ff9d9e1dbac03c`로 후보를 배포했다. 전체 재발행은 World 2개·Time System 2개, 실패 0건으로 완료했다. 역사 r56 / 539 Event·7 Collection·source root를 보존하며 공개 430 point XY·109 Composite bounds가 reviewed 결과와 exact 일치한다. 공개 readiness와 desktop/mobile Chromium 탐색은 통과했다. 이전 generation backup을 보존하고 one-shot 설정을 비웠다. Lab copy 누락 회귀는 PR #346에서 수정하고 기존 Lab 화면 8개·새 전역 후보 replay 1개를 확인했다. 기존 dependency audit / authenticated Clotho smoke 실패와 실제 iPhone17 Safari/PWA 미검증은 남아 있다.

## IP-015 보존 checkpoint

실제 iPhone 17 비교로 renderer 선정은 종료됐다. production은 custom WebGL2다. 새 renderer 탐색·Pixi/Three 최적화는 종료하며 비교 코드·의존성·selector를 제거한다. 좁은 Moirai scene/backend/lifecycle 경계는 유지한다.

**Camera is realtime; scene consistency is eventual.** live camera를 ref/channel로 renderer와 committed native SVG에 RAF마다 적용한다. cheap support 검사는 32ms, geometry/representation/label scene은 120ms cadence로 따라오며 96px prepared overscan 안의 64px 이하 일반 pan은 camera-only다. settle/inertia 종료 시 최신 full scene을 비동기로 시작하고 stable scene을 계속 표시한 뒤 atomic하게 교체한다. 축별 scaleX/scaleY·viewport origin을 보존하고 native 글자·halo·점 크기는 CSS-pixel convention을 유지한다.

넓은 화면의 zoom-out은 Composite 후보를 확대하며 이후 pan에서도 clipping/label/representation 작업을 반복했다. parent closure가 화면 밖 sibling preparation까지 포함하는 경로를 support bounds로 cull한다. 필요한 ancestry span과 완전한 원본 support는 보존하며 retained contour/mesh/paint는 bounded lifecycle로 줄인다. LOD threshold는 바꾸지 않는다.

padded contour/spline·label-path 준비는 전용 Worker와 worker-owned cache로 이동한다. typed-array transfer, 실행 중 1개+최신 대기 1개, generation/loader/revision/Collection guard를 사용한다. renderer는 main thread에 유지한다. Collection/query 전환도 준비된 replacement가 올 때까지 committed source를 유지하며, camera job에 대체된 유효한 query priming은 재시도한다. Gaussian은 [raw WebGL 후속](../evidence/ip014/gaussian-technique-followup.md)으로 남기며 Three dependency를 유지하지 않는다.

[원인·계측·검증 evidence](../evidence/ip015/checkpoint-2026-10-10.md)와 implementation PR이 checkpoint를 소유한다. 최종 merge/deployed SHA와 공개 smoke는 PR 및 [`/__status`](https://moirai-production-8ed1.up.railway.app/__status)에서 관측한다. **다음은 iPhone 17 Safari/PWA에서 사용자 체감 검증이며 그 결과를 기다린다.** Cloud software GPU 수치를 실제 iPhone 성능으로 해석하지 않는다.

## 배포·검증 기준선

IP-015 작업 시작 기준선은 `1d804beb5d19833a1e252e69922545b329d35546` (#340)이었다. 이번 승격 시작 시 main·공개 배포는 `da75b82dbad83b830aac7d6363756baa4a702a44`이며 공개 역사 World는 r56, Event 539개·Collection 7개다. 기존 CI는 Next.js high advisory audit, authenticated Clotho policy smoke에서 실패했다. IP-015 focused regression 결과와 그 기존 실패를 구분한다.

- [모바일 역사 Graph](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc)
- [Public status](https://moirai-production-8ed1.up.railway.app/status-public)
- [독립 Layout Lab](https://moirai-production-8ed1.up.railway.app/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc&revision=26)

## 유지하는 범위·불변식

IP-013 R/Layout Lab 구현·W/C·실제 역사 pilot은 보존한다. Lab의 조절은 production main UX와 격리된다. 사용자 승인한 전역 incidence만 canonical 후보로 승격하고 전체 Render backfill을 수행한다. Collection 자동화는 활성화하지 않는다. IP-012의 2026-10-04 체감 수용·성능 종료는 역사적 기준선이며 이전 IP-015 지시와 이번 전역 incidence 승격 지시는 별도 실행 범위다. 이전 frame gate 미달만으로 다른 최적화를 재개하지 않는다.

World는 Event identity·transaction·Revision·access 경계, Collection은 선택 집합이다. authored contains·좌표·표현 단계·HUD·선택·drawer·Publication 계약은 유지한다. IP-015는 canonical data, Publication generation/served pointer, authored layout과 hierarchy 의미를 변경하지 않는다. M5·새 governance·다중 Publication 제품은 비활성이다.
