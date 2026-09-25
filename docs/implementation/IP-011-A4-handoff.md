# IP-011 A3 완료 기준선과 A4 인계

2026-09-25. 이 문서는 다음 세션의 실행 인계다. 제품 의미와 exit의 권위는 [IP-011](IP-011-architecture-realignment.md), [TS-006](../technical-specifications/TS-006-atropos-publication.md), [A1 고정 budget](../evidence/ip011/a1-execution.md)에 있다. 현재 활성 상태는 [CURRENT](CURRENT.md)를 따른다. 다음 세션에서 A4 실행 지시를 받으면 A4를 활성화하고 진행한다.

## A3 완료 기준선

- 코드: PR #196 squash `9ff100d37562b6177f2694232570aa02485a81e6`; 증거: PR #197 squash `9dbdd99ffb690c25e3da29cdf9f0be74c940baa4`. A3 이전 UI 참조 commit `b2dbc64e07f0085ce330caf2ec3c6d6f7e93702d`. 별도 V5Explorer는 제거됐고 기존 App/GraphShell/CSS/드로어와 모바일 조작을 유지한 채 v5 데이터를 연결했다. 자세한 파일 경계와 증거는 [UI 복구](../evidence/ip011/a3-ui-restoration.md).
- 운영: World Revision 32, v5 served/current/target 32; 127 Event, 6 Collection, 415 Relation, 133 Narrative. 운영 전환의 backup/restore·9 scenario·정책/replay 근거는 [A3 실행](../evidence/ip011/a3-execution.md). 공개 [Atropos 그래프](https://moirai-production-8ed1.up.railway.app/graph)와 `/__status`가 관측면이다.
- 검증: PR #196 최종 CI `36114960810`, post-deploy smoke `36115276269` 통과. PR #197 문서 병합 후 공개 `/__status`에서 `9dbdd99`의 contract 5/v5 publication을 확인했고 smoke `36115869450`의 public readiness·live iPhone WebKit 탐색·인증 authoring 단계가 통과했다. 운영 브라우저에서 원래 source island/graph/drawer를 관찰했다. 이 증거는 **A3 UI/의미 exit**이며 A4 성능 exit 증거는 아니다.

## A4 시작 경계

A4는 World/Collection 전체 materialization을 없애고 paged index, stable layout, incremental client, bounded authoring query를 구현·검증한다(IP-011 §3; TS-006.2~.4, .7~.8). 성능 최적화 중에도 A3 UI 정체성, 공유 Event 한 노드와 좌표, Collection 모두 OFF, World Event/Collection Narrative 구분, 미배치 Event, Composite child/adjacency, canonical URL, drawer·모바일 pan/zoom/selection을 유지한다. 레이아웃 교체는 범위가 아니다. A5 discovery UX/추천, A6 대량 역사 입력, M5와 새로운 인프라·공급자는 활성화하지 않는다.

첫 작업은 main/운영 SHA 및 Revision을 재확인하고 **v5** 실제 경로를 계측하는 것이다. 과거 A1의 v4 수치는 병목 근거이지 현재 v5 실측이 아니다. 원인별로 DB rows/history replay, worker CPU/RSS, object reads/index+artifact bytes/parse, HTML/payload, React/layout/frame을 분리하고 고정 local query에서 1k→10k→100k로 먼 데이터만 늘린다. sparse/dense/shared-membership/very-large-Collection을 각각 포함한다. 기존 `.github/workflows/ip004-scale.yml`은 100/1k/10k와 v4 시절 fixture여서 A4 exit의 대체물이 아니다. v5 fixture·runner를 별도로 확장하고 먼저 측정치와 재현 절차를 기록한다.

계측 결과에 따라 가장 큰 interactive 병목을 작은 배포 가능한 slice로 해결한다. Publication의 `packages/publication/src/v5-*`, `packages/graph-presentation/src/v5-*`, web의 `apps/atropos-web/src/lib/v5-*` 및 기존 URDR port adapter, `packages/persistence/src/read-profile.ts`를 시작 지점으로 조사한다. 개별 파일을 변경 대상으로 미리 확정하지 않는다. 각 slice에서 fixed query의 출력/Revision/동일성/partial 의미, UI 회귀, 비용 측정, 새 배포 SHA와 synthetic smoke를 함께 검증한다. canonical 변경은 versioned migration·격리 rehearsal을 거치고 운영 데이터를 synthetic scale 시험에 사용하지 않는다. 새 manifest가 실패하면 이전 served pointer를 유지하며 성공한 v5 쓰기를 단순 앱 롤백으로 취소했다고 주장하지 않는다.

## 고정 exit와 보고

[A1 budget](../evidence/ip011/a1-execution.md) 그대로 Ubuntu hosted runner/PostgreSQL 17/local object store/iPhone 14 WebKit/no throttling에서 측정하고 host/runtime·fixture shape·cache 상태·raw samples를 남긴다. cold process 20회: index+artifact 총 <=1 MiB, object <=256, p95 <=500 ms; warm 50회 p95 <=100 ms. 고정 query의 rows/bytes는 1k→100k에서 2배 이하, 전체 history replay 0. Dense overflow는 명시적 partial/continuation. 첫 decoded HTML 및 후속 graph response 각각 <=1 MiB. 모바일 20 navigation p95 graph-ready <=3000 ms, drawer <=1000 ms, page error 0. pan/zoom/Collection toggle 각각 post-ready 600 frame 이상에서 p95 <=33.4 ms, max <=100 ms. Authoring search/discovery도 cold/warm 500/100 ms p95와 명시적 continuation, discovery 후보 500·page 20. Worker는 별도 10k build <=180 s/<=3 GiB 회귀를 유지하고 100k CPU/RSS/output/cancel/restart를 보고한다. 예산을 조용히 완화하거나 warm-only 결과로 완료하지 않는다.

종료 시 CI·PostgreSQL·WebKit·secret scan·배포 smoke를 통과시키고 World 증가 대비 bounded cost 및 cold/warm/dense/frame을 수치로 제출한다. 성공하지 못한 gate는 실패로 명시해 다음 slice에서 이어간다. 현재 A3에서 입력·응답·viewport·선형 연결 읽기에 상한이 있어도 상류 전체 작업과 cold latency·100k 비용은 아직 증명되지 않았다.
