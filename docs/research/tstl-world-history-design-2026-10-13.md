# Moirai 세계사 레이아웃 알고리즘 설계

2026년 10월 13일 KST · Temporal Set Topology Layout 연구 설계 v1

상태: draft · 비규범 연구 설계 · 미구현·미배포. 이 문서는 accepted 제품 의미, CURRENT의 활성 범위 또는 production 설정을 변경하지 않는다. 첫 구현 범위는 [후보 A handoff](tstl-candidate-a-handoff-2026-10-13.md)의 B0+A로 한정한다. 아래 B/C와 전체 비교 연구는 후속 범위이며 이번 첫 구현에 포함하지 않는다.

경험 있는 프런트엔드 엔지니어와 향후 구현을 맡을 Codex를 위한 설계 문서다. 기존 World, Event, Composite, Collection의 의미를 유지하면서 시간축을 고정하고 집합 관계를 읽을 수 있는 배치를 정의한다. 제안한 알고리즘의 성능과 이해도는 아직 실험하지 않았다. 본 문서는 구현·배포 결과가 아니라 비교 가능한 프로토타입과 검증기를 만들기 위한 명세다.

## 1 권고안과 결정 범위

기본 연구 후보는 **고정된 시간 표현 위에서 X를 최적화하고, 검증에 통과한 영역만 채우는 제약 기반 TSTL**이다. 명시적 Composite DAG에서 멤버십을 먼저 계산하고, 전역 순서와 수평 좌표를 구한 뒤, 단면의 member run을 감싸는 경계에서 영역을 만든다. 장애물 회피 mesh는 더 유연한 대안으로 비교한다. 영역이 사실과 다른 교집합을 만들면 해당 부분을 수정하거나 의미가 분명한 선 기반 표현으로 바꾼다. 사용자는 레이아웃 엔진을 고르지 않는다.

이 후보를 고른 이유는 세 가지다. 첫째, 이미 존재하는 하나의 World×time-system canonical layout과 결합할 수 있다. 둘째, 고정 Y와 단일 Event 정체성을 최적화 이전의 계약으로 만들 수 있다. 셋째, 모든 데이터에 단순하고 연결된 Euler 영역이 존재한다고 가정하지 않으므로, 실패를 감추지 않는 구현이 가능하다.

영역 생성 전에 시간 의미를 보존하는 어댑터가 필요하다. 현행 scalar min/max와 baseY만 보존하면 불확실한 사건의 날짜를 정확한 시점처럼 보이게 만들 수 있다. 또한 새 X 좌표만 반환해서는 충분하지 않다. 현재 렌더 발행 단계는 자식의 점과 polygon에서 concave hull을 다시 만들기 때문에 검증한 contour를 전달하는 별도 geometry 계약이 필요하다. [C1–C3]

첫 구현에서 고정할 사항은 다음과 같다.

- Event ID는 하나이며, 공유사건을 배치 편의상 복제하지 않는다
- 정확한 시간점, 불확실한 발생 범위, 실제 지속기간을 다른 자료형으로 유지한다
- contains DAG, 그로부터 파생한 멤버십, 집합의 우연한 부분집합 관계를 분리한다
- Collection 토글과 pan/zoom은 canonical 좌표를 다시 계산하지 않는다
- fill을 유지할 수 없는 부분의 관계는 포트와 선으로 나타내고, 생략 사유와 복원 경로를 남긴다
- 전역 historical importance 점수를 만들지 않는다

분기와 재합류는 기본 후보의 제한된 변형으로 비교한다. 완전히 분리된 영역은 별도 실험 후보로 남긴다. 지역 fallback이 필요하다는 이유로 전체 Composite를 무제한 조각으로 분해하는 정책을 기본값으로 삼지 않는다.

TimeSets, StoryFlow, Bubble Sets, RectEuler와 KelpFusion은 각 단계에 필요한 재료를 제공한다. 어느 논문도 Moirai의 고정 Y, 재귀 DAG, 불확실한 시간, 단일 Event, canonical publication을 함께 해결하고 검증한 완성 알고리즘은 아니다. [R1–R5]

## 2 불변조건과 표현의 의미

검증기가 보장할 수 있는 기하적 사실과 사용자가 어떻게 읽는지는 별개다. 전자는 자동 검증하고, 후자는 과제 기반 이해도 평가로 확인한다. “거짓 관계를 암시하지 않는다”는 제품 목표를 geometry 검사 하나로 증명했다고 보고하지 않는다.

| 우선순위 | 지켜야 할 조건 | 위반 때의 처리 |
|---|---|---|
| P0 | 시간 의미와 Y 고정, Event 정체성, authoritative membership | 결과를 발행하지 않음 |
| P1 | 없는 멤버십이나 교집합을 채운 면으로 제시하지 않음 | 해당 영역 수정 또는 명시적 대체 표현 |
| P2 | Composite 식별과 기존 위치의 추적 가능성 | 안정성 비용으로 최적화하고 변화 설명 |
| P3 | 교차, 폭, 굴곡, 가지 수, 분절 수 | 검증을 통과한 해들 사이에서 최적화 |
| P4 | 색과 곡선의 미적 일관성 | 마지막 단계에서 적용 후 재검증 |

**시간에 대한 계약.** y=f(t)는 time system의 공식 변환을 사용한다. 충돌 때문에 y를 이동하지 않는다. 불확실한 사건은 허용 시간의 양 끝을 보존하며, 중앙점은 필요할 경우 레이블 기준점이라고만 정의한다. “시간이 고정된다”는 말은 모든 사건에 정확한 한 시점을 부여한다는 뜻이 아니다.

**집합에 대한 계약.** 채워진 Composite 영역은 선언한 Event 도메인에서의 멤버십을 표현한다. 영역이 겹치면 그 exact signature에 속하는 사건이 존재해야 한다. 영역의 시간 방향 연장은 지속적 활동이나 인과관계를 뜻하지 않는다. 긴 공백을 잇는 것은 채워진 면 대신 연속성을 돕는 중립적 점선으로 표현한다.

**구조에 대한 계약.** 명시적 contains 관계만 부모·자식 화살표, breadcrumb, 구조 badge의 근거가 된다. 두 집합의 Event가 같거나 하나가 다른 하나의 부분집합이라는 이유로 contains edge를 만들지 않는다. 가깝게 배치하기 위한 affinity도 canonical relation으로 저장하지 않는다.

**동일성에 대한 계약.** 하나의 Event는 하나의 선택 상태와 하나의 semantic hit target을 갖는다. 영역 레이블, 화면 밖 위치 안내, 포트와 집계 표시는 그 Event를 참조할 수 있지만 새로운 Event처럼 보이거나 독립된 Event ID를 갖지 않는다. animation의 이전/다음 레이어에 같은 glyph를 동시에 남기는 방식도 피한다.

## 3 저장 모델에서 의미 투영 만들기

### 3.1 기호와 도메인

E는 해당 source revision의 Event ID 집합, C는 그중 Composite로 취급되는 Event의 집합이다. H는 검증된 contains edge 집합이며 방향은 부모→자식이다. World와 Collection은 별도 범위/탐색 단위다. Collection에 같은 사건이 들어 있다고 해서 Composite의 contains edge가 생기는 것은 아니다.

Desc(c)는 H에서 c로부터 도달 가능한 Event다. self membership은 추가하지 않는다. leaf는 이 투영의 H에서 직접 자식이 없는 Event다. 모든 Event를 세는 closure와 leaf만 세는 closure를 따로 유지한다. geometry의 carrier domain D는 어떤 Event의 semantic glyph를 이 비교에서 대상으로 삼는지 명시하는 집합이다.

$$M_D(c)=\operatorname{Desc}(c)\cap D$$

기본 canonical geometry의 carrier D는 leaf Event로 고정한다. region owner와 header는 memberEventMark가 아닌 compositeRegion/header role이다. owner c의 header를 자신의 nonmember glyph로 검사하지 않으며, 그 header는 자기 집합의 witness가 될 수도 없다. Composite의 본래 occurrence를 별도로 표시할 필요가 있으면 ownOccurrence role로 두고 자기 region과의 관계를 not-applicable로 선언한다. 자신의 부모·조상 membership은 정확한 port로 표시한다.

Composite proxy와 ownOccurrence에는 별도 ancestorSignature(e)={c∈A | e∈Desc(c)}를 쓴다. leaf-only M_D 기반 signature를 재사용하면 Composite e가 D 밖이어서 소속이 사라지는 오류가 생긴다.

접힌 Composite proxy와 summary는 canonical D를 바꾸지 않는다. view에서 추가된 proxy는 실제 ancestor signature로만 검사하고, 숨겨진 leaf를 대체하는 새로운 World witness로 세지 않는다. 따라서 접힘 때문에 descendant가 canonical truth에서 사라지지 않는다.

이 문서의 통계는 leaf 도메인으로 표시하고, 전체 Event 수가 필요할 때는 all-Event 도메인이라고 쓴다. Composite 자체를 접힌 Event glyph로 표시하면 그 glyph는 자기 자신의 ancestor membership을 사용한다. 숨겨진 descendant들의 멤버십을 합쳐 그 Composite 자체의 멤버십처럼 표시하면 안 된다.

표시할 Composite 집합 A에 대한 사건 e의 signature와 관측된 signature는 다음과 같다. signature는 정렬된 Composite ID 집합 또는 같은 순서의 bitset이다.

$$\sigma_A(e)=\{c\in A\mid e\in M_D(c)\},\qquad Z_{A,D}=\{\sigma_A(e)\mid e\in D\}$$

A가 바뀌면 signature가 달라진다. 한국·일본·중국을 모두 보는 때의 “한국과 일본에만 속함”과, 중국을 숨긴 때의 “표시한 두 집합 모두에 속함”은 다른 질의다. 보조 교집합 표에는 “선택한 집합 기준”과 사용한 D, revision을 붙인다. [R7]

### 3.2 투영 절차

1. ID로 Event를 중복 제거하고, 누락 endpoint·중복 edge·순환·World 불일치를 검사한다
2. contains edge만으로 DAG를 만든다. 다른 관계 유형은 별도 테이블에 보존한다
3. 위상 정렬의 역순으로 descendant bitset을 합친다. 각 직접 자식을 포함하고 그 자식의 closure를 OR한다
4. all-Event closure, leaf closure, ancestor lookup을 분리해 캐시한다
5. Collection incidence는 실제 Collection 관계에서 별도로 계산한다
6. 시간 어댑터의 결과와 결합하여 placed와 unplaced를 나눈다
7. canonical domain과 현재 view domain을 기록하고 signature를 계산한다

