# TSTL 후보 A 구현 handoff

2026-10-13 KST · 상태: 후속 구현용 지시서 · 이 문서의 발행 자체는 구현·배포 증거가 아니다.

## 시작점과 이번 범위

실행 환경에서 모델 **Astra**, 추론 **Ultra**를 선택한다. 프롬프트는 모델 설정을 바꾸지 않는다.

저장소: https://github.com/neocjmix/moirai
문서 브랜치: `docs/tstl-world-history-design-2026-10-13`
이 브랜치를 fetch한 뒤 그 HEAD에서 새 `feat/tstl-candidate-a-preview` 브랜치를 만든다. 최신 main을 기반으로 해야 한다면 문서 commit을 명시적으로 가져오고 아래 두 문서가 존재하는지 먼저 확인한다. 문서 브랜치나 main에 force push하지 않는다.

먼저 AGENTS.md → docs/INDEX.md → IS-001 / IP-001 / CURRENT와 관련 CON-003, CORE-MODEL, TS-002/005/006/010을 읽고 현재 코드·배포 상태를 재확인한다. [전체 설계](tstl-world-history-design-2026-10-13.md)의 불변조건과 검증 계약을 따른다. 연구 제안이 accepted 의미를 덮어쓰지 않는다. 충돌은 기록하고 범위를 조정한다.

첫 결과물은 **현행 B0와 후보 A 하나를 비교하는 독립 preview**다. B/C 독립 알고리즘, 전면 fragmentation, 대규모 사용자 연구, production 기본값 승격·backfill은 이번 범위가 아니다. A에 필요한 국소 typed line/port/list fallback은 구현한다.

## 순차 체크포인트

### 1. Baseline을 실제 데이터로 재현

- 문서가 확인한 main은 `d721b0efdcf309ed7ad21c55bc04572e2f14d644`다. 더 최신 main이면 차이를 기록하고 비교 baseline SHA를 고정한다.
- B0는 현행 `global-incidence/1`과 기존 contains hull이다. legacy force를 현재 기본값이라고 부르지 않는다.
- `scripts/layout-research/data/history-r56.json`을 고정하고 byte SHA-256 `b3d846434095c536fc75c5c098ef87d77d18aa00210627b305eac407fc9461ae`를 확인한다. 539 Events, 614 contains edges, 7 Collections가 있는 실제 이력 fixture다. live 최신 revision을 뜻하지 않는다.
- `collection-incidence.test.ts`처럼 outer events/relations/collections에서 누락 incidence를 재구성한다. 기존 digest를 인용하는 데 그치지 말고 replay한다.
- 산출물: 재현 명령, input/output digest, baseline 그림·실측, 현재 seam 목록을 작은 commit으로 남긴다.

### 2. Validator와 시간 계약부터 고정

- 단일 Event ID/semantic hit target, contains DAG, leaf carrier와 ancestor signature, 정확 membership·port·unique count를 독립 oracle로 확인한다. Collection 선택은 contains가 아니다.
- exact/uncertain instant/duration/descendant span/unplaced를 구별한다. Y와 시간 경계를 충돌 회피로 옮기지 않는다. r56 scalar snapshot만으로 원래 시간 의미를 복구할 수 없으므로 lossless TemporalSidecar를 확보하거나 `legacy-scalar-only` 한계를 표시한다.
- 전체 최종 geometry의 member inclusion, nonmember exclusion, exact atom 및 연결 zone witness, hybrid patch mode를 검증한다. 직렬화·stroke·mesh·clipping 이후 의미도 검사한다.
- raster/중심점 검사만으로 exact certificate를 발급하지 않는다. 수치 불명·시간 근거 미확인·부분 source는 unknown으로 남기고 미검증 fill은 내린다.
- DAG diamond, 동일 leaf의 P→C, 우연한 subset, 같은 Y의 AB/AC/BC, triple 없는 pairwise overlap, 긴 interval 순서 cycle, unknown/open time, hybrid seam을 회귀 fixture로 남긴다.
- 산출물: 실패를 실제로 잡는 테스트, validator 범위와 한계, B0의 실패도 포함한 진단표.

### 3. 후보 A를 최소 구현

- 전체 설계 §6–8, §11–12의 deterministic order → fixed-Y X/QP → piecewise-linear contour → bounded repair → 명시적 line/port/list fallback을 구현한다. 전역 최적성은 주장하지 않는다.
- 중요 seam: `LayoutOutput`의 region은 bounds만 전달하고, `compileV5RenderPublication`은 자식 point/polygon으로 `buildRenderConcaveHull`을 다시 계산한다. **X만 바꾸면 검증한 contour가 화면에 남지 않는다.** 독립 prototype geometry 계약과 소비 경로를 만들어 검증한 contour가 실제 draw/mesh/hit-test까지 보존되는지 확인한다.
- 예산 초과·실패·면/선 전환을 숨기지 않는다. 같은 Event를 복제하거나, support를 지우거나, 역사 관계를 고쳐 성공률을 높이지 않는다.
- pan/zoom/Collection toggle과 A→B0→A 복귀에서 canonical X/hash·시간·선택 identity를 보존한다. 생략된 ID마다 이유와 실제 reveal route를 제공한다.
- 산출물: B0/A를 동일 fixture·scope·viewport trace로 비교한 coverage/fallback/실패율, 결정성·renderer 검증 결과.

### 4. 독립 preview를 배포하고 확인

- production 기본 layout/config, served pointer, canonical history/contains/Narrative/Collection membership을 바꾸지 않는다. 기존 production main UX와 분리된 preview만 사용한다. 별도 유료 자원이나 권한 확장이 필요하면 먼저 구체적인 승인을 받는다.
- 현재 GraphShell의 camera/selection/drawer와 모바일 탐색 문법을 보존한다. 처음부터 새 제품 UI를 재설계하지 않는다.
- 관련 format/lint/typecheck/unit/contract/build, secret scan과 모바일 browser smoke를 실행한다. 실제 r56 공유·중첩 사례와 작은 반례를 모두 사용한다.
- 검증되지 않은 fill은 preview에서도 semantic fill로 제시하지 않는다. 부분 구현은 목록/선 fallback과 명확한 진단으로 공개할 수 있다.
- 공개 preview URL을 열어 deployed SHA, desktop 1280×800/mobile 390×844, 확대·축소·Collection 토글·접힘·공유 Event 선택·숨은 ID 복원을 확인한다. 실제 기기 증거와 emulation을 구분한다.
- 최종 전달: preview URL, source/deployed SHA, 테스트·smoke 결과, B0/A 비교, 실제 측정과 미측정 한계, 다음 최소 단계. 수치 목표는 달성 증거가 아니다.

각 단계마다 작은 commit과 관측 결과를 남기고 이어서 진행한다. 한 번에 전체 연구를 구현하거나 장문 성공 보고로 검증을 대체하지 않는다. 중단 시 마지막 검증된 checkpoint와 재개 명령을 남긴다.
