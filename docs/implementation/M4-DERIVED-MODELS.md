# M4 파생 모델·비교·그래프 구현 기록

관련 기준: CON-003, BR-003, BR-004, JRN-005, TS-005, TS-006, IS-001, IP-001 M4.

> 2026-09-09 KST 사용자 결정으로 M4는 Slice A~F의 검증 결과를 보존한 채 조기
> 종료됐다. 원래 M4 종료조건을 모두 만족한 완료가 아니다. 이후 graph query, Canon
> 비교, 규모 제어와 viewport 작업은
> [M4.5 Atropos 탐색 UI 계획](M4.5-ATROPOS-EXPLORATION-UI.md)에서 Moirai-native
> 계약으로 다시 시작한다.

## Slice A — 결정적 Timeline projection

독자가 Clotho Synthetic Observatory의 chronology를 공개 Atropos에서 읽을 수 있게 한다. 입력은 정확한 World Revision의 Canon, Event, Time System, temporal placement와 `precedes` Relation이다. 출력은 Canon의 사실을 수정하지 않는 Revision별 immutable graph artifact다. 로컬 contract test는 고정된 Lantern revision 2 fixture를 사용한다.

### 외부에서 확인할 동작

- Canon page가 server에서 선택한 `served_revision`과 같은 Revision의 Timeline artifact를 읽는다.
- authored coordinate와 구조에서 추론한 위치, 배치되지 않은 Event를 구분한다.
- 근거가 없는 Event를 임의의 단일 순서로 만들지 않고 unordered group 또는 unplaced로 표시한다.
- cycle은 Event나 Relation을 삭제하지 않고 `timeline_cycle` 진단으로 공개한다.
- 같은 Revision, parameters와 algorithm version은 입력 배열 순서와 무관하게 같은 semantic digest를 만든다.
- artifact는 evidence ID와 completeness를 포함하고 private origin·actor·Change Set을 포함하지 않는다.

### 변경 경계

- `@moirai/projections`: 순수 Timeline projector와 결정성·진단 테스트
- `@moirai/publication`: Canon-Time System별 graph artifact와 manifest algorithm version
- `@moirai/contracts`: 공개 Timeline document와 publication format version
- `atropos-web`: Revision 고정 reader와 JavaScript 없이 읽을 수 있는 Timeline 목록

정본 schema, Change Set 계약, Clotho/Lachesis 권한, worker 배포 경계와 기존 synthetic 내용은 변경하지 않는다. JointJS canvas와 interactive pan·zoom은 다음 graph slice에서 추가한다.

### 종료 조건

1. shuffled input golden test의 semantic digest가 동일하다.
2. authored 범위가 겹치는 Event는 같은 unordered group으로 남는다.
3. cycle과 unplaced 입력이 각각 진단되며 정본 입력은 변하지 않는다.
4. manifest가 Timeline algorithm version과 artifact digest를 포함한다.
5. Atropos Canon route가 동일 served Revision의 Timeline과 Event 근거 링크를 server-render하고 artifact가 evidence ID를 보존한다.
6. 전체 CI, 기존 Lantern revision 2 회귀 smoke와 새 Clotho synthetic Timeline smoke가 통과한다.

### 완료 근거

