# TSTL · B0 좌표를 보존하는 버블·리본 실험 · 2026-10-13

**상태: 구현·검토·병합·운영 배포·공개 검증 완료.** 최초 구현 [PR #356](https://github.com/neocjmix/moirai/pull/356), 렌더러 순서 경쟁 수정 [PR #357](https://github.com/neocjmix/moirai/pull/357)을 병합했다. 최종 리뷰 소스는 `09e7ecdb23de6745692199fbd2cbb38783f4a708`, 런타임 병합 SHA는 `14895dbc32e667e701e4af1a94cd1940ea923060`이다. 실제 공개 desktop Chromium·mobile Chromium·mobile WebKit 3/3 전체 흐름을 통과했다.

[IP-016](../implementation/IP-016-tstl-product-lab.md)의 선택형 실험실을 이어서, 사용자가 제시한 Bubble Sets의 부드러운 연결 영역과 TimeSets의 넓은 흐름형 리본을 비교할 새 후보를 구현했다. 이전 [A](tstl-product-lab-2026-10-13.md)와 [B/C](tstl-bc-product-lab-2026-10-13.md)의 코드·날짜별 증거는 보존한다. 새 후보는 운영 기본값 채택이나 역사 재발행이 아니다.

## 비교 화면과 배포 확인 상태

- [B0 · 임진왜란 집중 화면](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=B0&gsViewport=260,223420,650,1800)
- [버블 · 같은 사건 위치](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=bubble&gsViewport=260,223420,650,1800)
- [리본 · 같은 사건 위치](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=ribbon&gsViewport=260,223420,650,1800)
- [설정 → 실험실](https://moirai-production-8ed1.up.railway.app/graph/settings?world=01a107fb-4018-7fcb-8390-836a40fa91cc)

| 항목 | 관측 상태 |
|---|---|
| 최초 구현 리뷰 소스 | `1d45672e27894793c5f759cb67952b67507785b7` |
| 최종 복구 리뷰 소스 | `09e7ecdb23de6745692199fbd2cbb38783f4a708` |
| 최종 런타임 main 병합 | `14895dbc32e667e701e4af1a94cd1940ea923060` · PR #357 |
| 최종 Railway 배포 | 세 서비스 모두 같은 런타임 SHA로 SUCCESS; 공개 status/health 200 |
| 공개 브라우저 검증 | desktop Chromium·mobile Chromium·mobile WebKit 3/3, runtime/HTTP 오류 0 |

기존 서비스의 main 자동 배포 경로를 사용한다. 새 인프라, viewport별 Publication, runtime solver, 역사 데이터 변경, 기본값·served pointer 변경은 구현 범위에 포함하지 않는다. 아래 배포 관측에서 고정 데이터·기존 asset·pointer 불변을 별도로 확인했다.

## 기존 후보와 시각적으로 달랐던 원인

이전 A/B/C는 A의 변경된 X를 공통으로 사용했다. B0와 면을 비교할 때 사건 배치 차이도 함께 보였기 때문에 윤곽 자체의 효과를 구분하기 어려웠다. 기존 B의 3,159개 fragment는 실제 연결 성분 수가 아니라 면을 채우는 직사각형 분할이었다. 분할선을 각 ring의 외곽선으로 그려 내부 이음선이 나타났고, 32-terminal window forest는 서로 떨어진 면을 남겼다. 일정 폭의 직교 통로와 단일 사건 주변 cell은 참고 이미지의 넓은 영역과도 달랐다. C는 애초에 선 중심 비교군이다.

버블·리본은 **compiled B0의 539 Event X/Y, Composite anchor와 의미상 world bounds를 그대로 사용한다.** `layout.shapes`의 bounds 중점을 재계산하면 실제 compiled anchor와 달라지는 사례가 있어, B0 primitive의 anchor·point 좌표를 직접 기준으로 삼았다. 기존 relation primitive와 사건 선택 정체성도 유지한다. 새 면만 비교하며 A/B/C의 공통 배치와 혼동하지 않도록 설정에 차이를 설명한다.

## 새 영역 구성과 최종 도형

버블은 Composite의 전체 member를 대상으로 결정적인 전역 skeleton을 만든다. 32개씩 나눠 위상을 끊지 않는다. 장애물 우회 경로에 둥근 통로를 입히고 member 주변의 넓은 영역과 합친 다음, 합집합의 실제 외곽을 구한다. 최종 반지름은 member 주변 32u, 통로 22u다. 이는 Bubble Sets에서 참고한 skeleton·장애물 회피 방식이며 원 논문의 potential-field 알고리즘을 그대로 재현한 구현은 아니다.

리본은 시간 band마다 member를 감싸는 넓은 폭을 계산하고 인접 band 사이를 smoothstep 경계로 연결한다. 합집합에 둥근 경계를 적용하되, rounding이 연결 성분 수나 member 포함을 손상하면 반지름을 줄이고 마지막에는 연속 합집합을 유지한다. band와 연결 strip의 winding을 맞춰 NonZero union에서 내부가 서로 취소되던 문제를 수정했다. 이 리본은 TimeSets를 참고한 실험이며 원 논문 전체 알고리즘의 구현·검증은 아니다.

두 후보는 같은 비소속 leaf support를 장애물로 사용한다. 여유를 둔 장애물 합집합의 경계도 둥글린 뒤 잘라내며, 남은 구멍은 실제 hole ring으로 보존한다. SVG·Canvas의 even-odd fill과 WebGL의 hole-aware triangulation을 통해 같은 compound geometry를 그리는 계약을 추가했다. 채우기용 내부 타일을 외곽선으로 표시하지 않는다. 최종 윤곽을 준비한 뒤 renderer가 임의의 spline·padding·feather로 다시 변형하지 않는다. 공개 검사는 기본 WebGL의 실제 성공한 source key·compound mesh와 브라우저 SVG path의 even-odd hole을 확인한다. Canvas는 같은 fill-rule 계약을 전달하며, 물리 기기의 모든 backend를 별도로 검증했다는 주장은 아니다.

| 고정 history-r56 측정 | 버블 | 리본 |
|---|---:|---:|
| Event / Composite | 539 / 109 | 539 / 109 |
| leaf→ancestor 소속 pair | 1,390 | 1,390 |
| 최종 nominal support가 면에 포함된 pair | 1,210 | 1,210 |
| 명시적인 목록 대체 pair | 180 | 180 |
| 실제 면 연결 성분 | 138 | 136 |
| hole | 473 | 395 |
| 여러 면 성분을 갖는 Composite | 20 | 18 |
| nominal 비소속 glyph 침범 | 0 | 0 |
| proper self-crossing 검사 위반 | 0 | 0 |

면 포함 수는 완전한 의미 인증 수가 아니다. 고정된 B0 위치에서 서로 충돌하는 nominal support 등으로 면 포함을 만족하지 못한 180 pair는 정확한 membership 목록으로 남는다. 원래 Event를 삭제·이동·복제하지 않으며 대체 사유와 기존 Event 상세 접근을 유지한다. 연결 성분 수와 hole 수는 같은 값이 아니고, 동일 Composite의 여러 성분을 하나의 연결 면이라고 부르지 않는다.

버블의 실제 한국사·일본사·임진왜란·이순신은 각각 한 연결 성분이며 중국사는 두 성분이다. 버블의 전역 skeleton edge는 1,281개, 우회 경로가 만들어진 edge는 1,148개, 실패는 133개다. 20,000,000 segment 검사 예산 중 2,562,392회를 사용해 예산을 소진하지 않았다. 경로 탐색 실패는 일반적인 연결 불가능의 증명이 아니다. 리본은 340개 시간 band를 사용하며 clipping 이후의 성분 수를 보고한다.

## 재현 artifact와 수치 검증 범위

- 최종 geometry asset 경로: `/labs/tstl/r56-5d8e2b32d0b5895c.json`.
- SHA-256: `5d8e2b32d0b5895cc02823ab4bfa9794873d7e65e465ba6e62fe43ff898173c1`.
- Raw 5,049,276 bytes. 이 값은 압축 전 artifact 크기이며 모바일 wire latency 측정이 아니다.
- fixture SHA-256 `5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64`, source root `d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54`를 사용하며 기존 B0/A/B/C 비교도 artifact에 유지한다.

기하 계산의 고정 metric은 `X=x`, `Y=0.2×(y−origin)`이고 nominal glyph support는 이 metric의 5×5 box다. 비소속 glyph에 1.5u 여유를 둔다. 사건의 원래 시간 Y를 수정하지 않으며 이 변환은 윤곽 계산에만 사용한다. polygon boolean은 decimal precision 4를 사용한다. 최종 world 좌표로 되돌린 도형에서 member support 포함, nonmember support 배제, 유한 좌표와 proper self-crossing을 확인한다. Boolean 면적 검사의 수치 허용값은 0.0001이다. 이를 exact arithmetic topology 인증이라고 부르지 않는다.

고정 glyph 포함·배제와 최종 renderer 도형의 일치는, 전체 World의 모든 face signature·실제 witness·시간 지식을 검증하는 것과 별개다. 기존 semantic validator를 완화하지 않았으며 새 면에 완전한 의미 인증을 부여하지 않는다. `legacy-scalar-only`는 원본 시간 정보 일부가 snapshot에서 빠졌다는 뜻이며 면을 그릴 수 없다는 뜻이 아니다.

[독립 geometry 검토](tstl-smooth-product-2026-10-13/geometry-review.json)는 후보별 46,870개 owner–leaf 쌍을 별도 rectangle-clipping oracle로 검사해 소속 결과와 비소속 배제가 일치함을 확인했다.

최종 asset의 [오프라인 mesh audit](tstl-smooth-product-2026-10-13/mesh-audit.json)는 버블·리본 각각 109 owner를 hole과 함께 triangulate했고 실패는 0이었다. 버블 mesh 합계는 6,580,860 bytes, 최대 owner는 624,180 bytes, 최대 ring은 3,287 vertices였다. 리본은 합계 3,687,960 bytes, 최대 owner 266,640 bytes, 최대 ring 1,330 vertices였다. 최대 상대 면적 오차는 각각 약 `1.35×10⁻⁷`, `7.98×10⁻⁸`이었다. 이는 CPU에서 생성한 mesh와 Float32 좌표의 검사이며 실제 기기 GPU 성능 측정은 아니다.

## 구현 검증과 렌더러 복구

전체 로컬 unit은 최종 복구 전 **965 pass / 2 skip**, 첫 렌더러 복구 focused 검사는 28 pass였다. 최종 source-generation 복구는 14 focused test와 독립 검토를 통과했다. 관련 묶음은 중복이 있으므로 합산하지 않는다. TypeScript, lint, format, architecture boundary, production build와 commit secret scan이 통과했다. 로컬 production dependency audit는 high/critical 0, moderate 6이었다. [로컬 검증 기록](tstl-smooth-product-2026-10-13/local-verification.json)은 배포 검증과 분리한다.

버블·리본의 회귀는 정확한 compiled B0 위치·원래 temporal bounds·전체 소속 pair, 실제 hole, 장애물로 인한 분리, 겹친 support의 명시적 포함 실패, 연결 band의 winding·rounding, 입력 순서 결정성과 최종 asset byte 재현을 다룬다. 변조 후 다시 hash한 좌표·fill rule·scope·membership도 거부한다. 이를 모든 역사 자료에 대한 수학적 완전성 증명으로 해석하지 않는다.

실제 B0의 이순신 확대 화면에서는 기존 한국사 spline의 자기 교차로 SVG fallback이 필요했다. geometry를 고치거나 무리하게 triangulate하지 않았다. 후보 전환 때 이전 실패를 물려받던 문제와 이전 source의 사라지는 윤곽이 새 renderer로 들어오던 문제를 수정했다. 첫 공개 checkpoint `7d06b67`에서는 새 backend의 실패를 뒤늦은 passive reset이 덮어쓰는 순서 경쟁이 추가로 확인됐다. DOM의 WebGL 표시만으로 성공을 판정하지 않도록 검사도 강화했다.

최종 구현은 accepted source generation에 실패를 귀속한다. 같은 source의 반복 read는 실패를 지우지 않고, 이전 generation의 callback은 새 시도에 영향을 주지 않는다. 실제 source가 바뀔 때만 새 canvas/context를 만들며, 같은 source 안의 카메라·선택·LOD와 220ms exit 전환은 유지한다. malformed previous-only contour와 실패/소스 수락의 양쪽 순서를 deterministic regression으로 검사한다.

최종 [소스 CI](https://github.com/neocjmix/moirai/actions/runs/38378638807)와 [런타임 main CI](https://github.com/neocjmix/moirai/actions/runs/38378673786)는 모두 성공했다. main 기준 **unit 970 pass / 2 skip, PostgreSQL 49 pass, mobile 75 pass, compiler continuity 11 pass**이며 type/lint/format/build/audit/secret 검사를 포함한다. 전체 dependency audit는 moderate 9, high/critical 0이다. 별도 reader 3/3 및 A5 공개 checkpoint 4개도 통과했다. 최종 런타임의 [자동 post-deploy smoke](https://github.com/neocjmix/moirai/actions/runs/38379484634)도 성공했다.

## 공개 검증

최종 runtime `14895dbc32e667e701e4af1a94cd1940ea923060`에서 **desktop Chromium 1280×800, mobile Chromium·mobile WebKit 각 390×844, 세 프로필 모두 전체 검사 통과**했다. 각 프로필의 runtime error·HTTP failure·가로 overflow는 0이다. [공개 검증 요약](tstl-smooth-product-2026-10-13/public-smoke.json)은 대상 SHA, 실제 성공한 painter의 source key, geometry·hole·좌표·카메라·선택 검사를 보존한다. 최초 `7d06b67`의 공개 실패와 diagnostic-only 검사는 이 결과에 합산하지 않는다.

- 원래 임진왜란 카메라, B0에 맞춘 집중 카메라, 세계사 전체, 이순신 공유 관계의 네 화면에서 같은 B0 좌표를 비교했다. 버블·리본은 네 화면 모두 실제 WebGL ready와 성공한 paint source key를 확인했다. B0 이순신의 `non_simple_geographic_path` SVG fallback과 뒤이은 새 후보 복구도 세 프로필 모두 통과했다.
- 독립 가로·세로 확대, 기존 밀도/표현 단계, Collection 7→6→7, 실제 사건 클릭·선택 ID와 drawer 유지, 한국사·일본사·중국사·임진왜란·이순신 다섯 case의 같은 Event 상세를 확인했다.
- 두 후보 각각 목록 대체 180개, 이순신의 실제 20개 행과 원래 Event 이동·선택을 확인했다. 새 후보의 최대 묶음이 20행이어서 이번 실제 데이터 검사는 pagination 분기를 실행하지 않았다.
- 새 기본 세션의 실험 asset 요청은 0이다. 같은 client lifetime의 후보·카메라·Collection 전환은 고정 asset 한 번을 재사용한다. reload와 별도 root mount의 요청은 별개이며, 후보별 저장 선택 복원과 기본 운영 복귀도 확인했다.
- 공개 WebKit [B0](tstl-smooth-product-2026-10-13/mobile-webkit-B0-imjin.png)·[버블](tstl-smooth-product-2026-10-13/mobile-webkit-bubble-imjin.png)·[리본](tstl-smooth-product-2026-10-13/mobile-webkit-ribbon-imjin.png)의 같은 임진왜란 화면과 이순신 [B0](tstl-smooth-product-2026-10-13/mobile-webkit-B0-yi-shared.png)·[버블](tstl-smooth-product-2026-10-13/mobile-webkit-bubble-yi-shared.png)·[리본](tstl-smooth-product-2026-10-13/mobile-webkit-ribbon-yi-shared.png)을 직접 비교했다. 넓은 연결 면과 실제 hole이 보이며, 조밀한 중첩과 리본의 계단형 일부 경계도 그대로 기록한다.

[배포 관측](tstl-smooth-product-2026-10-13/deployment.json)은 기존 Railway 서비스 3개가 모두 최종 SHA로 SUCCESS이고 공개 `/__status`·`/health`가 200임을 확인한다. 역사 served/current/target revision은 56, pointer SHA-256은 `ef4c07b2b64188d0573ea4ab94e6e46b38765c7dc4b5b443047295586699072a`, 기존 Render manifest는 `14b3d11cb059175b634029145a8fe381049c489ce276a1bd101a0782c5bdcb36`으로 배포 전과 같다. 이전 A·B/C asset, 원본 fixture도 byte 단위로 보존했다. 새 asset은 고정된 `5d8…`와 정확히 일치한다. 설정 변경·새 리소스 생성은 0이며 무관한 Railway staged patch도 그대로다.

이후 증거 문서만 병합한 배포는 이 런타임과 동일한 코드다. 후속 문서 build SHA는 PR과 공개 `/__status`에서 관측하며, 위 전체 브라우저 검사를 다른 SHA에서 재실행했다고 표현하지 않는다.

별도 [합성 scale run](https://github.com/neocjmix/moirai/actions/runs/38378638639)은 13/15 성공이다. dense 1k와 sustained 1k의 Collection 전환 최대 frame 130ms/112ms가 100ms 기준을 넘었다. 두 기록의 p95는 17ms, navigation error·server read failure는 0이었다. 이는 기본 렌더러·합성 World 결과이며 실제 r56 버블/리본 측정이 아니다. IP-012의 성능 튜닝 종료 결정을 유지하고 이 수치만으로 광범위 튜닝을 재개하지 않는다. [CI 관측](tstl-smooth-product-2026-10-13/ci.json)이 상세 결과를 소유한다.

## 남은 한계

- 리본의 일부 clipping 경계에는 계단 형태나 국소 꺾임이 남는다. 모든 곡률을 최적화한 결과는 아니다.
- 많은 Composite가 겹치는 구간은 alpha 누적과 색 중첩으로 여전히 복잡하다. 실제 사용자의 관계 이해도 향상은 검증하지 않았다.
- 명목 support의 포함·배제는 모든 zoom에서의 CSS-pixel glyph와 label footprint를 보장하지 않는다. 가로·세로 독립 확대에서는 그 차이가 더 커질 수 있다.
- 면이 시간 공백을 가로질러 이어져도 새로운 사건, 지속적인 활동, 인과관계의 근거가 아니다. 모든 교집합의 exact signature와 witness 검증도 남아 있다.
- Bubble Sets·TimeSets의 완전한 재현이 아니라 Moirai의 고정 B0 배치 위에서 비교할 수 있게 만든 제한된 후보다. 최적해나 모든 집합의 연결 가능성을 주장하지 않는다.
- 실제 iPhone17의 Safari와 설치 PWA는 미검증이다. Cloud Chromium/WebKit 에뮬레이션과 구분한다.
- 기존 C까지 포함하는 aggregate 탐색 bounds가 B0·새 후보보다 넓어 최대 축소나 범위 밖 저장 카메라 복원에서 여백이 늘 수 있다. 보통의 모드 전환과 명시한 비교 카메라는 유지된다.
- B0의 해당 자기 교차 화면은 SVG fallback을 사용한다. 새 후보와 동일한 GPU backend로 모든 B0 화면을 비교할 수 있다는 뜻은 아니다.