```text
project(snapshot, timeSystem):
  events = uniqueByEventId(snapshot.events)
  H = validateContainsDAG(events, snapshot.relations)
  order = stableTopologicalOrder(H, tieBreak=eventId)
  for c in reverse(order):
    descendants[c] = union({child}, descendants[child]
                           for child in children[c])
  leafIds = {e | outDegree_H(e) == 0}
  time = losslessTemporalAdapter(snapshot, timeSystem)
  return {events, H, descendants, leafIds,
          collectionIncidence, time, sourceRevision}
```

순환이나 참조 손상이 있으면 해당 edge를 조용히 제거해서 계속하지 않는다. 입력 오류와 layout 실패는 다른 상태다. 이미 검증된 publication을 유지하면서 진단을 반환한다. 구조를 고칠 권한은 레이아웃 알고리즘에 없다.

DAG의 다중 부모는 정상 입력이다. 동일 Event가 여러 경로로 도달해도 bitset의 한 bit만 설정된다. 경로별 펼침 상태와 Event별 표시 상태는 별도로 관리한다. 한 경로를 접었다고 다른 경로로 이미 드러난 Event를 숨기지 않는다.

### 3.3 r56의 실제 구조에서 발생하는 오독

검증 기준 fixture인 history-r56에는 539 Events, 109 Composites, 430 leaves가 있다. 한국·일본·중국 history의 재귀 leaf 수는 각각 311, 215, 160이고, 세 집합의 합집합은 430이다. Imjin War Composite의 직접 부모는 한국과 일본이다. 중국과 공유하는 descendant Event가 있다는 사실은 Imjin War Composite 전체가 중국의 직접 자식이라는 뜻이 아니다. [F1]

따라서 접힌 Imjin War glyph에 descendant들의 모든 국가 membership을 합친 badge를 붙이면 구조를 왜곡할 수 있다. “이 Composite 자체의 부모”와 “내부 사건이 걸쳐 있는 집합”을 별도 항목으로 보여야 한다.

## 4 시간 정보를 보존하는 어댑터

현재 PublicTemporalPosition은 exact, bounded, relative-only, unresolved를 구분한다. 경계에는 inclusive와 constraint_ids가 있고, position에는 source_constraint_ids, display_label, knowledge_span 등이 있다. PublicTemporalExtent는 explicit_boundaries와 descendant_span을 구별한다. during 관계는 membership:false이며 contains로 바꾸면 안 된다. [C1]

현행 v5 layout 입력은 이 정보의 일부를 숫자 경계로 줄인다. 기존 baseY는 bounded peer를 범위 안에 분산한 표시 대표점일 수 있다. 따라서 baseY를 복사하는 것은 “기존 위치 유지” 검사는 될 수 있어도 “날짜의 거짓 정밀도 없음” 검사는 될 수 없다. 기존 r56 layout snapshot만으로 원래 날짜 의미를 복원할 수도 없다. [C2, F1]

새로운 backend schema를 요구하지 않고, 연구용 snapshot/loader가 기존 public temporal descriptor를 손실 없이 보존하는 TemporalSidecar를 제안한다.

| 연구용 표현 | 보존할 의미 | 캔버스 표현 |
|---|---|---|
| ExactPoint | 정확한 발생 시각, time-system 값과 근거 | 고정 Y의 단일 semantic glyph |
| UncertainInstant | 가능한 발생 범위와 양 끝 포함 여부 | 양 끝 Y가 고정된 불확실성 bar, 대표점은 보조용 |
| Duration | 실제 시작·끝과 그 근거 | 실제 지속기간임을 구별한 interval glyph |
| DescendantSpan | 자손 사건에서 계산한 범위 | Composite의 시각적 범위, 실제 지속기간으로 표기하지 않음 |
| Unplaced | 상대 관계만 있거나 유효한 위치를 정하지 못함 | 별도 미배치 목록과 관계 안내 |

하나의 사건에 발생시점 불확실성과 실제 duration이 함께 있다면 하나의 min/max로 합치지 않고 두 descriptor를 유지한다. 한쪽 경계만 있는 자료는 무한 막대를 viewport 끝에 잘라 확정 범위처럼 보이지 않게 한다. 첫 후보에서는 unplaced로 보존하고, 제한된 시간 방향 안내만 제공한다.

canonical 시간은 원래 time system 표현과 정밀도를 유지한다. JavaScript Date, 임의 연도 float, 0년 존재 여부, BCE 변환을 새로 가정하지 않는다. 정확한 time-system 비교/차이 연산과 화면 변환은 어댑터 책임이다. numeric rendering offset이 필요하면 기준 원점과 단위를 명시하고 정밀도 손실을 검사한다. 경계 inclusive 여부와 calendar bucket의 [start, nextBoundary) 규칙도 그대로 전달한다. [C1]

semantic glyph footprint G(e)는 점, 불확실성 bar, 실제 duration, 보이는 stroke의 영역이다. 레이블 상자와 사용성을 위한 넓은 hit area는 annotation geometry이므로 멤버십의 hard containment 대상에 넣지 않는다. 대신 레이블 충돌과 connector의 식별 가능성을 별도 검사한다. 불확실성 시각화가 실제 duration으로 읽히지 않는지는 사용자 과제로 평가한다. [R8]

## 5 Canonical 배치와 현재 화면의 분리

현재 main의 기준은 commit d721b0efdcf309ed7ad21c55bc04572e2f14d644의 global-incidence/1이다. 하나의 World×time-system published layout이 Collection 선택과 독립적으로 유지된다. legacy force는 과거 비교군일 수 있지만 현재 기본 구현이라고 부르면 안 된다. [C2–C4]

TSTL도 이 계약을 기본으로 유지한다. canonical 단계는 source revision, time system, 알고리즘 버전, 파라미터 버전, 전체 구조에서 좌표와 검증된 geometry를 만든다. view 단계는 카메라 변환, 선택, 표시할 Composite, clipping, 레이블과 LOD를 결정한다. Collection 선택을 canonical solver의 입력으로 넣지 않는다.

```text
CanonicalKey = hash(worldId, sourceRevision, timeSystemId,
                    temporalAdapterVersion, algorithmVersion,
                    parameterVersion, normalizedInputHash)
ViewKey = hash(CanonicalKey, camera, visibleCompositeIds,
               filters, manualChoices, lodState)
```

view geometry를 간소화할 수는 있지만 원본의 의미를 바꾸면 안 된다. 선택한 A에 대한 signature 투영은 다시 계산해도 Event의 canonical X와 시간 표현은 유지한다. 작은 zoom 변화에 따라 상세도를 반복 전환하지 않도록 hysteresis를 둔다.

맥락에 맞춘 재배치를 실험한다면 별도 transient ViewLayout으로 만들고 canonical publication에 쓰지 않는다. 진입 전 anchor, 카메라, 선택 Event를 저장하고 “원래 배치로 돌아가기”가 같은 위치를 회복해야 한다. 이 기능의 유무와 허용 변위는 실험에서 결정하며 사용자에게 알고리즘 이름을 고르게 하지 않는다.

동일 입력과 상태는 같은 결과를 내야 한다. ID 정렬, equal-cost tie-break, 수치 양자화, seed, solver iteration budget을 고정한다. wall-clock timeout 때문에 결과가 달라지는 작업은 canonical 결정성의 기준으로 쓰지 않는다. 작업량 기준으로 중단한 뒤 마지막으로 검증된 해를 사용한다. 실행 시간은 별도로 측정한다.

## 6 공통 순서와 X 좌표 계산

### 6.1 시간 slab과 초기 기준 위치

정확한 발생 시점, interval 양 끝과 고정 nominal glyph의 충돌 범위에서 시간 knot를 만든다. 같은 좌표의 knot는 합친다. 인접 knot 사이가 slab이다. 화면 글꼴 때문에 추가한 label breakpoint는 view에만 존재한다. knot 추가는 사건 추가나 새로운 역사 시기 구분이 아니다.

canonical solve는 고정 reference scale과 glyph 규격을 사용한다. 이 규격에서 Event body의 겹침을 피하도록 배치하더라도 모든 zoom에서 pixel 크기를 유지하는 glyph와 label의 무충돌을 보장하지는 않는다. 축소 때는 view LOD가 담당한다. nominal 크기와 reference scale은 CanonicalKey의 parameter version에 포함한다.

cold start의 기준 순서는 데이터에서만 얻는다. Composite ancestor가 없는 root Composite를 기준 anchor 집합으로 삼고, 그들 사이의 공유 leaf incidence로 인접성 선호를 만든다. 국가명이나 역사적 중요도를 넣지 않는다. root가 없는 고립 Event는 ID로 정렬한 독립 anchor를 갖는다. root 기준은 초기 위치만 정하며 모든 nested membership은 후속 제약에서 유지한다.

$$w_{ab}=\sum_{e:\,a,b\in\sigma(e)}\frac{1}{\binom{|\sigma(e)|}{2}}$$

여기서 signature는 anchor 집합에 투영한 값이며 원소가 2개 이상인 항만 더한다. 하나의 다중 공유사건이 많은 쌍에 과도한 질량을 주지 않도록 정규화한 값이다. raw count를 쓰는 변형도 비교한다. TimeSets의 인접 집합 점수는 이 아이디어의 근거지만, 그 논문의 Event 복제와 시간 정밀도 희생은 채택하지 않는다. [R1]

anchor ID 순서에서 시작해 deterministic insertion 후 인접 swap을 정해진 pass 수만 수행한다. 인접 가중치 합이 증가할 때만 수용하고 동점이면 기존 순서, 이후 ID 순서를 쓴다. Event 기준 X는 소속 anchor 위치의 평균이다. 첫 구현에서 모든 가중치는 동일하며, 향후 source revision 갱신을 안정화할 때는 지정된 이전 canonical 결과를 기준으로 쓸 수 있다. 그 경우 이전 결과 hash도 입력에 들어간다.

### 6.2 단면 순서와 제한된 가능성 판정

각 slab에서 충돌 범위가 겹치는 Event들을 항목으로 둔다. 동일 signature의 atom을 탐색용 bucket으로 쓸 수 있지만, 긴 interval의 충돌 제약이 다른 Event들을 무조건 하나로 축약하지 않는다. 실제 좌표 변수는 끝까지 Event별로 하나다.

