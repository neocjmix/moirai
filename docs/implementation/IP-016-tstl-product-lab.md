# IP-016 · TSTL 제품 실험실

2026-10-13 KST. 사용자는 독립 프리뷰의 선·포트만으로는 면 레이아웃을 평가할 수 없다고 지적하고, 프로덕션 설정의 실험실 옵션에서 기존 가로·세로 확대와 순차적 비가시화를 사용해 후보 A를 시험하도록 명시적으로 승인했다. 이 요청은 이 실험에 한해 이전 preview-only/GraphShell 격리 조건을 대체한다. 선택형 기능의 구현·PR 검토·병합·기존 Railway 서비스 배포·공개 검증까지 수행한다.

## 관찰할 결과

- 기본값은 현재 운영이다. 설정에서 동일한 고정 history-r56의 B0와 후보 A를 선택하고 그래프에서 왕복 비교한다. 선택은 해당 브라우저·World의 로컬 상태다.
- 전체 r56 artifact를 한 번 읽는다. 오프라인에서 후보 A를 계산하며 viewport별 발행, 새 tile/compiler generation, 런타임 solver는 만들지 않는다.
- 기존 GraphShell의 축별 확대·패닝·밀도/표현 단계·Collection 선택·Event 선택·drawer를 재사용한다. 단일 Event ID와 원래 시간 Y를 유지한다.
- A의 분리된 윤곽을 렌더러까지 보존해 채운다. 분리된 ring을 연결하는 면, spline/padding/feather에 의한 윤곽 변형은 만들지 않는다. 면을 만들지 못한 Composite는 명시적인 점·관계·목록 표현을 유지한다.
- 이 면은 실험 시각화다. 기존 검증기의 semantic-fill 인증을 바꾸거나 통과했다고 표시하지 않는다. scalar-only는 snapshot의 시간 지식 손실을 뜻하며, 면을 그릴 수 없다는 뜻이 아니다.

## 구현·검증 순서

1. 기존 baseline/검증기/후보 A 커밋을 보존한다. compact r56 artifact, digest/scope 검사와 기존 density adapter를 연결하고 identity/Y/선택 회귀를 검사한다.
2. 고정 multi-ring 렌더링을 추가한다. worker/cache/mesh/hit/label 경로와 원래 B0 동작을 검사한다.
3. 설정과 그래프 비교 UI를 붙인다. Chromium 및 WebKit 모바일에서 면, 축별 확대, 단계 변화, 카메라/선택 유지, drawer, Collection, 새로고침을 검증한다.
4. 작은 커밋·PR diff 검토, 관련 unit/contract/type/lint/build/secret 및 CI 검사를 수행한다. 기존 main 자동 배포 후 공개 SHA·health·실제 모바일 흐름·r56 pointer 불변을 확인한다. 실제 iPhone 17 Safari/PWA 검증과 에뮬레이션을 구분한다.

CON-003, CORE-MODEL, TS-002/005/006/010의 identity·시간·관계 계약과 IP-015의 화면 구조를 보존한다. 역사 정본 수정, 운영 기본값 변경, served pointer/backfill, 새 유료 서비스와 광범위 성능 튜닝은 범위 밖이다. 독립 프리뷰와 그 날짜별 증거는 그대로 보존한다.

## B/C 후속 승인 · 2026-10-13

A 운영 검증 뒤 사용자가 “다른후보들도 이어서 구현하자”라고 요청했다. 같은 선택형 제품 실험실에 연구 설계 §9의 B/C를 추가하고 검토·병합·기존 Railway 자동 배포·공개 모바일 검증까지 진행한다. 기본값·역사·served pointer 유지 조건은 계속 적용한다. 이 후속 승인은 위 첫 배포의 B/C 제외만 대체한다.

- A의 동일한 539 Event XY에서 geometry-only 비교를 한다. B는 장애물을 피하는 결정적 제한 rectilinear terminal forest와 실험 면, C는 시간 방향 spine·membership 연결·국소 atom 면을 사용한다. 전체 최적 Steiner·진짜 split/rejoin·joint solve를 구현했다고 주장하지 않는다.
- 계산 cap·비회원 glyph 침범·연결 실패를 기록하고 정확한 membership 목록과 기존 Event 상세 접근을 남긴다. 모든 면은 실험 표현이며 기존 의미 인증기를 완화하지 않는다.
- fixed contour와 open trace를 worker/cache/render까지 보존한다. 선을 닫아 면을 만들거나 선의 교차에 관계 hit target을 생성하지 않는다. 동일 원래 Event 선택을 유지한다.
- 오프라인 두 후보를 각각 검증·작은 커밋으로 남기고, 제품 설정/URL/브라우저 로컬 선택을 B0/A/B/C로 확장한다. 축별 확대·Collection·밀도 전환·drawer·복귀를 desktop Chromium 및 mobile Chromium/WebKit으로 검사한다.
- 배포 전후 fixture·pointer·기존 Render manifest digest와 공개 SHA를 비교한다. 실제 iPhone17 Safari/PWA 관찰과 에뮬레이션은 구분한다.

관련 의미 계약은 CON-003, CORE-MODEL, TS-002/005/006/010이며 관측 URL은 `/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=B` 및 `layoutLab=C`다. 화면 영역별 발행과 광범위 성능 튜닝은 추가하지 않는다.

## B/C 구현·배포 결과

PR #353/#354로 구현·검토·병합하고 runtime `85bf228`의 기존 Railway 자동 배포를 확인했다. [날짜별 증거](../evidence/tstl-bc-product-lab-2026-10-13.md)가 동일 좌표 비교, 고정 도형 가시성 회귀, 공개 desktop/mobile 검증, CI와 남은 제한을 소유한다. 이는 B/C를 실험실에서 평가할 수 있게 한 결과이며 기본값 채택·의미 인증·역사 재발행 승인이 아니다. 다음 최소 단계는 실제 iPhone17 Safari/PWA에서 B0/A/B/C의 가독성과 탐색 비교다.
