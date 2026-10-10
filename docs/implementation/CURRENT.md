# 현재 구현 상태

2026-10-10 UTC. **IP-015 realtime camera / eventual scene checkpoint가 현재 실행 범위다.** 이 파일과 [IP-015](IP-015-realtime-camera-eventual-scene.md)가 실행 상태·요구사항을 소유한다. [이전 CURRENT](../evidence/ip015/current-before-2026-10-10.md)는 역사 기록이다.

## 활성 checkpoint

실제 iPhone 17 비교로 renderer 선정은 종료됐다. production은 custom WebGL2다. 새 renderer 탐색·Pixi/Three 최적화는 종료하며 비교 코드·의존성·selector를 제거한다. 좁은 Moirai scene/backend/lifecycle 경계는 유지한다.

**Camera is realtime; scene consistency is eventual.** live camera를 ref/channel로 renderer와 committed native SVG에 RAF마다 적용한다. cheap support 검사는 32ms, geometry/representation/label scene은 120ms cadence로 따라오며 96px prepared overscan 안의 64px 이하 일반 pan은 camera-only다. settle/inertia 종료 시 최신 full scene을 비동기로 시작하고 stable scene을 계속 표시한 뒤 atomic하게 교체한다. 축별 scaleX/scaleY·viewport origin을 보존하고 native 글자·halo·점 크기는 CSS-pixel convention을 유지한다.

넓은 화면의 zoom-out은 Composite 후보를 확대하며 이후 pan에서도 clipping/label/representation 작업을 반복했다. parent closure가 화면 밖 sibling preparation까지 포함하는 경로를 support bounds로 cull한다. 필요한 ancestry span과 완전한 원본 support는 보존하며 retained contour/mesh/paint는 bounded lifecycle로 줄인다. LOD threshold는 바꾸지 않는다.

padded contour/spline·label-path 준비는 전용 Worker와 worker-owned cache로 이동한다. typed-array transfer, 실행 중 1개+최신 대기 1개, generation/loader/revision/Collection guard를 사용한다. renderer는 main thread에 유지한다. Gaussian은 [raw WebGL 후속](../evidence/ip014/gaussian-technique-followup.md)으로 남기며 Three dependency를 유지하지 않는다.

[원인·계측·검증 evidence](../evidence/ip015/checkpoint-2026-10-10.md)와 implementation PR이 checkpoint를 소유한다. 최종 merge/deployed SHA와 공개 smoke는 PR 및 [`/__status`](https://moirai-production-8ed1.up.railway.app/__status)에서 관측한다. **다음은 iPhone 17 Safari/PWA에서 사용자 체감 검증이며 그 결과를 기다린다.** Cloud software GPU 수치를 실제 iPhone 성능으로 해석하지 않는다.

## 배포·검증 기준선

작업 시작 main·공개 배포는 `1d804beb5d19833a1e252e69922545b329d35546` (#340), PR #339 문서는 미병합이었다. 공개 역사 World의 최신 관측은 r54다. 기존 CI는 Next.js high advisory audit, authenticated Clotho policy smoke에서 실패했다. IP-015 focused regression 결과와 그 기존 실패를 구분한다.

- [모바일 역사 Graph](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc)
- [Public status](https://moirai-production-8ed1.up.railway.app/status-public)
- [독립 Layout Lab](https://moirai-production-8ed1.up.railway.app/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc&revision=26)

## 유지하는 범위·불변식

IP-013 R/Layout Lab 구현·W/C·실제 역사 pilot은 보존한다. Lab은 production main UX와 격리되고 canonical 후보 채택·설정 승격·backfill·Collection 자동화는 활성화하지 않는다. IP-012의 2026-10-04 체감 수용·성능 종료는 역사적 기준선이며 이번 사용자 지시는 IP-015만 별도로 활성화한다. 이전 frame gate 미달만으로 다른 최적화를 재개하지 않는다.

World는 Event identity·transaction·Revision·access 경계, Collection은 선택 집합이다. authored contains·좌표·표현 단계·HUD·선택·drawer·Publication 계약은 유지한다. IP-015는 canonical data, Publication generation/served pointer, authored layout과 hierarchy 의미를 변경하지 않는다. M5·새 governance·다중 Publication 제품은 비활성이다.