처음에는 기준 X, ID 순으로 정렬한다. 앞→뒤와 뒤→앞으로 sweep하면서 인접 swap과 작은 구간 재배열을 시도한다. 점수는 membership의 분리 run 수, 인접 slab에서 동일 Composite의 single-run 중심 순서가 뒤집히는 수, 지정한 reference에서의 순서 변화, 추정 폭을 합친다. 각 항을 초기값 또는 고정 scale로 정규화한다. hard constraint 위반을 낮은 점수로 상쇄하지 않는다.

$$E_{order}=\lambda_r\sum_{c,j}\max(0,runs(c,j)-1)+\lambda_s I_{ref}+\lambda_x C_{order}+\lambda_w\widehat W$$

Event들을 임의의 이전·다음 Event와 연결해 character storyline처럼 취급하지 않는다. C_order는 두 slab 모두 single-run을 갖는 Composite 쌍의 중심 순서 반전만 세는 routing 이전의 대리 지표다. 중심은 현재 순서의 member rank 평균으로 정의하며 동점은 ID로 해소한다. multi-run의 branch 대응은 첫 ordering 비용에서 제외한다. 실제 경로의 교차 수는 geometry 이후에 별도 측정하고, 공유 Event에서의 의도된 만남과 구별한다. StoryFlow에서 가져오는 것은 이산 순서와 연속 좌표 계산의 분리이며, session/tree 모델을 Moirai DAG에 그대로 적용하는 것이 아니다. [R2]

한 slab에서 집합마다 한 X 구간만 허용하는지 판정하려면 Event–Composite incidence matrix의 consecutive-ones property(C1P)를 검사한다. PQ-tree는 이 제한된 가능성 판정에 사용할 수 있다. C1P 판정 자체가 시간 전체의 crossing, pin, 폭, interval 일관성을 해결하지는 않는다. [R9]

같은 Y에 AB, AC, BC 세 signature만 있으면 어떤 순서에서도 한 집합의 두 member 사이에 nonmember가 놓인다. 이는 single-run 모델의 반례다. 일반적인 분기 contour나 선·면 혼합 전체가 불가능하다는 증거는 아니다. 후보 A는 이 구간에서 line fallback을 허용하고, 후보 B는 multi-run을 허용한다.

### 6.3 선형 제약과 convex QP

변수는 Event마다 X 하나인 x(e), single-run 구간의 knot line y(j)에 놓인 좌우 경계 L(c,j), R(c,j), 중심 q(c,j)다. 각 slab은 두 endpoint 경계를 선형 보간한 trapezoid이고 h(j)=y(j+1)−y(j)다. glyph support가 slab에 걸치면 잘린 support의 위·아래 endpoint 모두에 보간된 band 포함·배제 제약을 둔다. polygon/curve의 비선형 support는 최종 robust 검증으로 확인한다. interval Event가 여러 slab에 참여해도 같은 x(e)를 참조한다. y와 시간 범위는 변수 목록에 넣지 않는다.

고정 Y의 semantic glyph들이 겹치고 이산 순서가 e<f이면 다음 제약을 둔다. w는 canonical nominal glyph 폭이고 g는 간격이다.

$$x_f-x_e\geq (w_e+w_f)/2+g$$

영역을 쓰는 slab에서 member glyph는 padding p를 두고 band 안에 놓는다. nonmember는 이산 단계에서 결정한 왼쪽 또는 오른쪽 밖에 놓는다. 그 좌우 선택을 아직 정하지 않았다면 문제는 disjunctive/MIP이지 convex QP가 아니다.

$$L_{cj}+p\leq x_e-w_e/2,\qquad x_e+w_e/2\leq R_{cj}-p$$

q(c,j)=(L(c,j)+R(c,j))/2, L(c,j)≤R(c,j), R(c,j)−L(c,j)≥w_min을 선형 제약에 포함한다. w_min은 해당 member support와 padding을 담는 최소값이며 member가 없는 slab에는 의미 없는 최소 폭을 강제하지 않는다.

slab 사이의 시간 간격 h(j)>0, 중심 변화율 v(j)=(q(j+1)−q(j))/h(j)를 둔다. 기본 QP는 기준 위치, 이동량, 기울기 변화와 폭을 줄인다. 비균일한 knot 간격을 무시한 합은 knot를 늘리는 것만으로 점수가 바뀌므로 h로 정규화한다.

$$E_X=\lambda_a A+\lambda_m M+\lambda_b B+\lambda_w W+\epsilon\|z-z_0\|^2$$

$$A=\sum_e(x_e-x_e^{ref})^2,\qquad M=\sum_j\frac{(q_{j+1}-q_j)^2}{h_j}$$

$$B=\sum_j\frac{(v_j-v_{j-1})^2}{\bar h_j},\qquad W=\sum_j\frac{h_j}{2}(w_j+w_{j+1})$$

합은 해당 Composite와 유효한 구간 전체에 적용하며 이 식의 w(j)는 band 폭 R(j)−L(j)다. 실제 preset의 고정 scale 정규화는 12절에 정의한다. 모든 가중치는 비음수이며 z는 연속 변수 벡터다. h̄(j)=(h(j)+h(j−1))/2, z0는 기준 X와 그 member envelope에서 만든 초기 연속 변수다. 원점 제약과 작은 양의 regularizer로 translation 자유도와 수치 동점을 제거한다. 선형 제약, 순서, branch 대응이 고정된 feasible QP 안에서만 최적성을 말할 수 있다. 전체 TSTL은 이산 선택과 geometry를 포함하므로 전역 최적이라고 부르지 않는다.

X 제약을 만들 때 양의 길이를 갖는 순서 cycle을 먼저 검출한다. a<b, b<c, c<a가 서로 다른 slab에서 생기면 하나의 x(e)로 만족할 수 없다. 순서 선택을 되돌리거나 표현 모델을 바꿔야 한다. Y를 나누어 놓는 것은 복구 방법이 아니다.

h 정규화는 이동 에너지의 sampling 편향을 줄인다. 그러나 knot를 바꾸면 feasible constraints, piecewise-linear basis, curvature와 regularizer도 바뀌므로 전체 알고리즘이 임의 knot refinement에 불변이라고 주장하지 않는다. 처음에는 6.1절의 knot 정책을 고정한다.

L1 이동량 변형도 비교한다. anchor·bend·regularizer까지 모두 절댓값과 선형 보조변수로 바꾼 경우만 LP라고 부른다. 다른 quadratic 항을 남기면 L1 이동항을 가진 convex QP다. L1, L2, 움직인 횟수는 서로 다른 목표이며 하나의 개선이 다른 지표를 악화시킬 수 있다. 최신 storyline 연구도 이를 구분한다. 시간축 공간을 추가로 늘리는 routing은 fixed-Y에 그대로 가져오지 않는다. [R10]

## 7 권고 후보 A 검증된 영역과 국소 연결선

### 7.1 영역을 만드는 순서

후보 A는 단순한 piecewise-linear 경계로 시작한다. 곡선의 아름다움보다 어떤 도형을 검사했는지 재현할 수 있는 것이 먼저다.

1. ordered slab에서 Composite별 member run을 찾는다
2. single-run 구간의 member glyph를 QP 경계로 감싼다
3. 인접 slab의 경계를 직선으로 연결한 provisional polygon을 만든다
4. 연결 부분이 nonmember glyph 또는 허용되지 않는 atomic zone을 침범하면 해당 연결을 거부한다
5. bounded local repair로 X 순서·폭·연결 위치를 조정하고 전체 arrangement를 다시 검사한다
6. 통과한 부분만 area로 두고, 나머지는 같은 Composite의 identity trace와 실제 membership port로 표시한다

비교적 떨어진 시대를 하나의 큰 hull로 메우지 않는다. member가 없는 시간 공백에서는 면을 끊고 중립적 continuity scaffold를 쓴다. 이 scaffold는 Composite의 정체성을 추적하는 보조선이며 contains, duration, causes edge가 아니다. fill↔line 전환이 잦으면 읽기 어려워지므로 전환 횟수도 품질 지표로 기록한다.

```text
constructA(projection, orders, X):
  provisional = envelopesOfSingleRuns(orders, X)
  for gap in stableOrder(provisional.connections):
    propose piecewiseLinearConnection(gap)
  for step in 0 .. repairBudget:
    check = validateWholeArrangement(provisional, projection)
    if check.valid: return {X, geometry: provisional, certificate: check}
    repair = nextDeterministicLocalRepair(check)
    if repair is absent: break
    (X, provisional) = resolveAndApply(repair, allAffectedSlabs)
  replace affected uncertified fills with typed traces and ports
  return {X, geometry: provisional,
          certificate: validateWholeArrangementAndIncidence(provisional)}
```

repair 메뉴는 유한하게 고정한다. 위반을 (유형, patch ID, Composite ID, Event ID)로 정렬한 뒤 ① 인접 순서 한 쌍 반전 ② 같은 patch 연결부의 폭을 1, 1/2, 1/4배로 줄이기 ③ 연결 control X를 ±g, ±2g로 우회하기 ④ 해당 Composite의 patch fill을 typed line/port로 내리기를 순서대로 시도한다. glyph padding의 hard minimum은 줄이지 않는다. X나 순서를 바꾸면 그 Event를 공유하는 모든 slab와 연속 제약의 연결 성분을 다시 풀고, 전역 X·시간·geometry 검증을 다시 수행한다. 단순히 지역 polygon만 옮기지 않는다. 각 시도는 원본으로 되돌릴 수 있는 후보이며 검증된 결과만 incumbent를 대체한다.

Composite별로 따로 통과한 polygon들을 합쳤다고 전체 diagram이 통과한 것은 아니다. 새로 생긴 교집합 때문에 반드시 최종 전체 arrangement를 검사한다. local 수정도 변경 영역과 맞닿은 모든 경계의 영향을 포함해 검증해야 한다.

### 7.2 기하와 연결선의 책임 분리

area mode에서는 region inclusion이 membership을 표현한다. line mode에서는 Event의 정확한 포트 연결과 펼칠 수 있는 membership 목록이 membership을 표현한다. 선이 Event 근처를 지나가는 것, 서로 다른 선이 교차하는 것은 membership이나 관계의 근거가 아니다. bridge/gap과 stroke identity를 사용해 junction과 교차를 구별한다.

한 구간을 line mode로 바꿀 때 area 검사에서 조용히 제외하면 안 된다. 반환 artifact에 그 mode와 구간을 선언하고, 동일한 기대 membership이 포트·목록으로 완전히 보존되는지 incidence 검사를 적용한다. 같은 Event를 부모마다 다른 자리에 다시 그려 이 문제를 해결하지 않는다.

