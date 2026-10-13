# TSTL B/C 제품 실험실 · 2026-10-13

[IP-016](../implementation/IP-016-tstl-product-lab.md)의 후속 사용자 승인으로 후보 B/C를 기존 선택형 실험실에 추가했다. 이전 A 배포 증거와 독립 Pages 프리뷰는 보존한다. 기본값, 역사 정본, Collection membership, served pointer와 기존 Render manifest는 변경하지 않았다.

## 접근과 배포 식별

- [후보 B · 임진왜란](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=B&gsViewport=300,223420,1400,1800)
- [후보 C · 임진왜란](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=C&gsViewport=300,223420,1400,1800)
- [설정 → 실험실](https://moirai-production-8ed1.up.railway.app/graph/settings?world=01a107fb-4018-7fcb-8390-836a40fa91cc)
- 리뷰 소스 `6044c93fe488da3184f2d030de09eaf85c8fb27a`, [PR #353](https://github.com/neocjmix/moirai/pull/353).
- main 병합 `8f5e505a804ea8aebaf4c0540a0918dc0329a33f` (2026-10-13 03:47:42 UTC). 이 최초 checkpoint는 공개 desktop Chromium/mobile Chromium/mobile WebKit3/3 검증을 통과했다.
- 최종 가시성 보완 소스 `c1754519ce7fc689b6c9a31ecf60b0b5891b21d1`, [PR #354](https://github.com/neocjmix/moirai/pull/354), main 병합 `85bf228237647337ca381957cc88d5612176c761` (03:57:06 UTC). 최종 공개 결과는 아래 기록한다.

새 인프라·viewport 발행·runtime solver 없이 기존 main 자동 배포를 사용한다. Railway의 무관한 `render-geometry-inspector` staged patch는 적용하지 않는다.

## 같은 좌표에서의 비교

모든 후보는 고정 history-r56의 539 Event와 원래 Event/Composite anchor Y를 보존한다. B/C는 A와 동일한 X를 사용한다. B0 primitive와 A geometry는 기존 artifact와 정확히 같다. 오프라인 변경은 표현 방식뿐이다.

| 비교 항목 | A | B | C |
|---|---:|---:|---:|
| 면이 있는 Composite | 105 | 109 | 109 |
| 면 fragment | 1,207 | 3,159 | 1,390 |
| 열린 trace | 0 | 1,185 | 691 |
| 공통 leaf→ancestor 소속 pair | 1,390 | 1,390 | 1,390 |
| 공통 소속의 경로 연결 | 해당 없음 | 1,312 | 471 |
| 공통 소속의 목록 대체 | 해당 없음 | 78 | 919 |

B는 비소속 leaf glyph를 피하는 결정적 rectilinear terminal forest를 만든다. 최대 32 terminal/window, 65,536 vertex, 총 2,000,000 expanded state cap을 두며 r56에서 최대 9,000 vertex와 1,097,203 state를 사용했다. 133 window 중 11개가 예산에 걸렸고 6개 큰 Composite는 분리된 forest를 갖는다. tube union을 내부가 겹치지 않는 직사각형으로 분할해 중복 alpha 누적을 피한다. 78개 목록 대체는 `UNKNOWN_BUDGET` 72개와 `LOCAL_CELL_ONLY` 6개다. 고립된 seed는 실제 경로 연결 수에 포함하지 않으며 주변 면은 유지한다. 연결된 terminal 수는 선 개수나 World 전체의 한 연결 면 개수가 아니다.

C는 안정된 spine 위치, nonmember gap, 두 번 이내로 꺾이는 membership 연결과 430개 leaf 주변 atom cell을 사용한다. 144개 spine 조각, 완전히 가려진 spine 2개, membership trace 547개다. Composite header까지 포함한 전체 1,673 pair에서는 547개 경로/1,126개 목록이며 위 표는 같은 1,390 leaf pair로 제한했다. 목록 사유는 `NO_TWO_BEND_PATH` 955개, `DENSE_MEMBERSHIP_PORTS` 166개, `SPINE_OCCLUDED` 5개다. 장애물 index는 정확한 segment 검사를 생략하지 않으며 2,000,000 cap 중 669,744 검사를 수행해 예산 초과 없이 종료했다.

B/C 모두 한국사·일본사·중국사·임진왜란·이순신의 실제 공유 Event를 보존한다. 교차선에 새 Event·contains edge·hit target을 만들지 않는다. 생략된 연결은 설정의 정확한 소속 목록, 사유, 30행 pagination과 원래 `gsEvent` 링크로 확인한다.

## 렌더링과 상호작용

`preparedWorldRings`와 `preparedWorldTraces`를 schema→worker→cache→GraphShell까지 그대로 전달한다. 면은 독립 ring만 채우며 spline/padding/feather를 추가하지 않는다. 열린 trace는 SVG/Canvas/WebGL 공통의 live SVG overlay로 그린다. 닫거나 fill하지 않고, 독립 축 camera transform·owner opacity·기존 단계 변화에 맞춘다. 선 교차를 관계로 선택하는 hit target은 없다.

고정 도형의 가시성 범위는 실제 ring·trace·원래 point anchor로 별도 계산한다. 점 단계 admission도 ink 밖의 원래 anchor를 유지하며, hull 크기와 의미상 시간 bounds는 바꾸지 않는다. 의미 bounds밖의 도형이 선택에서 빠지는 경우는 synthetic unit으로 재현했고, 중국사 spine-only 공개 camera는 positive 회귀다. 최초 배포에서도 이 공개 case는 padding/ancestry로 유지됐으므로 공개 실패 재현이라고 주장하지 않는다.

기존 축별 확대·패닝·Collection 선택·밀도 전환·Event 선택·drawer를 재사용한다. 그래프의 현재/B0/A/B/C 버튼은 drawer 위에서도 동작하고, 활성 모드의 색 대비와 44px touch target을 유지한다. 브라우저·World 로컬 선택이며 새 기본 세션은 실험 asset을 요청하지 않는다. asset은 client lifetime 안에서 한 번 읽어 후보·Collection 전환에 재사용하며 새로고침 또는 새 root mount의 캐시 요청은 별개다.

## 재현과 정적 검토

- 최종 asset `/labs/tstl/r56-cc8a5617fc632dad.json`, SHA-256 `cc8a5617fc632dadb817ee9a3a4db59709ed6381f6110761b34b06dbd38583ac`.
- Raw 2,300,355 bytes, 오프라인 gzip 337,418 bytes. gzip 수치는 실측 wire latency나 전송 크기 주장이 아니다.
- 실제 fixture byte SHA-256 `5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64`, source root `d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54`.
- offline exporter가 정본 변경 없이 최종 asset bytes를 정확히 재생성하는 통합 회귀를 추가했다.
- 독립 검토에서 Event ID/XY, 전체 leaf 소속, trace owner ancestry, B0/A 동일성을 확인했다. rehashed source/scope/좌표/소속 누락/가짜 trace ownership도 거부한다.
- B 11개, C 9개, renderer 관련 58개, exporter/client/B 최종 묶음 26개 테스트가 통과했다. 묶음 간 겹침이 있어 합산하지 않는다.
- 로컬 strict typecheck/lint/format/경계 검사/production build 통과. 커밋 secret scan은 clean, audit high/critical 0(기존 moderate 9).
- 전체 로컬 unit run은 926 pass/2 skip/기존 시간 의존 CI OIDC 1 failure였다. 단독 OIDC 재실행 3/3 통과. 최초 배포 main CI38343384170은 전체 통과했고 리뷰 소스6044c93 CI38343341372의 unit931/2skip, PostgreSQL49, mobile75, continuity11이 통과했다. 최종 main [`85bf228` CI38344110654](https://github.com/neocjmix/moirai/actions/runs/38344110654)도 전체 성공이다. unit 933 pass/2 skip, PostgreSQL 49 pass, mobile 74 pass/1 flaky(재시도 통과)/1 skip, compiler continuity 11 pass이며 type/lint/format/build/audit/secret 검사를 포함한다. flaky는 `a5-context-hud.spec.ts:52` mobile-safari case였다. A5 공개 checkpoint도 4개 통과했다.
- 배포 전 desktop/mobile Chromium 실제 제품 bootstrap 진단은 통과했다. 이 진단은 당시 geometry가 같은 이전 asset `af858880…`였으며, 최종 B의 6개 고립 seed 목록 수정과 활성 버튼 색 대비는 최종 공개 검증에 포함한다.

## 공개 검증

최종 runtime `85bf228`에서 **desktop Chromium(1280×800), mobile Chromium 및 mobile WebKit(각390×844) 3/3 통과**했다. 각 프로필 runtime error 0, HTTP failure 0, 가로 overflow 0이다. [공개 검증 요약](tstl-bc-product-2026-10-13/public-smoke.json)은 소스·배포 SHA, 실제 painter/trace 수, 카메라와 선택 보존 관측을 담는다.

- B0/A/B/C 전환, A/B/C의 면과 열린 선, 가로·세로 독립 확대, 기존 밀도/표현 단계 전환을 확인했다. 사건을 선택한 채 후보를 바꾸고 drawer를 유지했다.
- 각 후보에서 Collection 7→6→7 전환, 한국사·일본사·중국사·임진왜란·이순신 5개 실제 case의 동일 Event 상세를 확인했다.
- B 78개/C 1,126개 목록 대체의 정확한 수, Composite별 펼치기·pagination, 원래 Event로 이동·선택, 후보 모드 보존을 확인했다.
- 동일 client lifetime의 후보/Collection 전환은 asset을 추가 요청하지 않았다. 후보별 reload 유지, 새 기본 세션의 asset 요청0도 확인했다.
- 중국사의 의미상 Y범위 이전에 있는 spine-only camera에서 선 유지와 B0→C 왕복의 동일 카메라 유지가 세 프로필 모두 통과했다.
- WebKit 모바일 [B 면](tstl-bc-product-2026-10-13/mobile-webkit-B-imjin.png), [C 중심선·국소 면](tstl-bc-product-2026-10-13/mobile-webkit-C-imjin.png), [spine-only](tstl-bc-product-2026-10-13/mobile-webkit-C-trace-only.png), [설정](tstl-bc-product-2026-10-13/mobile-webkit-settings.png)을 직접 검토했다. 이는 Cloud 에뮬레이션이며 실제 iPhone/PWA 증거가 아니다.

[배포 관측](tstl-bc-product-2026-10-13/deployment.json)에서 기존 Railway 서비스3개가 모두 해당 SHA로 SUCCESS, 공개 `/__status`·`/health`가200 및 같은 SHA임을 확인했다. 역사 served/current/target revision은56, pointer SHA-256은 `ef4c07b2b64188d0573ea4ab94e6e46b38765c7dc4b5b443047295586699072a`, Render manifest는 `14b3d11cb059175b634029145a8fe381049c489ce276a1bd101a0782c5bdcb36`으로 배포 전과 byte 단위로 같다. 기존 A asset과 fixture도 변하지 않았고 새 asset digest는 고정 값과 일치했다. 설정 변경·새 리소스 생성0, 무관한 staged patch도 그대로다. [통합 비교](tstl-bc-product-2026-10-13/integration-review.json)와 [CI 관측](tstl-bc-product-2026-10-13/ci.json)을 함께 보존한다.

이후 문서만 병합한 배포는 이 runtime 코드와 동일하다. 그 후속 build SHA는 PR과 공개 `/__status`가 소유하며, 위 browser 검증을 다른 SHA에서 재실행했다고 표현하지 않는다.

## 남은 한계

- 모든 면은 검토용 실험 표현이다. 완전한 World arrangement, 정확한 교집합 witness, temporal sidecar 의미 인증을 통과했다고 주장하지 않는다. 기존 validator를 완화하지 않았다.
- A는 제한된 X-only 결과다. B는 greedy window forest로 reroute/crossing-cost/reserved atom search/진짜 split-rejoin cycle을 구현하지 않았으며 square join을 사용한다. C는 제한된 두-bend/32-channel 후보 탐색이고 별도 교차 bridge 장식은 없다. 이 실패는 일반적인 경로/표현 불가능의 증명이 아니다.
- 분리된 같은 색 면과 선이 한 연결 면을 보장하지 않는다. C의 수많은 목록 대체와 dense port는 비교 결과의 일부다.
- r56 scalar snapshot의 원본 시간 의미 손실은 그대로다. ID와 Y 보존을 원본 lossless TemporalSidecar 복원으로 해석하지 않는다.
- 실제 iPhone17 Safari 및 설치 PWA는 에뮬레이션과 별개로 미검증이다. 의미 이해도 향상이나 기본값 채택은 아직 판단하지 않았다.
- 합성 scale 검증은 일부 frame 최대값 기준을 통과하지 못했다. 리뷰 소스6044c93의 [run38343341354](https://github.com/neocjmix/moirai/actions/runs/38343341354)는 12/15 성공: dense1k/10k의 Collection max125/112ms와 sustained1k의 max102ms가 100ms 기준을 초과했다. 해당 기록의 p95는17ms, navigation error와 server read failure는0이다. sustained 로그가 mobile profile 뒤 종료돼 전체 sustained phase 통과로 해석하지 않는다. 최종 c175 소스의 후속 [run38344054352](https://github.com/neocjmix/moirai/actions/runs/38344054352)에서도 dense/sustained frame 기준 실패가 관측됐으며, 전체 terminal 집계는 해당 run이 소유한다. IP-012 종료 결정을 유지하고 수치 gate만으로 광범위 튜닝을 재개하지 않는다.
