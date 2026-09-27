# IP-011 A4 종료와 A5 탐색 실험 재계획

2026-09-28 KST. 사용자 요청에 따른 실행 범위 분리. 상위 계획은 [IP-011](IP-011-architecture-realignment.md), 현재 실행은 [CURRENT](CURRENT.md), 기존 성능 계약은 [TS-006](../technical-specifications/TS-006-atropos-publication.md)과 [A1 budget](../evidence/ip011/a1-execution.md)이다. 이 문서는 재계획이며 아래 수정·실험이 구현됐다는 뜻이 아니다. A4만 실행 활성 상태다.

## 1. 목표와 경계

A4의 목표는 기존 화면·사건 의미를 유지하면서 오래 탐색해도 과거 방문량 때문에 현재 조작이 무거워지지 않게 하는 것이다. 고정 성능 gate를 통과해야 닫는다. A5의 목표는 어느 배율에서도 읽을 수 있는 밀도와 Collection 탐색을 함께 설계·시험하는 것이다. A5는 A4 완료 후 별도 실험과 채택 판정을 거친다. A6는 A5 채택·통합 완료 이후이며 M5는 여전히 별도다.

| 항목 | A4에서 마무리 | A5에서 시험·결정 |
| --- | --- | --- |
| 데이터 보관 | v5 응답 재사용·중복 요청 병합·취소·용량 제한 | 고정 타일과 확대 단계별 공급 방식 |
| 화면 계산 | 역산한 viewport+작은 buffer로 후보 선정; 보관 데이터와 active 작업 집합 분리 | 단계별 요약·상세 표현과 tile 크기 조합 |
| Composite | 기존 표현의 안정된 원형 재사용·화면 밖 계산 제거 | 다른 배율에서 표현하는 방식의 UX 변경 |
| 부분 응답 | 사건/영역/관계의 completeness 구분, 이전 구간 누적·종류별 starvation 해결 | 단계별 완전성·요약과 원본 탐색 연결 |
| 밀도 | 기존 표시 규칙에서 불필요한 계산·DOM 제거 | 화면상 임시 cluster, fade, 이름/선 표시량 |
| Collection | 기존 ON/OFF·단일 Event·선택 보존 회귀 | 관련 Collection 발견·설명·추가 시 밀도 재분배 |
| 검증 | 고정 예산 + 연속 조작 + 장시간 왕복 탐색 | 가독성·내용 발견·표현 안정성과 비용 함께 비교 |

A4를 통과시키려고 사건을 새 규칙으로 숨기거나 cluster로 대체하지 않는다. 반대로 tile/cluster 실험 완료까지 A4를 무기한 확대하지 않는다. A4의 bounded cache는 필요하지만 새 다중 레벨 타일 프로토콜은 A4 필수 산출물이 아니다. 기존 응답 단위로 계약을 만족시키지 못하면 실패 증거와 범위 변경안을 명시하며 A4를 먼저 완료 처리하지 않는다.

## 2. 확인된 출발점과 미확정 부분

분석 기준 main e9be5648fa78d2e9c1c2cdf682b165df7c2d7e29. PR #226 배포·main CI 36315919416·post-deploy 36316264388 성공은 기능 증거다. 최종 후보의 성능 run 36315902479는 1k/10k dense pan max 123/131ms로 실패했다. 기존 서버/worker 성공 범위는 [A4 실행](../evidence/ip011/a4-execution.md) Slice 24–25에 있다.

사용자는 오래 탐색하면 전반적으로 느려지고 이전의 빠른 구간으로 복귀해도 회복되지 않는다고 보고했다. 이를 단일 long frame과 동일 원인으로 단정하지 않는다. 코드에서는 v5 loader의 응답 cache/실제 취소 부재, 부분 응답의 과거 데이터 합치기, 이동마다 Composite hull 재구성, 늦은 화면 밖 필터, 이동 때마다 재예약되는 퇴장 정리를 확인했다. reconcileViewport 원함수에 구간별 100개 사건을 넣으면 5회 500개·10회 1000개·25회 2500개가 남고 region/edge가 0으로 밀려난다. 부분 응답으로 첫 구간에 돌아와도 2500개가 유지되고 완전 응답이면 100개로 줄어든다. 이는 로직 결함 재현이며 사용자의 기기 증상 전체를 재현한 결과는 아니다.