선도 읽을 수 없을 만큼 많으면 전체 선을 강제로 표시하지 않는다. Event의 정확한 membership 수, 선택 시 펼쳐지는 실제 Composite 목록, 해당 Composite의 member 강조를 제공하고 일부 연결선이 접혔음을 표시한다. 마지막 fallback도 원래 Event ID와 모든 관계에 접근할 수 있어야 한다.

## 8 집합 geometry를 검증하는 방법

### 8.1 semantic glyph 포함과 배제

영역 R(c), semantic glyph support G(e), 안전 margin p를 둔다. area로 표현한다고 선언한 관계는 다음을 만족해야 한다.

$$e\in M_D(c)\Rightarrow G(e)\oplus B_p\subseteq R(c)$$

$$e\notin M_D(c)\Rightarrow \mathrm{Interior}(G(e)\oplus B_p)\cap R(c)=\varnothing$$

p>0으로 두고 margin 바깥 경계끼리의 접촉은 허용한다. member의 원래 G는 R 내부에 있고 nonmember의 원래 G는 R과 분리되어야 한다. QP의 비엄격 부등식과 검증기가 같은 margin 계약을 사용하도록 한다.

원소 중심만 검사하면 불확실성 bar의 일부가 경계 밖으로 잘리거나 굵은 stroke가 nonmember 영역에 닿는 것을 놓친다. 실제 rendered body를 검사하되 label과 invisible hit expansion은 별도 annotation 검사로 처리한다. 화면에서 nonmember가 숨겨져 있다는 이유로 canonical 침범을 허용하지 않는다.

원본의 support가 불완전하거나 temporal sidecar가 없으면 확정하지 못한 부분을 unknown으로 기록한다. legacy-scalar-only snapshot은 geometry 비교용으로 쓸 수 있지만 시간 의미를 완전 검증했다고 표시할 수 없다.

### 8.2 비어 있어야 하는 exact intersection

glyph 포함 검사를 통과해도 없는 교집합이 빈 공간에 생길 수 있다. R(c)들의 모든 경계를 분할한 planar arrangement의 각 face q에 다음 label을 계산한다.

$$\tau(q)=\{c\in A\mid q\subset\mathrm{Interior}R(c)\}$$

비어 있지 않은 filled face의 label이 관측된 Z(A,D)에 없으면 FALSE_ATOM이다. 추가로 같은 label의 연결 zone 성분마다 그 성분 안에 해당 projected signature의 실제 placed glyph support가 있어야 한다. 다른 곳에 같은 signature Event가 있다는 것만으로 통과시키지 않는다. 화면 밖이어도 같은 canonical 성분 안의 witness이면 유효하다. 이 보수적인 witness 조건으로 거부된 corridor는 line으로 전환할 수 있다. 예를 들어 AB, AC, BC가 각각 존재해도 ABC는 존재하지 않을 수 있다. pairwise overlap 검사만으로 이를 확인할 수 없다. RectEuler의 일부 표현은 입력에 없는 empty zone을 만들 수 있으므로 단순한 rectangle 최적화의 목적함수를 그대로 채택하지 않는다. [R4]

검사 도메인을 결과에 반드시 기록한다.

- D_world는 고정 revision의 carrier 전체다. 숨겨졌다는 이유로 관계를 부정하지 않는다
- D_placed는 시간 support가 있어 canonical 캔버스에 배치 가능한 carrier다. unplaced 사건만을 근거로 임의 시대에 filled zone을 만들지 않는다
- D_view는 Collection/filter/펼침 정책으로 현재 탐색하는 범위다. viewport clipping과 LOD로 실제 그려진 glyph 집합은 다시 별도다

기본 canonical certificate는 D_placed에서 계산한다. view가 World 관계를 계속 보여준다면 그 scope를 유지하고, witness가 필터로 숨겨졌거나 화면 밖이라는 안내를 붙인다. “현재 선택에 존재하는 교집합”이라는 주장을 한다면 D_view로 별도 검사해야 한다. Collection all-off는 빈 선택이며 World 전체 조회로 바꾸지 않는다.

관측된 signature라는 조건만으로 지나치게 긴 공유 영역이 정당화되지는 않는다. 각 overlap 성분에 그 성분 안의 실제 witness ID를 연결하고, witness 시간 support에서 멀어진 길이와 근방에 보이는 witness 유무를 기록한다. 긴 공백은 fill을 끊거나 “공유사건은 화면 밖” 탐색 cue로 설명한다. 이 가독성 조건은 세계 전체의 FALSE_ATOM과 다른 진단이다.

### 8.3 Hybrid patch의 검사 범위

일부 Composite를 line으로 내리면 면의 부재를 비소속으로 읽어서는 안 된다. canonical knot로 나눈 disjoint patch마다 areaEncodedCompositeIds를 고정한다. 각 patch의 면 검사는 이 집합 A_area에 signature를 투영하고, 나머지 관계는 port/list incidence로 검사한다. membership은 present, absent, not-area-encoded의 3값으로 읽힌다.

예를 들어 실제 ABC 사건에서 B와 C를 port로 표시한 patch의 A 면은 A-only 사건을 주장하지 않는다. 그 patch는 A만 면으로 표현한다고 선언하고 “일부 소속은 선으로 표시”라는 cue와 B/C의 정확한 포트를 제공해야 한다. 선언 없이 mode mask를 바꾸면 실패다. area를 line으로 내릴 때는 새 A_area로 관측 signature를 다시 투영하고 전체 관련 patch를 재검증한다. 기존 certificate를 그대로 재사용하지 않는다. patch 경계는 반열린 구간 규칙으로 소유권을 정하고, 경계에 걸친 glyph는 각 patch와 교차하는 support를 모두 검사한다. 같은 area vocabulary/mode를 갖는 인접 patch는 연결 zone 검증 때 다시 합치거나 공통 global component ID와 witness certificate를 공유한다. 계산용 seam이나 viewport clipping만으로 새 witness 의무를 만들지 않는다. 실제 mode 전환 경계에서는 새 투영 의미로 검사한다. 긴 interval witness의 경우 각 patch 안의 support 조각을 검사하고, 그 합집합이 원래 전체 support를 덮는지 확인한다. 원래 Event ID와 hit target은 하나다.

```text
validatePatch(patch):
  A = patch.areaEncodedCompositeIds
  Z = projectedSignatures(canonicalPlacedCarriers, A)
  arrangement = robustArrangement(areas, declaredFillRule)
  preserve connectivity through artificial same-mode seams
  label faces by crossing boundaries from the unbounded face
  for connected filled zone Q of one label sigma:
    require sigma in Z
    require matchingPlacedGlyphWitnessInside(Q, sigma, A)
  for every affected event and composite:
    check declared AREA containment/exclusion or PORT incidence
  require complete disclosed membership and visible patch-mode cue
```

coincident boundary에는 모든 Composite label을 보존하고 renderer와 같은 even-odd 또는 winding fill rule을 사용한다. 임의의 미세 offset으로 같은 경계를 갈라 가짜 zone을 만들지 않는다. arrangement dual graph의 boundary crossing으로 face label을 전파하고, 다른 경로로 도달한 label이 일치하는지도 검사한다.

### 8.4 포함 관계와 동일 집합의 경계

명시 P→C여도 선택한 leaf carrier 도메인에서 M(P)=M(C)일 수 있다. 부모 경계를 항상 일정 margin만큼 더 크게 그리면 실제로는 없는 P-only zone이 생긴다. 따라서 strict geometric nesting과 exact atomic-zone 조건을 동시에 무조건 hard constraint로 둘 수 없다.

동일한 멤버십에서는 경계를 공유하고 identity label을 분리하거나, 부모의 배경을 membership fill이 아닌 구조 안내로 표시한다. 우연한 M(A)⊂M(B)는 membership 사실일 뿐 부모 관계의 증거가 아니다. 구조 판단은 별도 DAG 표기와 상세 정보로 확인한다. 이 구분을 사용자가 놓치면 해당 silhouette는 line/port 표현으로 바꾸는 후보를 평가한다.

### 8.5 수치 정확도와 최종 렌더 도형

offline publication 검증의 certificate level을 명시한다. EXACT_SERIALIZED는 최종 직선 polygon의 직렬화 좌표에 대해 exact 또는 filtered-exact predicates와 exact intersection constructions를 함께 써서 arrangement topology를 확인한 결과다. robust predicate만 쓰고 intersection 좌표를 부정확하게 구성한 결과를 exact라고 부르지 않는다. CONSERVATIVE_VERIFIED는 오차 상한 아래에서도 위반이 없음을 확인한 경우이며, 판정 불명은 unresolved로 거부한다. 렌더 부동소수점 결과와의 차이도 clearance·stroke 검증에 포함한다. 모든 관측 face를 검사하며 2^{|A|}개의 모든 가능한 signature를 미리 만들 필요는 없다. 최악의 경계 교차 수는 여전히 커질 수 있다.

raster sampling은 빠른 preview 진단으로만 쓴다. 얇은 침범과 작은 false atom을 놓칠 수 있으므로 발행 certificate를 대신하지 못한다. 같은 이유로 작은 오류 face를 단순히 무시하는 “면적 tolerance”로 P1을 완화하지 않는다. 수치적으로 분류할 수 없는 face는 unresolved로 처리하고 fill을 제거하거나 정밀도를 높인다.

곡선을 추가하면 오차가 제한된 flattening 또는 검증 가능한 curve predicates로 최종 곡선을 다시 검사한다. smoothing 오차 ε보다 glyph clearance가 크면 해당 glyph 포함·배제 유지의 충분조건이 될 수 있지만, 자기교차·좁은 neck·다른 경계와의 topology는 별도 검사해야 한다. stroke 확장, 양자화, mesh triangulation 후에도 렌더 geometry가 certificate와 일치하는지 확인한다. Bubble Sets의 부드러운 contour 자체에는 이 모든 보장이 없다. [R3]

## 9 두 가지 제한된 대안

### 9.1 후보 B 분기와 재합류 mesh

A에서 single-run fallback이 너무 잦고 정체성 추적이 나쁘면, 한 Composite의 같은 Y 단면에 여러 X 구간을 허용한다. 고정된 Event support를 terminal로 하는 obstacle-aware routing graph를 만든다. 각 Composite의 member terminal을 deterministic 근사 Steiner tree/forest로 잇고, 관측 signature가 있는 terminal 주위는 공통 atom cell로 공동 구성한다.

