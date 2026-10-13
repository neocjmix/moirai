# TSTL · B0 좌표를 보존하는 버블·리본 실험 · 2026-10-13

**상태: 구현·로컬 검증 증거 초안. 최종 renderer 복구 수정, 브라우저 검증, PR·운영 배포와 공개 접근 확인은 진행 중이다.** 아래 운영 URL은 검증할 대상이며 이 문서 작성 시점에 새 후보가 공개 배포됐다는 뜻이 아니다. 기준 소스는 `0c1213ba24332817be03aa829762cef698b01eb6`이고 후속 renderer 수정이 남아 있다. 최종 리뷰·배포 SHA와 공개 결과는 관측 후 별도로 기록한다.

[IP-016](../implementation/IP-016-tstl-product-lab.md)의 선택형 실험실을 이어서, 사용자가 제시한 Bubble Sets의 부드러운 연결 영역과 TimeSets의 넓은 흐름형 리본을 비교할 새 후보를 구현했다. 이전 [A](tstl-product-lab-2026-10-13.md)와 [B/C](tstl-bc-product-lab-2026-10-13.md)의 코드·날짜별 증거는 보존한다. 새 후보는 운영 기본값 채택이나 역사 재발행이 아니다.

## 비교 화면과 배포 확인 상태

- [B0 · 임진왜란 집중 화면](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=B0&gsViewport=260,223420,650,1800)
- [버블 · 같은 사건 위치](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=bubble&gsViewport=260,223420,650,1800)
- [리본 · 같은 사건 위치](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=ribbon&gsViewport=260,223420,650,1800)
- [설정 → 실험실](https://moirai-production-8ed1.up.railway.app/graph/settings?world=01a107fb-4018-7fcb-8390-836a40fa91cc)

| 항목 | 이 초안의 상태 |
|---|---|
| 구현 기준 소스 | `0c1213ba24332817be03aa829762cef698b01eb6` |
| 최종 renderer 복구 수정과 회귀 | 진행 중 |
| 최종 리뷰 소스·PR·main 병합 SHA | 미기록 — 관측 후 추가 |
| Railway 배포 SHA·서비스 상태 | 미확인 — 배포 후 추가 |
| 공개 `/__status`·`/health` 및 실제 접근 | 미확인 — 배포 후 추가 |
| 최종 공개 desktop/mobile Chromium·WebKit | 미완료 — 결과와 대상 SHA를 함께 추가 |
| 배포 전후 역사 pointer·Render manifest 불변 | 최종 배포 후 비교 예정 |

기존 서비스의 main 자동 배포 경로를 사용한다. 새 인프라, viewport별 Publication, runtime solver, 역사 데이터 변경, 기본값·served pointer 변경은 구현 범위에 포함하지 않는다. 이 범위의 불변과 실제 배포 전후 관측은 구분한다.

## 기존 후보와 시각적으로 달랐던 원인

이전 A/B/C는 A의 변경된 X를 공통으로 사용했다. B0와 면을 비교할 때 사건 배치 차이도 함께 보였기 때문에 윤곽 자체의 효과를 구분하기 어려웠다. 기존 B의 3,159개 fragment는 실제 연결 성분 수가 아니라 면을 채우는 직사각형 분할이었다. 분할선을 각 ring의 외곽선으로 그려 내부 이음선이 나타났고, 32-terminal window forest는 서로 떨어진 면을 남겼다. 일정 폭의 직교 통로와 단일 사건 주변 cell은 참고 이미지의 넓은 영역과도 달랐다. C는 애초에 선 중심 비교군이다.

버블·리본은 **compiled B0의 539 Event X/Y, Composite anchor와 의미상 world bounds를 그대로 사용한다.** `layout.shapes`의 bounds 중점을 재계산하면 실제 compiled anchor와 달라지는 사례가 있어, B0 primitive의 anchor·point 좌표를 직접 기준으로 삼았다. 기존 relation primitive와 사건 선택 정체성도 유지한다. 새 면만 비교하며 A/B/C의 공통 배치와 혼동하지 않도록 설정에 차이를 설명한다.

## 새 영역 구성과 최종 도형

버블은 Composite의 전체 member를 대상으로 결정적인 전역 skeleton을 만든다. 32개씩 나눠 위상을 끊지 않는다. 장애물 우회 경로에 둥근 통로를 입히고 member 주변의 넓은 영역과 합친 다음, 합집합의 실제 외곽을 구한다. 최종 반지름은 member 주변 32u, 통로 22u다. 이는 Bubble Sets에서 참고한 skeleton·장애물 회피 방식이며 원 논문의 potential-field 알고리즘을 그대로 재현한 구현은 아니다.

리본은 시간 band마다 member를 감싸는 넓은 폭을 계산하고 인접 band 사이를 smoothstep 경계로 연결한다. 합집합에 둥근 경계를 적용하되, rounding이 연결 성분 수나 member 포함을 손상하면 반지름을 줄이고 마지막에는 연속 합집합을 유지한다. band와 연결 strip의 winding을 맞춰 NonZero union에서 내부가 서로 취소되던 문제를 수정했다. 이 리본은 TimeSets를 참고한 실험이며 원 논문 전체 알고리즘의 구현·검증은 아니다.

두 후보는 같은 비소속 leaf support를 장애물로 사용한다. 여유를 둔 장애물 합집합의 경계도 둥글린 뒤 잘라내며, 남은 구멍은 실제 hole ring으로 보존한다. SVG·Canvas의 even-odd fill과 WebGL의 hole-aware triangulation을 통해 같은 compound geometry를 그리는 계약을 추가했다. 채우기용 내부 타일을 외곽선으로 표시하지 않는다. 최종 윤곽을 준비한 뒤 renderer가 임의의 spline·padding·feather로 다시 변형하지 않는다. 모든 backend의 최종 공개 브라우저 확인은 위 진행 상태를 따른다.

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
- 동일한 history-r56 fixture와 source root를 사용하며 기존 B0/A/B/C 비교도 artifact에 유지한다.

기하 계산의 고정 metric은 `X=x`, `Y=0.2×(y−origin)`이고 nominal glyph support는 이 metric의 5×5 box다. 비소속 glyph에 1.5u 여유를 둔다. 사건의 원래 시간 Y를 수정하지 않으며 이 변환은 윤곽 계산에만 사용한다. polygon boolean은 decimal precision 4를 사용한다. 최종 world 좌표로 되돌린 도형에서 member support 포함, nonmember support 배제, 유한 좌표와 proper self-crossing을 확인한다. Boolean 면적 검사의 수치 허용값은 0.0001이다. 이를 exact arithmetic topology 인증이라고 부르지 않는다.

고정 glyph 포함·배제와 최종 renderer 도형의 일치는, 전체 World의 모든 face signature·실제 witness·시간 지식을 검증하는 것과 별개다. 기존 semantic validator를 완화하지 않았으며 새 면에 완전한 의미 인증을 부여하지 않는다. `legacy-scalar-only`는 원본 시간 정보 일부가 snapshot에서 빠졌다는 뜻이며 면을 그릴 수 없다는 뜻이 아니다.

최종 asset의 오프라인 mesh audit는 버블·리본 각각 109 owner를 hole과 함께 triangulate했고 실패는 0이었다. 버블 mesh 합계는 6,580,860 bytes, 최대 owner는 624,180 bytes, 최대 ring은 3,287 vertices였다. 리본은 합계 3,687,960 bytes, 최대 owner 266,640 bytes, 최대 ring 1,330 vertices였다. 최대 상대 면적 오차는 각각 약 `1.35×10⁻⁷`, `7.98×10⁻⁸`이었다. 이는 CPU에서 생성한 mesh와 Float32 좌표의 검사이며 실제 기기 GPU 성능 측정은 아니다.

## 로컬 검증과 남아 있는 renderer 회귀

이 초안 기준 전체 로컬 unit은 **965 pass / 2 skip**이다. TypeScript, lint, architecture boundary 검사가 통과했다. dependency audit는 high/critical 0, moderate 6이다. 최종 renderer 수정 후 추가되는 검사와 CI 결과는 이 수치와 별도로 기록해야 한다.

버블·리본의 focused test는 같은 B0 위치 보존, 전체 소속 pair 보존, 겹치는 시간 band의 연결, 긴 시간 공백의 연결 면, 실제 hole, 장애물로 인한 분리, 겹친 support의 명시적인 포함 실패, 입력 순서에 대한 결정성을 다룬다. 공유 geometry helper를 사용하는 검증과 독립적인 point probe를 함께 사용한다. 테스트 통과를 모든 역사 자료에 대한 수학적 완전성 증명으로 해석하지 않는다.

로컬 모바일 Chromium/WebKit에서 같은 B0 좌표로 면을 비교하고 실제 외곽·hole을 검토했다. 초기보다 넓은 버블 영역과 연속 리본이 보이며, 내부 타일 이음선은 제거됐다. 그러나 **B0의 이순신 화면에서 기존 spline이 자기 교차하여 SVG fallback으로 내려간 뒤, 후보·source 전환 시 적절한 painter로 복구해야 하는 회귀가 발견됐다.** 이 복구 수정과 최종 smoke는 진행 중이다. 초기 로컬 화면 확인을 최종 공개 브라우저 3/3 통과로 보고하지 않는다.

## 남은 한계와 배포 후 채울 증거

- 리본의 일부 clipping 경계에는 계단 형태나 국소 꺾임이 남는다. 모든 곡률을 최적화한 결과는 아니다.
- 많은 Composite가 겹치는 구간은 alpha 누적과 색 중첩으로 여전히 복잡하다. 실제 사용자의 관계 이해도 향상은 검증하지 않았다.
- 명목 support의 포함·배제는 모든 zoom에서의 CSS-pixel glyph와 label footprint를 보장하지 않는다. 가로·세로 독립 확대에서는 그 차이가 더 커질 수 있다.
- 면이 시간 공백을 가로질러 이어져도 새로운 사건, 지속적인 활동, 인과관계의 근거가 아니다. 모든 교집합의 exact signature와 witness 검증도 남아 있다.
- Bubble Sets·TimeSets의 완전한 재현이 아니라 Moirai의 고정 B0 배치 위에서 비교할 수 있게 만든 제한된 후보다. 최적해나 모든 집합의 연결 가능성을 주장하지 않는다.
- 실제 iPhone17의 Safari와 설치 PWA는 미검증이다. Cloud Chromium/WebKit 에뮬레이션과 구분한다.
- 최종 renderer 복구 후 mode 왕복, 실제 hole, 축별 확대, 순차 비가시화, Collection, 동일 Event 선택·drawer, 기본 모드 복귀를 공개 URL에서 확인해야 한다. 최종 소스·배포 SHA, CI, health/status, asset digest, pointer·Render manifest 불변과 모바일 스크린샷을 이 문서에 추가해야 한다.

현재 체크포인트는 새 비교 형상과 로컬 수치 증거를 정리한 상태다. 최종 운영 배포·공개 검증 완료는 이 초안의 주장에 포함하지 않는다.