## 3. A4 실행 순서와 산출물

### A4-R1 — 요청·보관·활성 데이터 분리

- 실제 운영 v5 경로에 bounded response reuse, 동일 요청 병합, superseded 요청 취소/sequence 검증을 연결한다. 만료된 응답은 무거운 해석·변환 전에 배제한다.
- World/Revision/좌표·배치 버전/선택 조건을 구분한다. mutable pointer 재확인과 immutable 자료 보관을 분리한다. 완전 응답·부분 응답·빈 구역·실패를 혼동하지 않는다.
- 지금 필요한 범위, 미리 받을 범위, 재방문용 보관 범위를 분리한다. cache 전체를 active 배열로 합치지 않는다. geometry/edge 누락 여부와 종류별 예산을 분리해 과거 사건 때문에 새 영역·선이 사라지지 않게 한다.
- 용량·항목·동시 요청 상한을 코드와 시험 fixture에 명시한다. 캐시 값은 정당한 근거로 선택하고 exit 측정 전에 고정한다. 직렬화 bytes를 실제 heap 사용량으로 보고하지 않는다.

### A4-R2 — 현재 화면의 작업량 제한

- 이미 존재하는 getVisibleWorldBounds 역변환을 client active query에도 적용한다. 위치 색인으로 viewport+표시 buffer 후보를 먼저 고르고 그 뒤 화면 좌표를 계산한다.
- 선의 교차, 영역의 겹침, label/hit target 여유를 보존한다. 화면 밖의 endpoint/parent가 필요하다는 이유로 관련된 모든 descendant를 무제한 활성화하지 않는다.
- world geometry/포함 관계와 매 frame 화면 변환을 분리한다. Composite 원형은 동일 자료·버전에서 재사용하고 일부 child 수신만으로 완전한 원형이라고 간주하지 않는다. 필요하면 기존 표현을 보존하는 bounded derived geometry를 공급한다.
- label 충돌은 현재 주변 후보에 제한한다. 투명·화면 밖 SVG를 제거하고, 퇴장 정리는 각 항목의 퇴장 시각 기준으로 완료한다. 같은 화면으로 돌아왔을 때 방문 이력으로 모양/작업량이 달라지지 않아야 한다.

### A4-R3 — 기존 gate와 지속 탐색 gate

[A1 고정 budget](../evidence/ip011/a1-execution.md)은 모두 유지한다. server cold/warm·read growth·worker 성공을 유지하며 변경 경로의 회귀를 확인한다. 모바일 pan/zoom/toggle 각각 p95 ≤33.4ms, max ≤100ms를 유지한다.

추가 시험은 동일 Revision/화면 크기/선택/위치/배율에서 시작해 다른 구간 30회 왕복과 확대·축소·Collection OFF/ON을 수행하고 시작 상태로 복귀한다. 서로 다른 경로와 3개 checkpoint를 기록한다. 새로고침 없이 같은 화면의 active IDs/geometry가 초기 상태와 일치하고, 이전 방문량에 비례해 active 후보·DOM·반복 계산량이 증가하지 않아야 한다. cache/in-flight/퇴장 객체는 정한 상한과 정리 시한을 준수한다. 일부 응답·지연/역순 응답·오류·Revision 변경도 포함한다.

600-frame 시험의 대부분을 idle로 채워 연속 조작 비용을 희석하지 않는다. 실제 연속 조작 구간의 frame을 별도 600개 이상 확보하고 기존 고정 frame 상한을 적용하며 전체 구간도 함께 보고한다. 시작/중간/복귀 checkpoint 각각 통과해야 한다. 원시 시간 분포·요청 수/bytes·active/cache 크기·계산 횟수·DOM을 남긴다. WebKit에서 직접 측정할 수 없는 heap 값은 미측정으로 남기고 타 브라우저의 보조 관측으로 대체 통과하지 않는다.

A4 exit: R1/R2 correctness, R3와 기존 전체 gate, A3 UI/URL/선택/Collection 모두 OFF/공유 Event 회귀, CI/배포 SHA/smoke까지 충족. 실패하면 A4 미완료이고 A5로 넘겨 완료를 주장하지 않는다.

## 4. A5 — 읽기 밀도와 Collection discovery의 제한된 실험

### A5-E1: 표현 계약과 네 장면