이 경로는 contains DAG가 아니다. 도형을 그리기 위한 별도의 identity routing graph다. 여러 Composite의 선이 교차했다고 합류 node를 만들지 않는다. 처음에는 모든 경로를 typed line으로 두고, 전체 arrangement 검사에 통과하는 edge만 영역으로 두껍게 한다. 근사 Steiner 선택에는 경로 길이, nonmember clearance, 기존 경로에서의 변화, 비의도 교차 비용을 사용한다.

```text
mesh = routeGraphAroundFixedSupports(eventSupports)
reserve observedSignatureCells(mesh)
for c in deterministicRoutingOrder:
  route[c] = approximateTerminalTree(c, mesh, boundedSearch)
repair local route conflicts within work budget
thicken only jointly certified corridors
validate region components, ports, and trace ownership
```

첫 graph는 좌표 압축 rectilinear graph로 구체화한다. inflate한 glyph box의 좌우·상하 경계 바깥 좌표, 지정 port, 이전 bend와 고정 외곽 channel 좌표를 X/Y 목록에 넣는다. Cartesian product의 크기를 먼저 계산해 cap 초과 시 할당 전에 중단한다. 통과 가능한 점을 vertex로 하고 같은 행·열의 인접점만 잇는다. 전체 segment가 장애물을 침범하면 edge를 제거한다. terminal box는 지정 port tunnel로만 들어간다. interval terminal의 전체 support를 연결된 채로 유지한다.

(vertex, incomingDirection) 상태의 Dijkstra에 길이, 90도 회전, 이전 route에서의 거리, 무관한 trace 교차, 예약 edge 충돌의 비음수 비용을 더한다. Composite별로 가장 작은 Event ID terminal에서 시작해 현재 tree의 모든 vertex를 source로 하는 Dijkstra로 가장 싼 미연결 terminal을 반복 연결한다. 동점은 (비용, 대상 Event ID, vertex ID, 방향)으로 해소한다. 이는 greedy terminal tree이며 최적 Steiner tree가 아니다.

reroute는 충돌 tuple 순으로 선택한 경로를 해제하고 해당 edge 비용을 높여 같은 탐색을 재실행한다. tube 폭은 clearance 이내의 {r, r/2, r/4}, join은 bevel만 처음 사용한다. tube 추가마다 주변 arrangement, 마지막에는 전체 arrangement를 검증한다.

spanning tree는 가지를 만들지만 진짜 split/rejoin cycle을 만들지는 않는다. 이를 시험하는 별도 변형에서는 1 run→여러 run→1 run 구간의 앞뒤 vertex u,v를 잡고, 기존 u–v 경로 내부를 막은 뒤 다른 실제 member terminal r을 거쳐 두 번째 u–v 경로를 찾는다. u→r와 r→v의 내부 vertex도 겹치지 않게 순서대로 막고, 반대 순서도 한 번 시도한다. 실제 cycle과 geometry 검증을 통과한 경우만 rejoin으로 센다. 실패가 경로 부재의 일반 증명은 아니다.

r56가 하나의 큰 관계 성분이 될 수 있으므로 성분 분해만으로 비용이 작아진다고 가정하지 않는다. 초기 B의 상한은 routing anchor 32개, graph vertex 65,536개, reroute 3 pass, 전체 expanded state 2백만, cycle 시도 8회로 둔다. 어느 상한이든 넘으면 UNKNOWN_BUDGET과 해당 범위를 남기고 A 또는 port/list fallback으로 전환한다. 이 숫자는 검증 전 가설이다.

branch 수는 2 또는 3 등 작은 상한부터 비교한다. 상한을 늘린다고 정확한 연결 영역이 항상 존재하는 것은 아니다. 특정 mesh에서 길을 못 찾은 결과는 그 mesh, clearance, 고정 경계에 대한 실패다. 일반적인 2D Euler 표현 불가능의 증명이 아니다.

완전 fragmentation은 B의 별도 실험 조건이다. 아무 표시 없이 같은 색의 섬을 남기지 않고 component ID, 동일 Composite label, 연결/확장 동작을 둔다. 선으로 연결된 여러 면을 “하나의 연결된 면”이라고 기록하지 않는다. [R3–R5]

### 9.2 후보 C 선 우선 표현

Composite identity를 안정된 시간 방향 spine으로 유지하고, 실제 Event의 membership 포트에만 연결한다. 면은 관측된 atom 근처에서만 선택적으로 사용한다. 비멤버를 둘러싸지 않는 경로와 bridge 표기를 사용하며, 밀집한 포트는 정확한 목록으로 접는다.

첫 C의 spine X는 6절 root 순서와 각 Composite의 member 기준 X 중앙값으로 정하고, ID 동점 순서로 nominal 간격을 둔다. Event body의 X는 공통 QP 결과를 사용한다. 포트는 glyph 양쪽 측면에 Composite ID 순으로 할당하고, 공간이 부족하면 여러 개의 새 Event mark 대신 하나의 count affordance와 정확한 목록을 쓴다.

연결은 같은 시간 support 높이의 수평 구간을 먼저 시도한다. 다른 glyph를 침범하면 B의 제한된 graph에서 두 번 꺾이는 경로를 탐색하고, 실패하면 목록으로 접는다. interval의 접점은 선의 접점일 뿐 새 발생 시각이 아니다. spine이 nonmember glyph를 지나면 해당 구간에 gap을 내며 어떤 intersection에도 관계 hit target을 만들지 않는다. 면은 Event 주변 atom cell부터 추가하고 8절 patch 검증을 통과한 것만 남긴다.

C는 A/B가 과도한 contour 복잡도를 만드는 경우의 독립 비교군이자 최종 fallback이다. KelpFusion의 선·면 조합과 LineSets의 곡선 기반 집합 표현이 참고가 된다. 그 연구의 결과가 고정 시간·DAG 화면에도 그대로 적용된다고 주장하지 않는다. [R5, R11]

세 후보의 비교에서 X를 공유하는 geometry-only 실험과 X까지 바꾸는 joint 실험을 나눈다. 그렇지 않으면 나아진 이유가 순서, 좌표, contour 중 어디에 있는지 알 수 없다. 후보 선택은 내부 실험 설정이며 최종 사용자는 동일한 탐색 경험을 사용한다.

## 10 펼침과 상세도와 전환

### 10.1 수동 의도와 자동 선택

Event별 intent는 auto/show/hide, DAG 경로별 intent는 auto/expand/collapse로 분리한다. show는 최소 식별·접근을 보장하며 모든 label과 subtree를 한 화면에 강제한다는 뜻은 아니다. scope 밖으로 나간 수동 의도는 dormant로 보존하고 돌아오면 복원한다. 삭제된 ID는 stale로 표시한다.

자동 선택은 먼저 수동 hide와 path collapse를 지키고, 유효한 show/pin 및 현재 선택 대상의 affordance를 예약한다. 이후 시간 cell과 signature별 coverage를 늘리는 후보를 화면 비용 대비 greedy하게 추가한다. 같은 coverage 이익이면 충돌이 적고 기존 표현을 유지하는 후보, 이후 ID 순서를 택한다. 이 점수는 현재 화면에서만 유효하며 Event의 importance 속성이 아니다.

강제 표시 항목이 budget을 넘으면 사용자 선택을 몰래 해제하지 않는다. 가로 탐색, 스크롤 가능한 연결 목록 또는 요약 affordance로 접근을 보장한다. 한 부모 경로의 collapse는 다른 열린 경로나 직접 pin으로 접근한 동일 Event를 지우지 않는다. Unfolding Edges에서 가져오는 것은 숨은 정보의 예고, 국소 상세 공개와 복귀의 상호작용 원칙이다. 이 연구는 대형 Composite DAG 레이아웃의 확장성을 증명하지 않았다. [R6]

### 10.2 집계가 사건을 만들지 않게 하기

LOD summary는 Event와 다른 presentation type이다. summaryId, exact coveredEventIds 또는 검증 가능한 참조, unique count, 시간 범위, scope, signature를 갖는다. 기본 집계 키는 시간 bin×active signature다. 다른 signature를 합치는 경우 mixed라고 명시하고 클릭하면 정확한 signature별 목록으로 나눈다.

시간 bin의 중간을 모든 사건의 대표 날짜로 표시하지 않는다. 범위 bracket이나 count strip을 사용하고 펼치면 원래 시간 support를 보여준다. Composite를 접은 proxy, density summary, 본래 Event glyph는 서로 다른 role이다. 같은 ID의 사건을 여러 요약에 중복 계수하지 않는다.

모든 omission에는 user-hidden, scope-filtered, path-collapsed, lod-summarized, label-suppressed, outside-viewport, data-not-loaded, render-fallback 중 사유를 남긴다. “관계 없음”과 “아직 확인되지 않음”을 구분한다. 숨겨진 항목마다 적어도 하나의 reveal route가 있어야 하며 키보드·목록·검색으로도 접근할 수 있어야 한다. hover만으로 발견하게 하지 않는다.

UpSet 계열 행렬은 기본 시간 화면의 대체재가 아니라 복잡한 교집합을 확인하는 보조 수단이다. 포함 교집합과 배타 교집합, 선택한 집합과 전체 World, leaf와 all-Event, 시간 범위와 revision을 표시한다. 원소 클릭은 같은 Event 선택 상태로 돌아온다. [R7]

### 10.3 전환 중에도 의미를 유지하기

pan/filter/zoom의 기본은 canonical 좌표 유지다. LOD의 확대·축소 threshold를 다르게 하고, 상태가 바뀌어도 수동 intent는 유지한다. hysteresis를 포함한 replay에서는 이전 LOD 상태와 view epoch도 입력이다.

두 endpoint geometry가 유효하다고 그 사이의 선형 morph가 유효한 것은 아니다. 전환 중 다른 Event를 잠깐 감싸거나 없는 triple intersection을 만들 수 있다. 검증되지 않은 morph에서는 semantic fill을 제거하고 중립적인 이동/연결 표현을 사용한 뒤, 검증된 새 fill로 의미를 한 번에 전환한다. Event hit target과 선택은 끝까지 하나다.

exact 시간점과 uncertainty/duration 경계의 Y는 animation에서도 고정한다. reduced-motion에서는 이동 없이 교체하되 변경 범위와 선택 상태를 유지한다. 긴 전환은 중단 가능해야 한다. mental map과 animation의 이점은 과제에 따라 달라지므로 “부드럽게 움직이므로 이해도가 높다”는 결론을 선행하지 않는다. [R12, R13]

## 11 실행 결과와 실패 상태

### 11.1 전체 흐름

