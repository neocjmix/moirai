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