- 구현 SHA: `0bbabae947761b0cc380951a56677bd7e443db09`
- CI: [33861480738](https://github.com/neocjmix/moirai/actions/runs/33861480738) — 전체 품질·PostgreSQL integration·mobile WebKit·secret scan 성공
- 배포 smoke: [33861786238](https://github.com/neocjmix/moirai/actions/runs/33861786238) — 정확한 Clotho SHA, HTTP·MCP 동일 결과, validate 무변경, commit replay, revision 21 publication과 Atropos SSR 성공
- 검증 World: Clotho Synthetic Observatory `01995c2a-7b00-7000-8000-000000000101` 하나로 제한

중간 smoke에서 Atropos와 독립 배포되는 Clotho 서비스의 SHA 대기가 10분 상한에 도달했다. Clotho health identity를 `no-store`로 명시하고 smoke에 비밀정보를 포함하지 않는 단계 표식을 추가한 뒤 두 서비스의 동일 SHA와 전체 경로를 재검증했다.

## Slice B — Subject projection과 stable handle

독자가 동일한 인물·조직·장소·사물로 명시적으로 연결된 Event 집합을 안정적인 URL에서 읽을 수 있게 한다. 이름·title·Narrative 문자열은 정체성 병합 근거로 사용하지 않는다.

### 외부에서 확인할 동작

- `identity_continues`·`identity_instance_of`의 Canon별 weak component를 Subject로 계산한다.
- `identity_splits`·`identity_merges`는 Subject를 합치지 않고 lineage edge로 보존한다.
- 분리 후 anchor component가 기존 handle을 유지하고, 병합 후 오래된 handle이 대표가 되며 나머지는 redirect한다.
- anchor Event가 철회돼도 기존 member가 남으면 안정적인 새 anchor를 선택하면서 handle ID를 유지한다.
- Canon page, 검색과 `/subjects/{subjectHandleId}`가 같은 served Revision의 immutable artifact만 읽는다.
- label과 모든 파생 결과는 Event·Relation·Narrative·시간 배치 evidence로 돌아갈 수 있다.

### 변경 경계

- `@moirai/projections`: 순수 Subject projector, 결정적 handle과 reconciliation
- `@moirai/persistence`: 재생성 가능한 handle·member 운영 식별 표면
- `@moirai/publication`: Revision별 Subject document, Canon reference와 검색 entry
- `atropos-web`: Subject 목록과 stable public route

정본 Event·Relation 계약, Clotho/Lachesis 권한과 Timeline 의미는 변경하지 않는다. Process·State·Duration, JointJS canvas·subject lane, scope·LOD와 Canon 비교는 후속 slice다.

### 종료 조건

1. 입력 순서와 문자열 일치가 Subject 구성을 바꾸지 않는다.
2. Canon 경계를 넘는 identity Relation이 Subject를 합치지 않는다.
3. split·merge·anchor 교체 test에서 기존 URL이 유지되거나 명시적으로 redirect된다.
4. migration과 PostgreSQL integration test가 handle·member 재실행의 중복 방지를 검증한다.
5. manifest가 Subject algorithm version과 artifact digest를 포함한다.
6. Atropos가 동일 served Revision에서 Subject와 member Event evidence를 server-render한다.
7. 전체 CI와 Clotho synthetic identity→Subject→Atropos smoke가 통과한다.

### 완료 근거

- 구현·배포 SHA: `a396a3a5c4e7dd64374813e56fd9e1d597a292e9`
- CI: [33879616711](https://github.com/neocjmix/moirai/actions/runs/33879616711) — 전체 품질·PostgreSQL migration/integration·mobile WebKit·secret scan 성공
- 배포 smoke: [33879771900](https://github.com/neocjmix/moirai/actions/runs/33879771900) — Railway 3개 서비스 성공 후 정확한 Clotho SHA, HTTP·MCP 동일 결과, validate 무변경, commit replay, revision 23 Subject artifact·digest·immutable header와 Atropos Canon/Subject SSR 성공
- 검증 World: Clotho Synthetic Observatory `01995c2a-7b00-7000-8000-000000000101` 하나로 제한

첫 구현 CI에서 기존 mobile WebKit 검사가 같은 Event를 가리키는 `causes`와 `identity_continues` 링크를 구별하지 못했다. 관계 종류까지 포함하는 selector로 회귀 검사의 의도를 명시한 뒤 전체 CI와 배포 경로를 다시 통과시켰다.

## Slice C — Process와 Duration projection

독자가 과정으로 지정된 Composite Event를 stable Event URL에서 열고 직접 child, 전체 descendant, 구조적 시작·종료 후보와 파생 Duration을 근거와 함께 읽을 수 있게 한다.

### 외부에서 확인할 동작

- `kind = composite`이면서 `roles`에 `process`가 있는 Event만 Process로 계산한다.
- `contains`의 transitive closure를 artifact에서 계산하되 정본 Relation으로 다시 쓰지 않는다.
- 직접 child, 전체 descendant, 포함 깊이와 내부 Relation을 구분한다.
- descendant 시간 경계가 같은 Time System에서 비교 가능할 때만 Duration을 계산한다.
- 불확실한 경계는 단일 값으로 축소하지 않고 최소–최대 범위로 공개한다.
- 단일 point나 시간 근거가 없는 Process에는 0 duration을 만들지 않고 unresolved 진단을 공개한다.
- Canon page와 Process Event page가 같은 served Revision의 immutable Process artifact를 읽는다.

### 변경 경계

- `@moirai/projections`: 순수 Process projector, containment closure와 Duration 범위
- `@moirai/publication`: Revision별 Process artifact, Canon·Event reference와 manifest algorithm version
- `@moirai/contracts`: 공개 Process·Duration document와 publication format version
- `atropos-web`: Canon Process 목록과 stable Event route의 Process 근거

정본 Event·Relation 계약과 Clotho/Lachesis 권한은 변경하지 않는다. State는 family별 결정적 rule registry가 선행돼야 하므로 M4-D로 분리한다. JointJS canvas, scope·LOD와 Canon 비교도 이번 slice에 포함하지 않는다.

### 종료 조건

1. shuffled input에서 nested containment closure와 semantic digest가 동일하다.
2. 직접 child와 descendant가 구분되고 cycle·empty Process가 진단된다.
3. 정확한 경계는 exact Duration, 부정확한 경계는 최소–최대 범위를 반환한다.
4. 단일 point 또는 비교 불가능한 Time System에서 Duration을 발명하지 않는다.
5. manifest가 Process algorithm version과 immutable artifact digest를 포함한다.
6. Atropos Canon과 Event route가 같은 served Revision의 Process·child·Duration 근거를 server-render한다.
7. 전체 CI와 Clotho synthetic Process→Publication→Atropos smoke가 통과한다.

### 완료 근거

- 병합·배포 SHA: `dc0728da0fb2a94770aace356ad92c4d1144679c`
- PR: [#1](https://github.com/neocjmix/moirai/pull/1), CI [33895196445](https://github.com/neocjmix/moirai/actions/runs/33895196445) 성공
- Railway의 Moirai·Clotho 배포 성공 후 Clotho synthetic revision 27에서 Process artifact, exact Duration, immutable header와 Atropos SSR을 확인했다.
- 검증 Process `887f1fd8-5998-7678-8b0f-2f51b8cd2fb4`는 deployment 0의 seed와 deployment 27의 신규 Event를 직접 포함하며, 계산된 자체 구간은 0–27이다.

## Slice D — 규칙 기반 State projection

State를 자유 추론하지 않고 등록된 family의 명시적 경계만 계산한다. 첫 family는 `membership` 하나다. `kind = composite`, `roles`에 `state`와 `state:membership`가 모두 있는 Event가 대상이며, boundary Event에서 State Event로 향하는 `starts`·`ends` Relation을 사용한다.

### 외부에서 확인할 동작

- registry가 state type, Event role, start/end pattern, Subject resolver, overlap policy와 algorithm version을 고정한다.
- 시작·종료 boundary Event가 동일한 Subject projection에 속할 때만 해당 Subject의 membership으로 계산한다.
- 시작 boundary의 Time System별 배치를 보존하고, 종료 boundary가 같은 Time System에 있을 때만 완료 Duration을 계산한다.
- 종료 Relation이 없으면 `open_ended`로 표시하고 “현재까지 계속”이나 완료 Duration을 만들지 않는다.
- 경계 Relation·배치가 여러 개이거나 Subject가 일치하지 않으면 후보를 버리지 않고 unresolved 진단과 evidence ID를 공개한다.
- Canon별 `states.json`은 Revision 고정 immutable artifact이며 Subject page가 자기 handle에 해당하는 State만 server-render한다.

### 변경 경계

- `@moirai/projections`: membership rule registry와 순수 State projector
- `@moirai/publication`: Canon별 State artifact와 manifest algorithm version
- `@moirai/contracts`: 공개 State item·Duration·diagnostic 계약과 publication format version
- `atropos-web`: Revision 고정 State reader와 Subject의 계산된 상태 목록
- Clotho synthetic smoke: identity로 연결된 두 boundary Event, membership State와 `starts`·`ends` 근거

정본 Event·Relation 의미, Subject handle 계산, Process 계산과 Clotho/Lachesis 권한은 변경하지 않는다. 다른 State family, 자연어·LLM 기반 일반 추론, JointJS canvas, scope·LOD와 Canon 비교는 후속 slice다.

### 종료 조건

1. 입력 순서를 바꿔도 Subject, 경계, Duration과 semantic digest가 동일하다.
2. 정확한 시작·종료는 exact Duration, 불확실한 경계는 범위로 보존된다.
3. 종료 근거가 없으면 open-ended이지만 완료 기간이나 “현재” 주장은 없다.
4. 중복 경계, Subject 불일치와 시간 근거 부족은 unresolved 진단으로 남는다.
5. manifest와 Canon 문서가 State algorithm과 immutable artifact를 가리킨다.
6. Atropos Subject route가 같은 served Revision의 State 값·기간·근거 Event 링크를 server-render한다.
7. 전체 CI와 Clotho synthetic State→Publication→Subject SSR smoke가 통과한다.

## Slice E — JointJS Canon overview와 scope artifact

독자가 같은 served Revision의 Canon Event·Relation을 bounded overview로 열고 Event를 선택해 stable URL로 이동할 수 있게 한다. 첫 artifact는 `scope = canon`, `lod = overview` 하나로 제한하며 vertical chronology, subject lane, composite region, neighborhood/detail LOD와 Canon 비교는 후속 slice다.

### 외부에서 확인할 동작

- Canon document가 Revision별 immutable `scope-overview.json`을 가리킨다.
- scope artifact는 Event node와 Event↔Event Relation만 포함하고 virtual Time Event를 저장 Event node로 만들지 않는다.
- JointJS `dia.Graph`에는 artifact의 bounded cell만 넣고 전체 Canon을 넣은 뒤 CSS로 숨기지 않는다.
- Event 선택은 `view=graph&focus={eventId}`와 동기화하고 stable Event URL을 제공한다.
- graph를 사용하지 못하는 독자에게 같은 Event·Relation의 접근 가능한 텍스트 목록을 제공한다.
- overview의 안정적 격자 좌표는 `stable_overview` presentation layout으로 표기하며 authored 또는 inferred time으로 공개하지 않는다.

### 변경 경계

- `@moirai/contracts`: 공개 graph scope node·link·budget 계약
- `@moirai/projections`: 입력 순서와 무관한 bounded Canon overview projector
- `@moirai/publication`: scope artifact와 manifest algorithm reference
- `atropos-web`: Revision 고정 reader, JointJS client surface, focus URL과 텍스트 대안

정본 Event/Relation, schema, Clotho/Lachesis write, relational-time solver와 기존 시험 World의 내용은 변경하지 않는다. `1000` cell·`250` label 상한을 넘기면 `truncated`와 좁은 scope 안내를 반환한다.

UI interaction과 visual identity는 URDR commit `0267c8fd081ca9a3cd556f8f7319c600248c3760`의 `urdr/apps/web/src/components/graph-shell.tsx`에서 fullscreen ivory graph, compact control, 선택 feedback과 mobile sheet 문법을 참고한다. URDR의 데이터 모델·Vite runtime·Gregorian 숫자 변환은 복사하지 않는다.

### 종료 조건

1. shuffled input이 같은 semantic digest와 cell 순서를 만든다.
2. artifact가 `1000` cell·`250` label budget을 넘지 않고 초과 입력을 `truncated`로 설명한다.
3. virtual Time Event endpoint가 Event node로 나타나지 않는다.
4. Canon SSR, hydrated JointJS graph와 공개 scope JSON이 같은 served Revision을 사용한다.
5. 모바일에서 graph 표시, zoom, Event 선택, focus URL과 Event 상세 이동이 통과한다.
6. JavaScript 또는 graph 사용 불가 시 Event·Relation 목록으로 같은 핵심 대상을 탐색한다.
7. 전체 CI, production 배포 SHA 확인과 별도 Graph Scope Observatory 공개 smoke가 통과한다.

### 완료 근거

- PR [#11](https://github.com/neocjmix/moirai/pull/11)을 squash 병합한 `e8d1434f0f59bd7a7bf836e28a47206fd3846bff`의 PR CI [34218821271](https://github.com/neocjmix/moirai/actions/runs/34218821271)과 main CI [34219040771](https://github.com/neocjmix/moirai/actions/runs/34219040771)이 성공했다.
- Railway 세 서비스가 같은 SHA로 성공했고 Atropos deployment `78077720-4783-49ec-929a-e33cc6cd9bbc`가 Active다.
- production Graph Scope Observatory revision 1의 4 Event·4 Relation이 Canon과 immutable `scope-overview.json`에 보존됐다. artifact는 8 cell·4 label, `truncated = false`, `layout_basis = stable_overview`이며 Canon SSR의 접근 가능한 목록과 focus 상세 링크가 같은 Revision을 사용한다.
- 자동 post-deploy run [34219201148](https://github.com/neocjmix/moirai/actions/runs/34219201148)은 공개 readiness와 정확한 Atropos SHA까지 통과했다. 이후 독립 GitHub bearer credential의 MCP initialize가 실패했지만, 실제 Clotho OAuth validate→commit→Canon read와 공개 Atropos JSON/SSR 검증은 성공했다. 상세 판정은 [machine-readable production evidence](evidence/m4-e-graph-scope-production-2026-09-08.json)에 기록한다.

다음 Slice F는 Event/Relation 시간 제약으로부터 vertical chronology layout을 계산한다. overview 격자 좌표를 시간으로 재해석하지 않고, 비교 불가능한 Time System과 relative-only component를 억지로 한 축에 합치지 않는다.

## Slice F — 관계 기반 vertical chronology

Event/Relation 정본과 `temporal.json`의 계산 결과를 읽어 graph node의 세로 배치만
결정적으로 계산한다. 같은 Time System에서 비교 가능한 exact·bounded 위치는 adapter의
`compare`만 사용한다. 서로 겹치는 knowledge range는 같은 band에 남겨 근거 없는 total
order를 만들지 않는다. `precedes`·`not_after`·`coincides`가 Event 사이에 직접 쓴
순서는 절대 날짜가 없어도 보존한다.

각 node는 `placement_kind = inferred_layout`, stable `component_id`, `mode`, 정수 `rank`,
근거 Relation ID를 공개한다. `mode`는 다음 네 가지다.

- `coordinate`: 한 Time System 안에서 좌표 비교가 가능한 component
- `relative`: 절대 좌표 없이 authored Relation만으로 순서를 아는 component
- `mixed`: 서로 환산하지 않는 Time System 사이의 authored ordering 또는 좌표·상대 위치가 섞인 component
- `unplaced`: 순서를 정할 근거가 없는 component

허구력, 빅뱅 이후 scalar와 지질 BP처럼 Gregorian과 호환되지 않는 좌표도 등록된
adapter 안에서는 같은 방법으로 배치할 수 있다. conversion adapter가 없으면 다른
Time System과 같은 축을 만들지 않는다. authored cross-system Relation은 독립적인
선후 사실로만 보존한다. graph artifact는 원문 coordinate나 JavaScript timestamp를
복제하지 않으며 lossless 좌표의 정본 공개 위치는 계속 `temporal.json`이다.

### 종료 조건

1. 같은 Time System의 명백히 분리된 범위만 위아래 band로 나뉘고 겹친 범위는 같은 band에 남는다.
2. relative-only `precedes` chain은 날짜 없이 안정적인 rank와 evidence를 가진다.
3. 변환 불가능한 Time System은 별도 component이며 cross-system Relation이 있어도 공통 coordinate를 만들지 않는다.
4. 근거 없는 Event는 `unplaced`이고 배치값을 authored 시간이나 export 의미로 표시하지 않는다.
5. shuffled input은 같은 component, rank, cell 순서와 semantic digest를 만든다.
6. Atropos JointJS와 접근 가능한 텍스트가 같은 served Revision에서 mode와 band 의미를 제공한다.
7. 전체 CI와 별도 Graph Scope Observatory의 production chronology smoke가 통과한다.

### 완료 근거

- PR [#13](https://github.com/neocjmix/moirai/pull/13)을 squash 병합한 `43b0d8fea67d1afd679360a91203b501136ec84b`의 PR CI [34225538578](https://github.com/neocjmix/moirai/actions/runs/34225538578)가 성공했다.
- production 검증은 후속 Atropos 관측면 수정까지 포함한 `5abc536527afa61dd34a8b760060a83e3e99aab8`에서 수행했다. Atropos와 Clotho readiness SHA가 일치했다.
- 실제 Clotho OAuth로 Graph Scope Observatory에 Canon annotation 하나만 append해 revision 2를 만들었다. 같은 Change Plan replay는 새 Revision 없이 `idempotent_replay = true`를 반환했다.
- revision 2의 immutable `scope-overview.json`은 `event-relational-graph-scope/2`, 8 cell·4 label, `truncated = false`다. `Signal detected`와 `Investigation`은 같은 relative component의 rank 0·1이며 원본 `precedes` Relation ID를 evidence로 가진다. 시간 근거가 없는 Event 두 개는 `unplaced`다.
- Atropos 메인에서 served revision 2를 발견하고 Canon, hydrated JointJS, Event 선택 panel, focus query URL과 접근 가능한 시간 텍스트까지 같은 Revision으로 확인했다. body horizontal overflow는 없었다.
- 자동 post-deploy smoke [34293280937](https://github.com/neocjmix/moirai/actions/runs/34293280937)은 공개 readiness와 build 뒤 별도 GitHub bearer의 MCP 요청에서 실패했다. 실제 OAuth 제품 경로 성공과 분리된 운영 부채로 유지한다. 상세 판정은 [machine-readable production evidence](evidence/m4-f-vertical-chronology-production-2026-09-09.json)에 기록한다.