```text
buildTSTL(snapshot, options, optionalReference):
  P = projectAndValidate(snapshot)
  if P.invalid: return INPUT_ERROR(P.diagnostics)
  T = preserveTemporalSemantics(P)
  K = makeCanonicalKey(P, T, options, optionalReference)
  orders = generateBoundedStableCandidates(P, T, options)
  incumbent = none
  for O in orders under deterministic work budget:
    if positiveOrderCycle(O): record MODEL_CONFLICT; continue
    X = solveFixedYQP(O, T, nominalSupports)
    if X.provenInfeasible: record restrictedModelProof; continue
    if not X.feasible: record UNKNOWN_OR_NUMERICAL; continue
    (X, G) = constructCandidateGeometry(A_or_B_or_C, P, T, O, X)
    (X, G) = boundedRepairOrTypedFallback(X, G)
    V = independentFullValidator(P, T, X, G)
    if V.valid: incumbent = deterministicBetter(incumbent, {X, G}, V)
  if incumbent exists: return certifiedArtifact(K, incumbent)
  return validatedEventAndMembershipListFallback(P, T, K)
```

최종 목록 fallback조차 입력 오류를 해결하지는 못한다. source가 불완전하면 completeness와 불명 사유를 그대로 전달한다. 오래된 검증 결과를 대신 쓰는 경우 revision과 오래된 상태를 명시한다. 새로운 데이터인 척 보여주지 않는다.

| 상태 | 필요한 증거 | 의미 |
|---|---|---|
| VALID_HEURISTIC | 모든 hard validator 통과 | 유효하나 최적성은 미증명 |
| VALID_OPTIMAL_WITHIN_MODEL | validator와 해당 모델의 최적성 증명 | 제한된 모델 안에서만 최적 |
| MODEL_INFEASIBLE | C1P 반례, packing 하한, solver certificate 등 | 명시한 모델·폭·pin 조건의 불가능 |
| BUDGET_EXHAUSTED | work limit과 incumbent 여부 | 탐색이 끝나지 않았음 |
| GEOMETRY_INVALID | 위반 glyph/face/port와 재현 위치 | 생성 도형이 계약을 위반 |
| NUMERICAL_UNRESOLVED | 수치 오차나 predicate 판정 불가 | 의미를 승인할 수 없음 |
| INPUT_ERROR 또는 PARTIAL | cycle, 누락 참조, 불완전 source | source 문제이며 layout 실패와 다름 |

동일 Y에서 폭 w(i)의 glyph m개와 간격 g를 폭 W에 모두 넣어야 할 때, 다음은 고정 폭 모델의 불가능을 보여주는 충분조건이다.

$$\sum_{i=1}^{m}w_i+(m-1)g>W$$

이는 무한한 가로 공간에서도 해결할 수 없다는 뜻이 아니다. 첫 후보는 viewport 폭을 canonical hard constraint로 두지 않는다. 공간이 부족하면 실제 폭 증가, LOD, 가로 탐색으로 처리하며 시간 이동이나 entity 복제를 허용하지 않는다.

### 11.2 제안되는 artifact 계약

기존 LayoutOutput은 호환용 point/segment/bounds projection으로 유지할 수 있다. 별도의 TSTLWorldGeometry에는 Event X와 lossless temporal support 참조, Composite component의 outer/holes, typed trace, port incidence, patch mode, covered IDs, 미배치 수와 certificate를 넣는다. componentId는 표현 ID이며 새 Event ID가 아니다.

모든 artifact는 source revision, input digest, temporal sidecar digest, 알고리즘·파라미터 버전, geometry digest를 공유한다. renderer는 다른 revision의 geometry와 membership을 섞지 않는다. asynchronous 결과에는 view epoch/generation guard를 둔다.

현재 polygon.rings가 있다는 사실만으로 multipart, holes, triangulation, hit test, label 배치가 모두 지원된다고 가정하지 않는다. future compiler가 검증한 geometry를 실제로 소비하고 기존 hull로 덮어쓰지 않는지, spatial bounds와 mesh/hit target이 일치하는지 전체 경로를 검증해야 한다. [C3]

## 12 파라미터와 계산 예산

### 12.1 재현용 초기 preset

최초 replay를 하나로 고정하기 위한 TSTL A0 preset을 둔다. 이 값들은 튜닝된 권고값이 아니다. u=1 reference pixel로 두고, source의 최소·최대 finite Y를 reference 높이 4096u에 대응시키는 양의 affine transform을 수치 계산에만 사용한다. 원래 time-system 좌표와 Y를 그대로 저장하고 변환·역변환 오차를 검사한다. 범위가 0이면 scale=1로 둔다. 현재 viewport는 이 reference transform을 바꾸지 않는다.

nominal point body는 6u×6u, interval body 폭은 6u, 가시 stroke는 1u, glyph gap g=3u, 포함 padding p=3u다. uncertainty/duration의 Y 길이는 source support를 그대로 변환한 값이다. terminal cell과 band의 최소 폭은 해당 support 폭+2p로 정한다. label은 이 치수에 포함하지 않는다.

order 비용의 run 수·inversion·순서 반전은 각각 가능한 항의 개수로 나누고 분모가 0이면 0으로 둔다. 예상 폭은 초기 순서 폭으로 나눈다. 초기 λ(r,s,x,w)=(4,4,1,0.1), sweep 8 pass, 작은 재배열 길이 6, total candidate 32로 둔다. 후보는 기존 순서→앞 sweep→뒤 sweep→ID순 국소 permutation 순서로 만들며 중복을 제거한다.

QP는 X/q/L/R와 reference Y 간격 h를 모두 고정된 6u로 정규화한다. anchor 항은 Event 수로 나누고, 이동 적분 항과 폭 적분 항은 해당 Composite의 고정 support 길이 H로 나눈다. H는 knot 수가 아닌 모델의 고정 시간 범위이며 0인 경우 해당 적분 항을 두지 않는다. 선형 경계의 폭 적분은 slab마다 h(j)×(width(j)+width(j+1))/2의 trapezoid 합으로 계산한다. bend 항도 같은 H로 정규화하되 이 항은 이산 curvature 대리 지표라고 명시한다. λ(anchor,move,bend,width)=(4,1,0.25,0.1), ε=10⁻⁶을 사용한다. z0는 초기 envelope이며 reference가 없을 때도 정의된다. solver feasibility tolerance는 정규화 좌표 10⁻⁸로 시작하지만 최종 geometry 판정의 면책 오차로 쓰지 않는다. cold solve, single-thread와 고정 library/version을 기록한다.

A의 repair는 12단계, 7절의 메뉴 순서를 사용한다. B의 edge 비용은 length 1, 90도 bend 6u, 이전 경로와의 정규화 거리 1, 무관 crossing 12u, reserved conflict 12u로 시작한다. routing clearance=3u, graph boundary offset δ=0.5u, 외곽 channel=24u, tube 반폭 후보={3u,1.5u,0.75u}다. 경로 비용은 모두 비음수이고 ID tie-break를 고정한다. 곡선은 끄고 piecewise-linear로 시작한다. 자원 상한은 9절의 B cap을 사용한다.

### 12.2 민감도 비교

아래 값은 **검증 전 실험 범위**다. 제품 기본값이나 이미 달성한 성능이 아니다. 한 번에 모두 grid search하지 말고 semantic gate를 통과한 후보에서 민감한 축을 순차 비교한다.

| 파라미터 | 처음 비교할 범위 | 커질 때 예상되는 변화 |
|---|---|---|
| order sweep pass | 2, 8, 20 | 탐색 비용 증가, 개선은 보장되지 않음 |
| 국소 정확 탐색 항목 수 | 6–10 | 품질 비교 가능, factorial 비용 위험 |
| 시간별 order 후보 수 | 8, 32, 128 | 더 많은 경로 탐색, 전이 비용 증가 |
| reference stability 가중치 | 정규화 후 1, 4, 16 | 이동 감소, 폭·교차가 늘 수 있음 |
| glyph 간격과 region padding | nominal glyph 폭의 0.25–1.0 | 식별성 증가, 폭·route 실패 증가 |
| local repair 단계 | 4, 12, 32 | 더 많은 복구 시도와 발행 비용 |
| B의 branch 상한 | 단면당 2, 3 | 표현 자유 증가, 추적·검증 난도 증가 |
| routing restart | 1, 3, 5 고정 순서 | greedy 순서 편향 완화 후보, 비용 증가 |
| 곡선 flattening 오차 | reference pixel 0.1–0.5 이하 | 작을수록 경계 수와 검증 비용 증가 |
| LOD hysteresis 폭 | threshold의 10–25% | 깜빡임 감소, 상세도 반응 지연 가능 |
| 전환 시간 | 0, 150, 300ms | reduced-motion은 0, 효과는 과제로 검증 |
| 자동 화면 예산 | nominal 비용 1×, 2×, 4× | 상세 증가와 충돌·렌더 비용 증가 |

geometry padding과 flattening 오차는 시간 경계를 바꾸는 허용치가 아니다. 시간은 authoritative reference로 비교한다. X/contour를 양자화했다면 최종 도형을 재검증한다. 간격 값은 canonical reference unit으로 저장하며 runtime zoom의 pixel 크기로 재해석해 published 좌표를 바꾸지 않는다.

n=Event, k=Composite, d=contains edge, w=bitset word 크기, P=Event–slab incidence, H=충돌 pair, V=연속 변수, S=polygon segment, I=경계 교차 수로 둔다.

- DAG 정렬은 O(n+d), dense bitset closure는 O((n+d)⌈n/w⌉) 상한과 O(k⌈n/w⌉) 저장을 고려한다. 실제 leaf/ancestor storage를 선택해 중복을 줄인다
- temporal sweep은 O(n log n+P+H) 수준이다. 긴 interval이 많으면 P와 H가 크게 늘고 H는 최악 O(n²)다
- C1P 판정은 incidence 크기에 선형이지만 후보 순서 scoring과 slab 간 consistency는 추가 비용이다
- order 후보 K개를 모든 인접 slab 사이에서 비교하는 DP는 대략 O(TK²n log n) 전이 비용이다. beam pruning 후에는 전역 최적성을 주장하지 않는다
- QP는 sparsity와 solver에 의존한다. dense 선형 solve의 O(V³) 시간·O(V²) 메모리 위험을 감안하고 변수/제약/iteration을 실측한다
- polygon arrangement는 통상 O((S+I)log S) 계열의 sweep과 출력 크기에 비례하는 저장을 고려한다. I는 최악 O(S²)이며 face signature 부여 비용도 별도다
- B의 routing은 terminal 수, graph node/edge 수, 최단 경로 호출과 reroute 예산에 좌우된다. 모든 terminal 쌍의 경로를 무제한 보관하지 않는다

