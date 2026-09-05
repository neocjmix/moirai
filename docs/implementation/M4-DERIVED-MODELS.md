# M4 파생 모델·비교·그래프 구현 기록

관련 기준: CON-003, BR-003, BR-004, JRN-005, TS-005, TS-006, IS-001, IP-001 M4.

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
