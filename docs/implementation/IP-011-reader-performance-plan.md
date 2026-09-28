# IP-011 A4 종료와 A5 탐색 실험 재계획

2026-09-28 KST. 사용자 요청에 따른 실행 범위 분리. 상위 계획은 [IP-011](IP-011-architecture-realignment.md), 현재 실행은 [CURRENT](CURRENT.md), 기존 성능 계약은 [TS-006](../technical-specifications/TS-006-atropos-publication.md)과 [A1 budget](../evidence/ip011/a1-execution.md)이다. A4는 이후 같은 날 사용자 승인으로 종료됐다. [종료 결정·백로그](IP-011-A4-closeout-backlog.md)가 미충족 항목을 소유한다. 아래 R1–R3는 원래 실행·측정 계획이며 자동 재개하지 않는다. A5-E1~E3는 같은 날 후속 사용자 지시에 따라 [IP-011-A5-collection-discovery-plan.md](IP-011-A5-collection-discovery-plan.md)의 S0~S7로 대체됐다. A5 planning만 활성, 구현은 비활성이다.

## 1. 목표와 경계

아래 A5 열과 표현은 이 문서 작성 당시 범위 분리 기록이다. 최신 A5 결정은 §4의 후속 계획이 우선하며 이 표만으로 tile/cluster를 필수 구현으로 해석하지 않는다.

A4의 목표는 기존 화면·사건 의미를 유지하면서 오래 탐색해도 과거 방문량 때문에 현재 조작이 무거워지지 않게 하는 것이다. 원래는 고정 성능 gate 전체 통과를 종료 조건으로 삼았으나, 이번 사용자 결정으로 미충족을 백로그에 이관해 종료했다. 수치 기준은 유지한다. A5의 목표는 어느 배율에서도 읽을 수 있는 밀도와 Collection 탐색을 함께 설계·시험하는 것이다. A5는 A4 완료 후 별도 실험과 채택 판정을 거친다. A6는 A5 채택·통합 완료 이후이며 M5는 여전히 별도다.

| 항목 | A4에서 마무리 | A5에서 시험·결정 |
| --- | --- | --- |
| 데이터 보관 | v5 응답 재사용·중복 요청 병합·취소·용량 제한 | 고정 타일과 확대 단계별 공급 방식 |
| 화면 계산 | 역산한 viewport+작은 buffer로 후보 선정; 보관 데이터와 active 작업 집합 분리 | 단계별 요약·상세 표현과 tile 크기 조합 |
| Composite | 기존 표현의 안정된 원형 재사용·화면 밖 계산 제거 | 다른 배율에서 표현하는 방식의 UX 변경 |
| 부분 응답 | 사건/영역/관계의 completeness 구분, 이전 구간 누적·종류별 starvation 해결 | 단계별 완전성·요약과 원본 탐색 연결 |
| 밀도 | 기존 표시 규칙에서 불필요한 계산·DOM 제거 | 화면상 임시 cluster, fade, 이름/선 표시량 |
| Collection | 기존 ON/OFF·단일 Event·선택 보존 회귀 | 관련 Collection 발견·설명·추가 시 밀도 재분배 |
| 검증 | 고정 예산 + 연속 조작 + 장시간 왕복 탐색 | 가독성·내용 발견·표현 안정성과 비용 함께 비교 |

A4를 통과시키려고 사건을 새 규칙으로 숨기거나 cluster로 대체하지 않는다. 반대로 tile/cluster 실험 완료까지 A4를 무기한 확대하지 않는다. A4의 bounded cache는 필요하지만 새 다중 레벨 타일 프로토콜은 A4 필수 산출물이 아니다. 기존 응답 단위의 계약 미충족은 실패로 유지한다. 이번 범위 변경에 따른 A4 종료를 성능 통과로 처리하지 않는다.

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

원래 A4 성능 exit: R1/R2 correctness, R3와 기존 전체 gate, A3 UI/URL/선택/Collection 모두 OFF/공유 Event 회귀, CI/배포 SHA/smoke까지 충족. 성능 전체 통과는 미달이다. 사용자 승인으로 실행 단계만 종료하고 잔여는 A4-B01~03에 이관했다. A5 선행으로 A4 종료는 인정하되 A5 자체의 채택·검증과 열린 성능 항목 검토를 대체하지 않는다.

## 4. A5 — 후속 사용자 결정으로 대체

A5의 현재 목표·표현·state·relevance·실험·exit는 [Graph 중심 Collection Discovery](IP-011-A5-collection-discovery-plan.md)가 소유한다. 이 문서 앞부분의 A4 기록과 수치 기준은 유지한다.

기존 E1(Composite/fade 대 cluster), E2(tile/level), E3(discovery 결합) 순서는 표현 capacity를 먼저 검증하는 S0~S7로 대체한다. Island는 feature flag로 보존/비활성화하고 World+dominant Composite HUD를 시험한다. Semantic/Geographic 밀도와 interaction을 분리하며 full-viewport suppression은 유지한다. Pinned 의도와 Contextual Active/Suggested 추론을 분리하고 Suggested만 graph에 참여하지 않는다. Contextual은 안정성·provenance 검증 후 graph에 참여한다.

고정 tile/다중 level·임시 cluster는 실측 필요가 있을 때의 조건부 수단이며 의무 구현 산출물이 아니다. canonical identity, bounded cost, Revision/partial/cache, A4 수치 budget은 유지한다. A5는 planning만 활성이고 구현·A6/M5는 비활성이다.

## 5. 참고

- https://developers.google.com/maps/documentation/javascript/coordinates
- https://maplibre.org/maplibre-style-spec/sources/
- https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md
- https://docs.mapbox.com/mapbox-tiling-service/recipe-specification/vector/