자료구조가 더 작아도 모든 DAG 경로를 열거하면 지수적으로 커질 수 있다. membership은 bitset, provenance는 직접 edge와 필요 시 복원할 경로 handle로 둔다.

offline publication/Lab은 전체 exact geometry 검증을 수행한다. 일반 화면 경로는 검증된 artifact의 hash, scope, bounded clipping과 typed incidence를 확인하고 전체 World arrangement를 다시 만들지 않는다. 새 topology를 runtime에서 생성해야 한다면 해당 bounded patch도 검증을 마친 뒤에만 fill로 표시한다. 시간이 부족하다고 근사 검사만으로 semantic fill을 승인하지 않는다.

## 13 실제 baseline과 비교 fixture

### 13.1 고정할 기준 데이터

기준 fixture는 공개 저장소의 history-r56.json이다. 현재 live 최신 revision을 의미하지 않는다. byte SHA-256은 b3d846434095c536fc75c5c098ef87d77d18aa00210627b305eac407fc9461ae다. World revision은 56, sourceRootDigest는 d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54다. [F1]

539 Events와 614 contains edge, 7 Collections, 1,112 Event–Collection membership을 포함한다. numeric display-year 범위는 약 1510–1645다. 이 범위는 scalar display-year 좌표의 요약이다. 536 numeric extents 모두 min<max지만 이 사실을 실제 duration이나 날짜 정밀도로 해석할 수 없다. 원본 temporal semantics를 보존한 새 fixture가 별도로 필요하다.

한국 K, 일본 J, 중국 C Composite의 leaf 도메인에서 관측한 배타 교집합은 다음과 같다. 이 표는 국가 Collection의 직접 member 수가 아니다.

| 정확한 signature | leaf 수 | 정확한 signature | leaf 수 |
|---|---:|---|---:|
| K만 | 87 | K와 J만 | 112 |
| J만 | 71 | K와 C만 | 83 |
| C만 | 45 | J와 C만 | 3 |
| K와 J와 C | 29 | 전체 합집합 | 430 |

K∩J는 triple을 포함해 141, K∩C는 112, J∩C는 32다. 중국을 표시 집합에서 빼면 KJ의 배타 signature 수는 112에서 141로 바뀐다. Event가 늘어난 것이 아니라 질문의 기준 집합이 바뀐 것이다. 이 사례를 UI scope 표시와 validator의 회귀 테스트로 사용한다.

실제 direct contains 경로에는 한국사→임진왜란, 일본사→임진왜란, 임진왜란→정유재란, 정유재란→순천 왜교성 앞바다의 봉쇄, 중국사→같은 봉쇄 Event가 있다. 따라서 마지막 Event는 세 국가 history에 도달하지만 중국사→임진왜란 edge를 만들어서는 안 된다. Imjin War의 recursive leaves는 93이고 중국 history와 공유하는 leaf는 29다. [F1]

### 13.2 기준군과 ablation

B0는 현재 commit의 global-incidence/1과 기존 contains hull을 그대로 replay한 결과다. r56의 input에는 incidence가 빠져 있으므로 outer events/relations/collections에서 현행 테스트와 같은 방식으로 복원한다. 테스트 파일에 있는 shape digest는 이번 문서에서 새로 실행해 확인한 성능/출력 결과가 아니다. 구현자가 replay해야 한다. [C4]

비교군은 B0, 후보 A, 후보 B, 후보 C다. legacy-force는 필요하면 역사적 comparator로 따로 둔다. X-only, geometry-only, joint 세 ablation에서 같은 snapshot, carrier D, 시간 어댑터, visible IDs, font, viewport trace를 사용한다. temporal adapter 변경 효과는 layout 변경 효과와 분리하여 보고한다.

baseline의 semantic 오류도 같은 검사로 측정한다. 실패한 case를 corpus에서 제외하거나 유효한 case만 모아 성공률을 높이지 않는다. 전체 coverage/fallback/실패율과, 유효한 해에서의 품질·시간을 모두 보고한다.

### 13.3 반례와 확장 corpus

필수 microfixture는 DAG diamond, 같은 leaf 집합을 갖는 P→C, edge 없는 우연한 subset, 같은 Y의 AB/AC/BC, triple 없는 pairwise 교집합, 한 Event의 ABC, 긴 interval의 상충 순서 cycle, 동일 날짜의 dense glyph, unknown/open time, 부분 로드, hybrid mode 경계, A→B→A view 복귀다. 합성 fixture는 실제 세계사 데이터의 대체물이 아니다.

r56에는 몽골 팽창과 세계대전 시기가 없고 별도 전체 조선 history Composite도 확인되지 않았다. 해당 실제 corpus가 추가되기 전에는 그 시나리오를 통과했다고 보고할 수 없다. 현재 nesting 과제에는 한국사→임진왜란→세부 작전과 이순신 생애의 실제 공유 경로를 사용한다. extreme world-history zoom-out도 더 넓은 실제 기간과 밀도의 corpus로 확장해야 한다.

## 14 수용 기준과 평가 방법

### 14.1 자동 검증 게이트

다음은 후보를 발행·사용자 시험에 올리기 전의 필수 조건이다. geometry 검증의 “0”은 선언한 carrier/mode/scope에 대한 값이며 사람의 오해가 0이라는 뜻이 아니다.

1. Event ID 중복, 누락된 접근 경로, 잘못된 membership port, 표시된 가짜 contains edge가 0이다
2. 정확 시간점·uncertainty bound·duration 경계의 source mismatch와 충돌 회피 목적의 Y 이동이 0이다
3. 최종 area-encoded patch에서 nonmember inclusion, member exclusion, unsupported exact atom이 0이다. 불확실한 수치 판정은 승인으로 계산하지 않는다
4. 모든 omitted ID와 unplaced ID에 사유와 실제 reveal route가 있고, unique count가 oracle과 일치한다
5. pan/zoom/Collection toggle trace에서 canonical geometry hash와 Event X가 변하지 않는다. 같은 complete replay의 결과가 재현된다
6. hybrid·fragment·animation·clipping의 각 표현 상태에서도 위 계약이 유지된다

코드의 validator와 독립된 작은 brute-force oracle로 closure/signature를 비교한다. property-based generator는 DAG, 다중 부모, 같은 멤버십, interval 충돌을 변형한다. 실패 입력은 최소 반례로 축소하고 fixture로 남긴다.

### 14.2 사람이 수행할 여섯 과제

- 한 Event가 어떤 Composite에 속하는지 찾기
- 둘 또는 셋이 공유하는 실제 사건을 찾아 단일 Event로 식별하기
- 명시적 부모와 descendant 공유·우연한 subset을 구별하기
- 토글·pan·zoom 뒤 원래 사건을 다시 찾고 흐름을 추적하기
- 숨겨진 사건을 찾고 접힘·필터·미배치 등 안 보였던 이유를 설명하기
- 불확실한 발생일과 실제 지속기간을 구별하기

counterbalanced within-subject 설계를 기본으로 두고 과제 순서와 후보 순서를 균형화한다. 같은 사실의 반복 학습을 줄이는 대응 문항을 만들고, 역사 사전지식과 화면 크기를 기록한다. 정확도, 소요 시간, confidence, 오류 유형을 함께 수집한다. 주요 과제와 비교 가설을 먼저 고정하고 다중 비교·제외 기준을 명시한다.

첫 개인용 연구 prototype을 시작하기 위해 대규모 모집을 먼저 할 필요는 없다. 우선 개발자와 소수 사용자의 형성 평가로 오독·복원 실패를 찾고 usable prototype을 반복한다. 다음 기준은 제품 기본값으로 채택할 때 검토할 후속 확증 평가의 가설이다.

초기 채택 가설은 주요 과제 정확도의 95% 신뢰구간 하한이 baseline 대비 −5%p보다 높고, 공유사건 발견 또는 복귀 과제 중 사전 지정한 주 지표에서 정확도 +10%p 또는 시간 15% 감소의 실용적 개선이 있는 것이다. 이는 검증 전 제품 판단 기준이며 논문이 보증한 수치가 아니다. 작은 형성 평가로 문항과 오류 유형을 먼저 점검한 뒤 효과 크기와 반복 측정을 고려해 표본 수를 정한다. 4명의 전문가 인터뷰만으로 일반 사용자 성능을 주장하지 않는다. [R6, R12]

### 14.3 안정성과 성능

안정성은 카메라 변환을 제거한 공통 Event의 X 변위 median/p95/max, Composite 순서의 Kendall 변화, branch identity 매칭 실패, 경계 차이, fallback 전환 수로 측정한다. 새로 들어오거나 빠진 Event를 기존 Event 변위 평균에 섞지 않는다. canonical filter trace는 변위 0을 요구한다. revision 갱신과 명시 transient reflow는 별도 측정한다.

성능은 projection, order, QP, routing, validation, serialization, read, mesh, label, paint를 나누어 측정한다. 장치·브라우저·CPU·메모리·DPR·viewport와 cold/warm 여부를 고정한다. 초기 실험 목표는 r56 offline 처리 5초와 peak memory 250MB 이내, view update p95 50ms 이내, gesture frame p95 desktop 16.7ms/mobile 33.3ms 이내다. 이 수치는 아직 측정하지 않은 가설이며 기하 검증을 생략해 맞추지 않는다.

최소 viewport는 desktop 1280×800과 mobile 390×844로 시작하고 실제 지원 장치에서 보정한다. fetch 지연과 cache hit는 분리한다. p95만 보고 멈춤을 숨기지 말고 p99/max, dropped frame, main-thread long task도 보고한다. 목표를 못 맞추면 publication 계산량, view read budget, LOD를 조정하고 의미 gate는 유지한다.

## 15 구현을 시작할 때의 순서

1. snapshot과 TemporalSidecar, carrier/mode 계약, 독립 의미 oracle을 먼저 만든다
2. 현재 B0를 고정 fixture로 replay하고 기존 지표와 새 validator의 차이를 기록한다
3. A를 piecewise-linear geometry와 제한된 repair로 구현한다. prototype renderer가 검증한 contour를 실제로 소비하는지 확인한다
4. 같은 X에서 B/C geometry를 비교하고, 필요할 때만 joint optimization을 추가한다
5. 실제 과제와 interaction trace로 정확도·안정성·성능을 비교한다. 단순화나 fallback 실패도 결과에 포함한다
6. 통과한 후보에 대해서만 versioned publication, spatial index, mesh/hit test, rollback 경계를 별도로 설계한다

