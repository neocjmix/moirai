# history-r56 TSTL B0 / 후보 A 첫 독립 프리뷰

2026-10-13 KST (2026-10-12 UTC). 첫 비교 프리뷰의 배포 증거다. 전체 A0 완성·의미 면 인증·운영 채택을 뜻하지 않는다.

## 공개 결과와 소스

- [모바일 프리뷰](https://neocjmix.github.io/moirai/tstl-candidate-a/)
- 런타임 소스: `4ffb47c56715e119e97f5ee0c47bad6f142e06ac`
- Pages 배포: `939e16d7ace567b516bf7676016d7c2d39b29dad` (`built`, 2026-10-12 17:09:57 UTC)
- [공개 build.json](https://neocjmix.github.io/moirai/tstl-candidate-a/build.json), [health.json](https://neocjmix.github.io/moirai/tstl-candidate-a/health.json), [측정](https://neocjmix.github.io/moirai/tstl-candidate-a/measurements.json)
- 브랜치: `feat/tstl-candidate-a-preview-2026-10-13`, [draft PR #351](https://github.com/neocjmix/moirai/pull/351). main에 병합하지 않았다. 이후 테스트·증거 커밋은 배포 런타임을 바꾸지 않는다.

요청한 origin 문서 브랜치를 fetch하고 정확히 `0ead253b4cb71742d7c1ef78c480e66dff708a82`에서 시작했다. 최신 main은 `d721b0efdcf309ed7ad21c55bc04572e2f14d644` 그대로다. 시작 문서 커밋은 main보다 1개 앞서며 문서 2개·695행만 추가했고 runtime 차이는 없다. 시작 시점과 구현 후 `git merge-tree`에서 충돌이 없었다.

순차 checkpoint는 B0 재현 `f327566`, validator `b5fca68`, 후보 A `9b839bb`, 모바일 프리뷰 `4ffb47c`다. 각 단계에서 테스트·별도 검토 후 커밋하고 push했다. [재현 명령과 계약 범위](../../scripts/tstl-research/README.md), [handoff](../research/tstl-candidate-a-handoff-2026-10-13.md), [전체 설계](../research/tstl-world-history-design-2026-10-13.md)를 함께 읽는다.

## 데이터와 보존

고정 입력은 실제 `history-r56.json`: 539 Event, 109 Composite, 430 leaf, 614 contains, 7 Collection, 1,112 Collection membership이다. live 최신 데이터라는 주장은 하지 않는다. World는 `01a107fb-4018-7fcb-8390-836a40fa91cc`, source root는 `d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54`다.

handoff에 적힌 byte SHA `b3d846…`는 그 문서 커밋의 파일과도 일치하지 않는다. 파일을 수정하지 않고 실제 bytes의 SHA-256 `5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64` 및 Git blob `b9c6f7cebc7462a8c6f7848b0b6cc21bdf66ff50`을 고정했다. input digest는 `a04bfed02a65e60cc3a7e9b2b5ab3fca0d0e9e2a7643c63710eb0c6c1694e9d0`다.

536 scalar extents는 실제 duration·불확실한 발생 범위·정확 날짜를 구별하는 lossless TemporalSidecar가 아니다. 전체 시간 레코드는 **legacy-scalar-only**로 표시하며 B0/A 모두 의미 면을 승인하지 않는다. 원래 point Y, segment 경계, Composite bounds를 보존하고 동일한 양의 affine reference frame만 사용한다. Composite bounds의 중앙 표제는 주석 anchor이며 발생 시점·leaf witness가 아니다.

운영 기본값·compiler·served pointer·역사·contains·Collection membership은 변경하지 않았다. 기존 Pages 22개 Git 항목이 모두 같은 blob이며 기존 공개 자산 21개도 byte 단위로 같았다. 새 `tstl-candidate-a/` 아래 10개 파일만 추가했다. 새 manifest 자산 7개는 공개 HTTP 200, byte 수, SHA-256, 배포 Git blob과 모두 일치했다. 운영 SHA는 계속 `d721b0ef…`, r56 pointer의 원본 응답 SHA는 전후 모두 `ef4c07b2b64188d0573ea4ab94e6e46b38765c7dc4b5b443047295586699072a`다.

## B0와 후보 A 비교

| 동일 r56 기준 | B0 | 후보 A |
| --- | --- | --- |
| 알고리즘 | 현행 `global-incidence/1` + 실제 compiler hull | `tstl-a-restricted/1` |
| 단일 Event / 원본 Y 불일치 | 539 / 0 | 539 / 0 |
| 정확 ancestor 포트 | 1,673 | 1,673 |
| 윤곽 시도 범위 | 요청한 Composite 5개 | 같은 5개 |
| 진단 윤곽 조각 | 5 | 337 |
| 최종 의미 면 | **0** | **0** |
| 선·포트·목록 fallback | 109/109 Composite | 109/109 Composite |
| 윤곽 검사 결과 | 사선 hull 5개는 exact 직교 모델 범위 밖 | 연결 zone witness 진단 27건 → 제한된 수리 후 13건 |

전체 109 Composite·539 Event가 정확한 관계 목록과 검색·복원으로 접근 가능하다. 나머지 104 Composite의 면을 구현했다고 세지 않는다. zero-fill 계약 통과는 면 인증 coverage 0%를 뜻하며 후보 면이 유효하다는 증거가 아니다. 표의 27→13은 patch/signature별로 중복 제거한 진단 수이며 연결 영역 개수와 구별한다.

B0는 누락 Collection incidence를 복원해 실제 `computeLayout`과 `compileV5RenderPublication`을 실행했다. 타일 복제만 deduplicate하고 external geometry를 읽었다. 기존 Lab hull로 대체하지 않았다. compiler의 퇴화 bounds fallback은 18/109개다. [B0 artifact·SVG·측정](../../scripts/tstl-research/evidence/)을 별도로 남겼다.

B0의 전체 46,870 leaf-center/hull probe에서 member 제외 1,041, nonmember 포함 52, 경계 불확실 41을 재현했다. 독립 GEOS/nonzero winding 검사와 비경계 판정은 일치했다. 제외 433건은 0.001 world unit 이내 반올림 영향도 포함하고 나머지 608건은 더 멀다. 이는 **원본 compiler contour의 중심점 음성 진단**이며 전체 glyph support 인증·운영 padding/feathering 적용 픽셀·사용자 오독률이 아니다.

A는 data-derived root 순서, 고정 Y의 X-only convex separation QP, 정수 직교 single-run contour, 제한된 patch mode 하향과 fallback을 구현했다. 5,349 제약에 대한 100만 constraint visit 예산을 소진해 결정적인 feasible incumbent를 사용했고 최대 제약 위반은 0이다. 138개 multi-run band와 12회 repair 예산 소진을 숨기지 않는다. joint X/q/L/R QP, move/bend 항, 전체 순서 탐색 및 adjacent-order/connector-width/control-X repair 메뉴는 미구현이다. B/C·전면 fragmentation은 범위 밖이다.

exact validator는 정수·직교·simple ring과 보수적 사각 glyph support의 모든 analytic cell 및 연결 zone을 검사한다. 임의 사선·곡선·수치 불명·예산 초과는 승인하지 않는다. 200 seeded DAG 및 별도 80 rectangle-support oracle 회귀를 포함한다. renderer는 직렬화된 polygon vertex·body·stroke를 그대로 SVG에 사용하고 카메라 affine 및 viewport clip만 적용한다. hull 재계산·smoothing·semantic stroke 확장은 없다. 브라우저 DOM 일치는 rasterizer/GPU의 수학적 정확성 증명과 구별한다.

## 실제 관계를 읽는 방법

상단 B0/A는 같은 카메라·선택을 보존한다. “공유 사건·집합 비교”에서 한국사·일본사·중국사를 기준 집합으로 고르고 국가별 보기나 교집합 목록을 연다. 기준 Composite와 Collection 필터는 별개다.

배타 leaf 수는 K=87, J=71, C=45, KJ=112, KC=83, JC=3, KJC=29다. C를 기준 집합에서 빼면 KJ가 141이 되며 Event를 추가하는 것이 아니다. 임진왜란의 실제 direct parent는 K/J뿐이다. 중국사와 공유하는 임진왜란 하위 leaf 29개 때문에 중국사→임진왜란 edge를 만들지 않는다. 임진왜란 leaf 93개, 이순신과 공유 leaf 26개를 직접 읽을 수 있다.

공유 사건을 선택해 단일 ID·ancestor 포트·실제 부모를 확인하고, 사건 숨김·Collection off·경로 접힘 후 검색에서 이유와 복원 버튼을 확인한다. 한국사→임진왜란 경로만 접어도 일본사 경로가 열려 있으면 같은 사건이 유지된다. 포트·표제·선 교차는 새 Event나 포함관계가 아니다.

## 자동 검사와 모바일 관측

전체 unit 879 통과, 기존 skip 2. PostgreSQL 17.11 일회용 로컬 컨테이너의 통합·마이그레이션 49/49 통과 후 컨테이너를 제거했다. strict workspace typecheck, lint, format, boundary 검사, 전체 production build, secret scan 통과. 의존성 high gate 통과, 기존 moderate 9개·high/critical 0개; 의존성 변경 없음.

처음 unit 전체 실행은 production build와 동시 실행해 기존 100k fixture가 30초 timeout 및 worker RPC timeout을 냈다. assertion·timeout 값을 바꾸지 않고 `vitest run --maxWorkers=2`로 전체를 다시 실행해 181개 파일·879개 테스트가 통과했다. 기존 선택적 테스트 2개는 계속 skip이다.

공개 브라우저 결과와 수치는 아래 machine evidence에 기록한다. desktop Chromium 1280×800, mobile Chromium/WebKit 390×844에서 자산 digest·실제 DOM 좌표·539 drawn/omitted partition·단일 ID·시간 Y·112→141·직접 부모/공유 자손·B0/A 왕복·Collection 토글·접힘·숨김 복원·pan/zoom을 검사한다. Chromium pinch는 CDP touch이며 WebKit pinch는 synthetic PointerEvent 기반이다. **실제 iPhone 17 Safari 및 설치형 PWA 검증이 아니다.**

공개 URL의 세 프로필 모두 기능 검사 통과, page/console/request 오류 0, 가로 넘침 0이다. 실제 browser fetch로 각 자산 byte SHA를 다시 계산했다. UI에서 539개 사건은 그려진 ID 또는 사유·복원 경로가 있는 omitted ID로 정확하게 분할된다. 세 프로필 screenshot 24개(모바일 16개)를 생성하고 핵심 화면을 직접 확인했다.

| 공개 브라우저 | cold / warm ready (ms) | gesture frame p95 / p99 / max (ms) | Long Task |
| --- | --- | --- | --- |
| Chromium 151, 1280×800 | 1,146 / 628 | 16.8 / 33.3 / 50.0 | 관측 0 |
| Chromium 151, 390×844 | 864 / 653 | 16.8 / 66.6 / 66.6 | 관측 0 |
| WebKit 26.5, 390×844 | 1,068 / 671 | 56 / 62 / 62 | API 미지원 |

ready는 navigation부터 500ms network-idle 및 두 animation frame을 포함하며 순수 네트워크 지연이 아니다. frame은 자동 gesture trace의 rAF 간격이다. WebKit의 모바일 p95 33.3ms 목표는 미달이며 데스크톱 16.8ms도 16.7ms 목표 이내라고 세지 않는다. p95 외 tail과 Cloud 변동을 함께 해석한다. WebKit의 Long Task 0을 측정했다고 주장하지 않는다.

- [공개 browser machine evidence](tstl-candidate-a-2026-10-13/public-smoke.json)
- [배포·기존 Pages·운영 pointer 보존](tstl-candidate-a-2026-10-13/deployment.json)
- [계산 측정](tstl-candidate-a-2026-10-13/measurements.json), [PostgreSQL·audit](tstl-candidate-a-2026-10-13/integration-audit.json)
- 동일 WebKit camera/선택의 [B0 공유 사건](tstl-candidate-a-2026-10-13/mobile-webkit-shared-b0.png) / [A 공유 사건](tstl-candidate-a-2026-10-13/mobile-webkit-shared.png)
- [임진왜란 직접 부모와 공유 자손](tstl-candidate-a-2026-10-13/mobile-chromium-imjin.png), [기준 C 해제 뒤 141개 목록](tstl-candidate-a-2026-10-13/mobile-chromium-country-shared-list.png)

런타임 소스 `4ffb47c`의 원격 CI에서 `typecheck-test-build-audit`, `mobile-playwright`, `secret-scan`은 통과했다. 별도 [대규모 성능 matrix](https://github.com/neocjmix/moirai/actions/runs/38282272927)의 10k dense / 100k dense / 1k sustained는 실패했다. Collection toggle 600 frame의 p95는 17ms였으나 max가 각각 110/124/111ms로 100ms 제한을 넘었다. sustained trace는 p95 36–37ms로 33.4ms 제한을 넘었다. 해당 측정의 shell failures는 비어 있었다.

직전 같은 [matrix 실행](https://github.com/neocjmix/moirai/actions/runs/38186889932)도 100k dense max 127ms와 sustained max 115ms·p95 36–37ms에서 실패했다. 10k dense는 당시 max 99ms로 통과했으므로 모든 실패를 기존 실패라고 묶지 않는다. 이번 변경은 production import 경로·성능 구현을 바꾸지 않았지만 런별 차이의 인과를 이 측정만으로 단정하지 않는다. 이 별도 성능 문턱은 해결되지 않았으며 로컬 검사·공개 smoke 통과를 모든 GitHub workflow의 green 결과로 표현하지 않는다. 후속 증거·테스트 커밋의 CI는 별도 실행이다.

최종 matrix는 12 성공·3 실패·대기 0으로 완료됐다. 두 실행이 checkout한 실제 merge tree에서 기존 Atropos·A4 benchmark·workflow·lockfile·graph-presentation 파일의 blob이 같음을 확인했다. [CI 관측과 이전 실행 비교](tstl-candidate-a-2026-10-13/ci-observation.json)에 값·job URL·동일 코드 근거를 보존했다.

## 계산·남은 한계와 다음 최소 단계

배포 bundle의 fresh Node 24.19.0 측정에서 B0 replay 1.874초, A 비교 계산 2.256초였다. A 내부는 projection 8.3ms, order 2.9ms, QP 367.9ms, contour 9.2ms, A 검증 1,805.8ms, B0 검증 62.0ms다. 계산구간 합 4.130초는 직렬화·bundle·네트워크·paint 전체 시간과 다르다. 최종 peak RSS **711,811,072 bytes (약 679 MiB)**로 250MB 목표는 미달이다. process 최고값에는 B0 compiler가 포함되고 단계별 allocation/heap 최대값은 분리 측정하지 않았다. preview JSON은 5,081,305 bytes다.

WebKit frame 목표 미달과 dense 구간의 작은 glyph·진단선 밀집은 남아 있다. Cloud 반복 측정 변동이 있고 실제 기기·GPU 성능, 실제 사용자 정확도/시간 개선, 장기 Safari/PWA lifecycle을 확인하지 않았다. 날짜·uncertainty·duration 독해, 손실 없는 시간 인증, 모든 Composite의 면, full A0, broader world-history corpus의 품질도 미검증이다.

다음 최소 단계는 역사 편집 없이 lossless temporal provenance를 고정한 읽기 전용 fixture를 확보하고, 현재 미해결 연결 zone 반례 하나에 대해 full A repair 메뉴를 하나씩 적용해 실제 fill 승인 coverage가 늘어나는지 확인하는 것이다. 이 프리뷰 결과만으로 운영 기본값·pointer를 승격하지 않는다.
