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