후속 구현에서 새 stored history, contains 관계, Narrative, Collection membership을 레이아웃 편의상 고치지 않는다. geometry artifact의 version 추가와 production 적용은 별도의 변경 결정이다.

결론은 특정 논문의 알고리즘을 그대로 설치하자는 것이 아니다. 권고 A부터 **의미 투영 → 고정 시간의 X 배치 → 검증 가능한 geometry → 명시적인 fallback**을 구현하고, B/C가 동일 데이터에서 실제 독해를 개선하는지 확인하자는 것이다. 문헌은 각 단계의 근거를 제공하며, 이 조합의 유효성과 비용은 Moirai의 실제 데이터와 반례에서 입증해야 한다.

## 16 문헌을 적용할 때의 경계

**TimeSets와 StoryFlow.** TimeSets는 집합 인접성과 adaptive detail의 출발점이다. 논문은 비인접·다중 소속 사건의 복제와 일부 시간 정밀도 희생을 사용한다. 공개 데모의 인접 가중치는 정확히 두 집합에 속한 사건만 세는 부분도 있다. StoryFlow는 이산 ordering, alignment, QP를 분리하지만 한 entity가 동시에 한 session에 속하는 기본 전제를 갖는다. 두 방법 모두 Moirai의 다중 부모 DAG와 단일 Event 계약에 맞게 다시 정식화해야 한다. [R1, R2]

**Bubble Sets와 F²-Bubbles.** virtual skeleton과 장애물 회피는 유용하지만 음의 field나 논문 제목의 faithful이 최종 glyph·atom 검증을 대신하지 않는다. F²-Bubbles의 계산상 복제는 내부 incidence 참조로만 해석해야 한다. 어떤 내부 변수 구조를 쓰더라도 외부 Event anchor와 hit target은 하나다. 해당 논문의 기하 지표 평가를 세계사 사용자 이해도 결과로 인용하지 않는다. [R3, R14]

**RectEuler와 Euler 최적화.** 포함·배제의 명시적 제약과 timeout 진단을 차용한다. empty zone을 허용하는 표현, 제한 시간 후 분할, 원소 제거를 포함하는 다른 논문의 fallback은 각각 별도의 선택이다. Moirai는 실패를 숨기려고 source Event를 제거할 수 없다. 같은 membership의 Event들을 하나로 합치는 전처리가 planar-support 가능성까지 바꿀 수 있으므로, atom bucket은 탐색 자료구조에 머물고 실제 terminal을 보존한다. [R4, R15]

**정확해는 작은 비교 문제의 기준이다.** 초기 oracle은 6–8개 item의 한 slab에 대한 모든 순열을 열거하고 hard constraints와 비용을 비교하는 방식으로 만들 수 있다. 여러 slab의 crossing oracle은 pair-order 이진 변수, transitivity, 실제 이어지는 support의 order reversal을 모델링한 MILP로 확장할 수 있다. node budget, incumbent, lower bound와 gap을 기록한다. disjoint interaction을 가정한 문헌의 제약 감소나 symmetry 증명을 겹치는 membership 모델에 그대로 적용하지 않는다. [R16]

**불확실한 시간과 coarse interval.** 같은 연도 안의 선후관계가 미정인 문제에서 layer 순서를 최적화하는 연구는 참고가 되지만, 그 결과를 실제 날짜처럼 Y에 배정하지 않는다. Moirai의 knowledge window는 원래 범위를 보존한다. 분포를 모른다면 gradient로 확률을 만들어내지 않는다. [R8, R17]

위 연구들을 함께 읽어도 기본값이 자동으로 정해지지는 않는다. 어느 후보가 더 좋은지는 전체 실제 fixture에서의 semantic coverage, fallback 비율, 사람의 과제 성능과 계산 비용을 함께 비교해야 결정할 수 있다.

## 17 참고문헌과 코드 근거

아래 논문은 알고리즘의 재료와 적용 한계를 뒷받침한다. 본문의 TSTL 수식·patch 계약·파라미터·수용 기준은 Moirai를 위한 설계 제안이며 개별 논문의 검증된 결론과 구별한다. 공개 코드 근거는 모두 d721b0efdcf309ed7ad21c55bc04572e2f14d644에 고정했다.

[R1] Nguyen 외. TimeSets Timeline Visualization with Set Relations. Information Visualization, 2016. §Set visualization, §TimeSets layout, §Scalability. [저자 수락본과 기관 기록](https://openaccess.city.ac.uk/id/eprint/15534/), [공개 데모 소스](https://vis4sense.github.io/timesets/demo/js/vis/timesets.js)

[R2] Liu 외. StoryFlow Tracking the Evolution of Stories. IEEE TVCG, 2013. §3, §5, §8. [공식 연구 페이지와 원문](https://www.microsoft.com/en-us/research/publication/storyflow-tracking-evolution-stories/)

[R3] Collins, Penn, Carpendale. Bubble Sets Revealing Set Relations with Isocontours over Existing Visualizations. IEEE TVCG, 2009. §3, Algorithms 1–2. [저자 기관 원문](https://vialab.science.uoit.ca/wp-content/publication_media/pdf/col2009c.pdf)

[R4] RectEuler Visualizing Intersecting Sets using Rectangles. Computer Graphics Forum, 2023. §5, §7.1–7.2. [출판 원문](https://diglib.eg.org/bitstream/handle/10.1111/cgf14814/v42i3pp087-098_cgf14814.pdf)

[R5] Meulemans 외. KelpFusion A Hybrid Set Visualization Technique. IEEE TVCG, 2013. §3, §4.4. [저자 기관 원문](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/kelpfusion_tvcg2013.pdf)

[R6] Bludau, Dörk, Tominski. Unfolding Edges Adding Context to Edges in Multivariate Graph Visualization. Computer Graphics Forum, 2023. §3, §5–6. [저자 원문](https://markjanbludau.de/publications/bludau2023unfolding.pdf)

[R7] Lex 외. UpSet Visualization of Intersecting Sets. IEEE TVCG, 2014. §3–5. [저자 원문](https://sci.utah.edu/~vdl/papers/2014_infovis_upset.pdf)

[R8] Kräutli, Boyd Davis. Known Unknowns Representing Uncertainty in Historical Time. Electronic Visualisation and the Arts, 2013. pp.62–64. [기관 원문](https://researchonline.rca.ac.uk/1622/1/ewic_ev13_s4paper1.pdf)

[R9] Booth, Lueker. Testing for the Consecutive Ones Property Interval Graphs and Graph Planarity Using PQ Tree Algorithms. JCSS, 1976. §2–4. [원문 PDF](https://www.cs.uoi.gr/~loukas/courses/grad/Algorithmic_Graph_Theory/index.files/Booth-Lueker-PQtrees.pdf)

[R10] Dobler 외. Optimizing Wiggle in Storylines. Graph Drawing, 2025. §3–6. [출판 원문](https://drops.dagstuhl.de/storage/00lipics/lipics-vol357-gd2025/html/LIPIcs.GD.2025.39/LIPIcs.GD.2025.39.html)

[R11] Alper 외. LineSets Visualization of Sets using Curves. IEEE TVCG, 2011. [저자 기관 원문](https://www.microsoft.com/en-us/research/wp-content/uploads/2011/12/linesets_infovis2011.pdf)

[R12] Archambault, Purchase. Mental Map Preservation Helps User Orientation in Dynamic Graphs. Graph Drawing, 2012/2013. §3–6. [출판 DOI](https://doi.org/10.1007/978-3-642-36763-2_42), [저자 공개 본문](https://www.researchgate.net/publication/232747172_Mental_Map_Preservation_Helps_User_Orientation_in_Dynamic_Graphs)

[R13] Heer, Robertson. Animated Transitions in Statistical Data Graphics. IEEE TVCG, 2007. §5–7. [저자 원문](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf)

[R14] F² Bubbles Faithful Bubble Set Visualization. IEEE VIS 2021 / TVCG 2022. §4–6, §8. [저자 원문](https://www.yunhaiwang.net/Vis2021/f2-bubbles/F2Bubbles.pdf)

[R15] Generating Euler Diagrams Through Combinatorial Optimization. Computer Graphics Forum, 2024. §2–6. [출판 원문](https://diglib.eg.org/bitstreams/a31f3196-7bbc-47d9-871c-3a4a1b469aa9/download)

[R16] Dobler 외. Revisiting ILP Models for Exact Crossing Minimization in Storyline Drawings. Graph Drawing, 2024. §2, §5–7. [저자 원문](https://arxiv.org/html/2409.02858v1), [출판 DOI](https://doi.org/10.4230/LIPIcs.GD.2024.31)

[R17] Dobler 외. Crossing Minimization in Time Interval Storylines. EuroCG, 2023. §1–2. [저자 원문](https://arxiv.org/html/2302.14213v1)

[C1] Moirai 시간과 데이터 계약. [relational-time.ts L8–65](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/contracts/src/relational-time.ts#L8-L65), [TS 010 시간 의미](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/docs/technical-specifications/TS-010-event-relational-time.md), [TS 002 Composite와 Narrative](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/docs/technical-specifications/TS-002-canonical-data-model.md#L41-L65)

[C2] Moirai 입력 축약과 baseY. [v5-world-layout.ts L25–137](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/v5-world-layout.ts#L25-L137), [bounded 분산 L742–777](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/urdr-chart-plane.ts#L742-L777), [repair와 X 계산 순서 L1998–2054](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/urdr-chart-plane.ts#L1998-L2054), [현행 engine 선택](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/layout-engine.ts#L418-L522)

[C3] Moirai 출력과 renderer 경계. [LayoutOutput L19–58](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/layout-engine.ts#L19-L58), [hull 재계산 L225–344](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/v5-render-publication.ts#L225-L344), [현재 hull 알고리즘](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/v5-render-hull.ts#L61-L95)

[C4] Moirai publication과 baseline replay. [TS 006 publication](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/docs/technical-specifications/TS-006-atropos-publication.md#L10-L44), [global incidence](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/collection-incidence.ts), [r56 regression test](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/packages/graph-presentation/src/collection-incidence.test.ts#L13-L57)

[F1] Moirai history r56 고정 fixture. [공개 원본](https://github.com/neocjmix/moirai/blob/d721b0efdcf309ed7ad21c55bc04572e2f14d644/scripts/layout-research/data/history-r56.json). 본문의 구조·leaf 통계는 이 파일을 읽어 계산한 값이다. live 최신 데이터, 새 알고리즘 실행 결과 또는 성능 실험으로 해석하지 않는다.