멀리 보기 → 밀집 묶음 선택 → 확대해 개별 사건 읽기 → Collection 추가/제거의 네 장면을 먼저 설계한다. 빈 구간을 채우는 최소 밀도가 아니라 읽기 부담의 상한을 목표로 한다. 점·이름·선을 각각 관리한다. canonical Composite, Collection, 화면상 임시 cluster를 구분하며 cluster를 정본 Event로 저장하지 않는다. 숨긴 내용의 존재와 개별 사건에 도달하는 경로, 선택 유지, 부분/요약 표시를 명시한다.

A안: 기존 Composite+단계적 label/fade. B안: A안에 임시 밀집 cluster를 추가. 우선 두 안으로 한정한다. 역사 중요도를 임의 도입하지 않으며 결정적 공간·화면 규칙부터 비교한다. 새 표시 의미는 BR-003/JRN-004/TS-006에 채택안을 반영한 뒤 운영 적용한다.

### A5-E2: 고정 타일·레벨 prototype

- Google의 공개 tile coordinate 모델과 MapLibre/Mapbox vector tile 원리를 참고한다. 제안은 Moirai 자체 설계이며 Google 내부 알고리즘의 재현 주장이 아니다.
- 연속 display zoom과 불연속 data level을 구분한다. 독립 X/Y 확대에 대해 직사각형 두 축 레벨과 단일 레벨의 요청량을 비교한 뒤 채택한다. 모든 레벨 조합을 사전 생성하지 않는다.
- 기존 spatial index를 bounded tile 생성 기반으로 활용한다. geometry/index 저장 계층은 display zoom level과 동일하지 않다. 고정 원점·경계·버전, empty/partial/page, filter identity를 계약화한다.
- tile 경계 buffer, 사건 중복 제거, 선/영역 조각 보존, 반투명 중복 칠하기 방지, 화면 단위 label 배치를 검증한다. geometry 안정화 없이 현재 hull 재계산을 tile 안으로 옮기는 것으로 끝내지 않는다.
- cache key는 World/Revision/좌표·배치·표현 버전/레벨/구역/응답에 영향을 주는 필터를 포함한다. 현재/주변/보관 tile을 분리하고 byte·decoded memory·동시 요청을 제한한다. 부모 대체는 요약/불완전임을 유지하며 잘못된 selection/Revision tile을 잠시라도 혼합하지 않는다.
- 고밀도 최상위 tile은 자동으로 bounded가 되지 않는다. 상세 단계·continuation 정책과 전체 viewport 요청 budget이 필요하다. 수치 선택은 prototype 근거로 고정하고 tile당 예산만으로 화면 전체 비용을 통과 처리하지 않는다.

### A5-E3: Collection discovery 통합과 채택 판정

선택 Collection 합집합 → Event 중복 제거 → 밀도 정책 → 별도 Collection 후보 탐색 순서로 책임을 분리한다. 여러 Collection을 켜도 같은 Event를 복제하지 않고, 비선택 Collection 추천 때문에 그 사건을 그래프에 암묵적으로 추가하지 않는다. 기존 A5의 membership/temporal/adjacency candidate·설명·paging·empty/no-time·모바일 container gate를 유지한다.

같은 fixture·단말에서 A4 기준선과 A/B를 비교한다. 사건 찾기/묶음 펼치기/선택 보존/Collection 추가 후 맥락 읽기, 겹침·깜빡임·발견 불가능한 내용, frame/bytes/memory를 함께 판단한다. 채택 기준의 수치·필수 시나리오는 실험 전에 기록하며 통과 run을 고른 뒤 기준을 정하지 않는다. 사용자가 읽기 경험을 확인할 수 있는 prototype과 채택/기각 근거를 제공한다. A4보다 숨겨서 빨라진 결과만으로 채택하지 않는다.

A5 exit는 E1–E3 채택안의 계약 반영·통합·성능 및 기존 discovery gate 통과다. 기각한 cluster/tile 안은 명시적으로 보류하고, 대안이 목표를 충족했는지 기록한다. prototype만으로 A5 완료 또는 A6 활성화하지 않는다.

## 5. 참고

- https://developers.google.com/maps/documentation/javascript/coordinates
- https://maplibre.org/maplibre-style-spec/sources/
- https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md
- https://docs.mapbox.com/mapbox-tiling-service/recipe-specification/vector/
