---
id: TS-009
title: 잠재 3D 그래프 레이아웃과 2D 투영
status: draft
layer: technical-specifications
traces:
  - CON-003
  - BR-003
  - BR-004
  - JRN-003
  - JRN-005
related:
  - TS-005
  - TS-006
---

# TS-009 — 잠재 3D 그래프 레이아웃과 2D 투영

## TS-009.1 목적

이 명세는 Atropos의 그래프에서 관계선, 군집, 중첩 포함 구조가 동시에 나타날 때 발생하는 시각적 복잡도를 줄이기 위한 잠재 3차원 레이아웃을 정의한다.

핵심 원칙은 **3D를 렌더링 모델로 도입하지 않고 레이아웃의 추가 자유도로만 사용한다**는 것이다. 리프 노드만 내부적으로 `(x, y, z)` 좌표를 가지며, 현재 탐색 각도에서 이를 2D `(x', y')`로 투영한다. 투영 이후의 Composite region 계산, Relation routing, label, semantic zoom, JointJS rendering은 기존 2D 파이프라인을 사용한다.

따라서 이 설계는 일반적인 3D graph viewer가 아니라 **3D latent layout + 2D derived rendering**이며, 동작 특성상 2.5D graph untangling에 가깝다.

이 문서는 TS-006.12~TS-006.14의 2D 레이아웃을 확장하는 후보 명세다. `accepted` 전에는 TS-006의 기준선을 대체하지 않는다.

## TS-009.2 설계 목표

1. chronology 또는 structural order를 나타내는 세로축의 의미를 보존한다.
2. 기존 2D에서 해결하기 어려운 node overlap, edge crossing, edge-node intersection, dense cluster를 추가 자유도 `z`로 완화한다.
3. 사용자가 좌우 회전으로 깊이 방향을 탐색해 겹쳐 보이는 관계를 분리해서 읽을 수 있게 한다.
4. 중첩 Composite Event의 포함 관계와 y-monotone region 생성 규칙을 유지한다.
5. 기존 JointJS 기반 2D 렌더링 로직을 가능한 한 변경하지 않는다.
6. 같은 Publication Revision, layout algorithm version, 입력과 파라미터에서 결정적인 결과를 만든다.
7. `z = 0`, `yaw = 0`인 경우 기존 2D 레이아웃과 동등한 표현으로 퇴화할 수 있어야 한다.

## TS-009.3 비목표

다음은 이 명세의 목표가 아니다.

- Three.js/WebGL 기반 3D scene graph 도입
- Composite region을 실제 3D volume 또는 mesh로 모델링
- perspective camera를 통한 사실적인 원근 표현
- 자유 orbit camera, pitch 또는 roll
- z 좌표에 도메인 의미를 부여하는 것
- z 좌표를 Event의 authored fact 또는 Publication의 의미 데이터로 취급하는 것
- 3D edge routing 또는 3D label placement

`z`는 오직 시각적 복잡도 감소와 탐색을 위한 파생 레이아웃 좌표다.

## TS-009.4 좌표 모델

### 리프 노드

atomic Event 또는 현재 LOD에서 실제 위치 최적화의 대상이 되는 리프 표현은 다음 좌표를 가진다.

```ts
type LatentPosition = {
  x: number;
  y: number;
  z: number;
};
```

### 축의 의미

- `y`: chronology 또는 structural order. 각 노드에는 허용 범위 `[yMin, yMax]`가 존재하며 그 범위 안에서만 최적화할 수 있다.
- `x`: 의미가 없는 파생 배치축. 제한 없이 최적화할 수 있다.
- `z`: 의미가 없는 추가 파생 배치축. 제한 없이 최적화할 수 있으나 불필요한 깊이 사용에는 비용을 부과한다.

`x`와 `z`가 unrestricted라는 것은 hard bound가 없다는 뜻이다. 안정적인 compact layout을 위해 목적함수에는 원점 또는 local cluster plane으로부터의 거리 비용을 둘 수 있다.

### Y hard constraint

모든 배치 단계에서 다음 불변조건을 유지한다.

```text
yMin_i <= y_i <= yMax_i
```

force integration 후 범위를 벗어난 `y`는 projection 전에 clamp하거나 constraint solver에서 직접 제한한다. chronology가 정확한 노드는 `yMin == yMax`로 고정할 수 있다.

`z` 변화가 `y`의 의미나 허용 범위를 변경해서는 안 된다.

## TS-009.5 카메라와 투영

탐색은 **Y축 yaw 회전만** 허용한다. pitch와 roll은 허용하지 않는다. 따라서 화면의 세로축은 어떤 탐색 각도에서도 원래 `y`와 동일하다.

초기 구현은 orthographic projection을 사용한다.

Y축을 기준으로 `theta`만큼 회전할 때 리프 노드의 화면 좌표는 다음과 같다.

```text
screenX = x * cos(theta) + z * sin(theta)
screenY = y
```

깊이값이 렌더링 순서에 필요할 경우 회전된 depth를 별도로 계산할 수 있다.

```text
viewDepth = -x * sin(theta) + z * cos(theta)
```

단, `viewDepth`는 2D geometry의 의미를 바꾸지 않는다. 초기 구현에서는 기존 렌더링 순서를 유지할 수 있으며 depth sorting은 별도 검증 후 도입한다.

### canonical view

`theta = 0`을 canonical view로 정의한다.

```text
screenX = x
screenY = y
```

따라서 canonical view는 z를 화면 위치에 반영하지 않는다. z는 회전 탐색을 시작했을 때 드러나는 잠재 자유도다.

## TS-009.6 렌더링 경계

3D 좌표를 이해해야 하는 계층은 layout과 projection까지다. JointJS graph에는 투영 완료된 2D geometry를 전달한다.

```text
Publication projection
  -> semantic / temporal constraints
  -> latent leaf layout (x, y, z)
  -> yaw projection (x, y, z, theta -> x', y')
  -> existing 2D derived geometry
       -> deepest-first Composite regions
       -> Relation endpoints/routes
       -> labels / semantic zoom
  -> JointJS rendering
```

JointJS element, link, region path는 3D 좌표를 직접 소유하거나 해석할 필요가 없다.

회전 중 한 프레임의 렌더링은 기존 2D graph가 새로운 leaf `(x', y')` 집합을 받은 것과 동일하게 취급한다.

## TS-009.7 Composite region과 중첩 containment

Composite Event와 Process region은 3D geometry를 갖지 않는다. **현재 투영된 2D 리프 좌표로부터 매 프레임 파생한다.**

TS-006.13의 y-sweep envelope 규칙을 그대로 사용한다.

1. 리프 `(x, y, z)`를 현재 `theta`에서 `(x', y)`로 투영한다.
2. 가장 깊은 Composite Event의 direct child point bounds와 child region을 계산한다.
3. y breakpoint마다 좌우 envelope를 계산한다.
4. 좌우 chain을 연결하여 y-monotone polygon을 만든다.
5. padding, smoothing, fallback을 기존 규칙대로 적용한다.
6. 계산된 child region을 입력으로 parent region을 deepest-first로 계산한다.
7. 최상위 region까지 반복한다.

Y축 yaw에서는 `screenY = y`가 항상 성립하므로 노드의 세로 순서와 y constraint는 회전으로 변하지 않는다. 이것이 기존 y-monotone region 알고리즘을 그대로 재사용할 수 있는 핵심 불변조건이다.

컨테이너의 모양은 회전 중 변할 수 있다. 이는 3D 물체의 외곽선을 렌더링하는 것이 아니라 **현재 투영에서 해당 Composite Event의 구성원을 감싸는 2D 표현을 다시 계산하는 것**이므로 의도된 동작이다.

중첩 containment의 논리적 사실은 geometry에서 추론하지 않는다. geometry는 이미 알려진 containment tree를 표현할 뿐이다.

## TS-009.8 Relation routing

Relation 역시 3D curve를 만들지 않는다.

1. 현재 각도에서 source와 target leaf를 2D로 투영한다.
2. Composite region을 갱신한다.
3. 투영된 node/region boundary에서 endpoint를 계산한다.
4. 기존 2D router를 사용해 Relation path를 계산한다.

따라서 z축의 효과는 Relation을 직접 깊이 방향으로 휘는 것이 아니라, **회전했을 때 endpoint와 장애물의 2D 배치를 변화시켜 기존 router가 더 읽기 쉬운 경로를 만들 여지를 주는 것**이다.

초기 구현은 TS-006의 metro router와 boundary connection point 규칙을 유지한다.

## TS-009.9 잠재 3D 레이아웃 최적화

### 기본 해석

기존 2D constrained force layout을 `(x, y)`에서 `(x, y, z)`로 확장한다.

- `y`: 제한된 자유도
- `x`: 자유도
- `z`: 추가 자유도

초기 위치는 기존 2D 결과를 lift하여 만들 수 있다.

```text
x = existingX
y = existingY
z = 0
```

이 상태에서 3D 최적화를 시작하면 기존 배치를 안정적인 baseline으로 사용할 수 있다.

### 목적함수

최적화는 단순히 3D 공간에서 node 간 거리를 예쁘게 만드는 것을 목표로 해서는 안 된다. 최종 사용자가 보는 것은 항상 2D projection이므로 **여러 yaw projection에서의 시각적 복잡도**가 목적함수에 포함되어야 한다.

개념적 목적함수는 다음과 같다.

```text
E =
    wEdge       * E_edge
  + wRepulsion  * E_repulsion
  + wCluster    * E_cluster
  + wY          * E_yConstraint
  + wDepth      * E_zRegularization
  + wProjection * E_projection
```

`E_yConstraint`는 가능하면 penalty가 아니라 hard constraint로 구현한다.

### projection complexity

레이아웃 계산 시 실제 사용 가능한 yaw 범위에서 여러 각도를 샘플링한다.

예시:

```text
Theta = [-60, -45, -30, -15, 0, 15, 30, 45, 60] degrees
```

각 `theta`에서 리프를 2D로 투영하고 다음 비용을 측정할 수 있다.

- node-node overlap
- node-label overlap
- edge crossing
- edge-node intersection
- 과도하게 짧거나 긴 Relation path
- 관련 없는 Composite region의 과도한 overlap
- region 내부의 불필요한 빈 공간
- 같은 cluster 구성원의 과도한 분산

개념적으로:

```text
E_projection = sum(theta in Theta) complexity(project(layout, theta))
```

모든 항목을 첫 구현에서 동시에 구현할 필요는 없다. 우선순위는 node overlap, edge crossing, edge-node intersection이며 실제 성능을 측정해 항목을 추가한다.

### multi-view 최적화의 이유

한 시점에서만 최적화하면 canonical view에서는 깨끗하지만 조금만 회전하면 심하게 겹치는 배치가 생성될 수 있다. 레이아웃의 품질 기준은 3D geometry 자체가 아니라 사용자가 탐색할 yaw 범위에서의 projection readability다.

## TS-009.10 Z축 사용 규칙

z는 자유롭지만 희소하게 사용한다. 기본 상태는 가능한 한 `z ~= 0`인 평면 배치다.

다음과 같은 경우에만 z 분리를 사용하는 것을 선호한다.

- 2D 제약만으로 피하기 어려운 Relation crossing
- 밀집 cluster의 node overlap
- Relation과 unrelated node/region의 반복적인 충돌
- 서로 다른 관계 묶음을 회전 탐색으로 분리할 가치가 있는 경우

무한히 멀리 노드를 보내는 퇴행 해를 막기 위해 depth regularization을 둔다.

예:

```text
E_zRegularization = sum(z_i^2)
```

또는 cluster별 local depth center를 사용한다.

이 규칙의 목표는 결과를 3D scatter cloud로 만드는 것이 아니라 **기본적으로 평평하고, 복잡한 부분에서만 필요한 만큼 층이 갈라지는 배치**로 만드는 것이다.

## TS-009.11 상호작용

### 허용 탐색

- horizontal drag: Y축 yaw 회전
- wheel / pinch: 기존 zoom
- pan: 기존 viewport pan
- focus/select: 기존 2D hit testing

pitch와 roll은 제공하지 않는다. 사용자가 회전하더라도 화면의 위/아래가 chronology 또는 structural order라는 의미는 항상 유지되어야 한다.

### 회전 범위

초기값은 제한된 yaw 범위를 권장한다. 예를 들어 `[-60deg, +60deg]`를 실험 기준으로 사용한다. 정확한 범위는 UX 검증 후 확정한다.

360도 회전은 기술적으로 가능하지만 다음 이유로 기본 목표가 아니다.

- 뒤집힌 관계 탐색의 추가 가치가 작을 수 있음
- canonical orientation을 잃기 쉬움
- label과 route 재계산 비용 증가

### canonical 복귀

사용자는 언제든 `theta = 0`으로 즉시 또는 짧은 transition을 통해 돌아갈 수 있어야 한다. 공유 URL에서 yaw를 보존할지 여부는 실제 탐색 가치가 확인된 후 결정한다.

## TS-009.12 프레임 갱신

yaw가 변하는 동안 최소 갱신 단위는 다음과 같다.

```text
latent positions: unchanged
       ↓
project leaf positions
       ↓
update leaf 2D positions
       ↓
recompute nested regions deepest-first
       ↓
recompute relation endpoints/routes
       ↓
update labels if required
       ↓
render
```

force simulation을 회전 프레임마다 다시 실행하지 않는다. 회전은 고정된 latent layout을 관찰하는 행위다.

성능이 부족하면 다음 순서로 최적화한다.

1. projection은 단순 행렬 계산으로 처리한다.
2. region dependency tree를 이용해 실제 geometry가 변한 branch만 갱신한다.
3. 회전 중 Relation routing을 저비용 근사로 표시하고 idle/end에서 정밀 route를 계산할 수 있다.
4. label collision 계산을 throttle할 수 있다.
5. semantic zoom으로 화면 밖 또는 낮은 LOD geometry의 갱신을 생략한다.

단, 최적화 때문에 containment가 잘못 표시되거나 node가 region 밖으로 보이는 프레임을 장시간 유지해서는 안 된다.

## TS-009.13 데이터와 Publication 경계

latent `(x, y, z)`는 authored Event data가 아니다. Publication Worker가 생성하는 revision별 graph artifact 또는 클라이언트에서 재현 가능한 derived layout이다.

artifact에 저장하는 경우 최소한 다음을 함께 기록한다.

```ts
type LatentLayoutArtifact = {
  servedRevision: string;
  algorithmVersion: string;
  seed: string | number;
  parameters: Record<string, number | string | boolean>;
  nodes: Record<string, {
    x: number;
    y: number;
    z: number;
    yMin: number;
    yMax: number;
  }>;
};
```

`z`를 Canon의 사실, chronology, uncertainty 또는 importance로 해석해서는 안 된다.

## TS-009.14 결정성과 재현성

force-directed optimization에는 명시적 seed를 사용한다.

동일한 다음 입력에서는 같은 latent layout을 생성해야 한다.

- Publication Revision
- graph scope
- algorithm version
- seed
- layout parameters
- semantic zoom artifact level

floating-point 또는 worker scheduling 차이로 완전한 bitwise determinism이 어렵다면 허용 오차 내 geometry determinism을 테스트하고 artifact를 Publication 시점에 고정한다.

## TS-009.15 단계적 구현

### Phase A — projection spike

목표는 기존 renderer를 건드리지 않고 설계의 구조적 가능성을 검증하는 것이다.

1. 기존 2D leaf layout에 `z = 0`을 추가한다.
2. 일부 test fixture의 z를 수동으로 변경한다.
3. yaw slider 또는 horizontal drag를 추가한다.
4. leaf만 투영한다.
5. 기존 Composite region과 Relation routing을 매 projection에서 재계산한다.
6. nested y-monotone region이 모든 yaw에서 올바르게 child를 감싸는지 확인한다.

이 단계에서는 3D force optimization을 구현하지 않는다.

### Phase B — 3D constrained force

- x/z force integration
- y range constraint
- z regularization
- 기존 2D layout에서 `z = 0` lift
- deterministic seed

### Phase C — projection-aware optimization

- yaw sample set 정의
- node overlap cost
- edge crossing cost
- edge-node intersection cost
- 성능 측정과 weight tuning

### Phase D — interaction/performance

- drag yaw UX
- canonical reset
- incremental region recomputation
- route/label throttling
- mobile frame budget 검증

## TS-009.16 검증 기준

### 기능 불변조건

- 모든 leaf의 `y`는 항상 허용 범위 안에 있다.
- yaw 변화는 어떤 leaf의 `screenY`도 변경하지 않는다.
- 모든 Composite region은 현재 projection에서 자신의 direct child geometry를 포함한다.
- nested region은 deepest-first dependency를 지킨다.
- containment 사실은 geometry 변화로 변경되지 않는다.
- Relation은 현재 projection의 올바른 source/target을 연결한다.
- `theta = 0`, `z = 0` fixture는 기존 2D 결과와 허용 오차 내에서 동일하다.

### 시각 품질 지표

동일 fixture의 기존 2D baseline과 비교하여 다음을 측정한다.

- 평균/최악 yaw에서 node overlap count
- 평균/최악 yaw에서 edge crossing count
- edge-node intersection count
- region overlap 및 region area inflation
- canonical view의 품질 회귀

3D latent layout은 단순히 특정 각도에서 좋아지는 것이 아니라 지원 yaw 범위 전체에서 aggregate complexity를 낮춰야 한다.

### 성능 지표

- projection 자체는 node 수에 대해 O(N)이어야 한다.
- yaw interaction 중 force simulation을 재실행하지 않는다.
- region과 route 재계산 비용을 별도로 계측한다.
- 목표 frame budget은 실제 target device와 graph 규모 fixture를 정한 뒤 TS-008의 성능 기준에 연결한다.

## TS-009.17 실패 조건과 롤백

다음 중 하나가 지속적으로 발생하면 latent 3D를 기본 탐색 모델로 채택하지 않는다.

- 여러 yaw를 고려해도 2D baseline 대비 crossing/overlap 감소가 미미함
- z 분리로 인해 사용자가 관계를 더 이해하기 어려워짐
- 회전 중 region morphing이 containment의 의미가 바뀌는 것처럼 보임
- nested region과 route 재계산이 target device의 interaction budget을 만족하지 못함
- canonical view의 안정성이 크게 훼손됨

이 경우 TS-006의 기존 2D constrained layout을 유지하고 3D layout은 실험 기능 또는 특정 고복잡도 scope에만 적용할 수 있다.

## TS-009.18 미결정 사항

다음 값은 구현 spike와 fixture 측정 전에는 확정하지 않는다.

- 기본 yaw 최대각
- yaw sample 수와 분포
- force 및 projection complexity weight
- z regularization 함수와 강도
- depth sorting 사용 여부
- yaw의 URL 공유 상태 포함 여부
- rotation 중 label/route 정밀도 단계
- latent layout을 Publication Worker에서 미리 계산할지 client에서 계산할지의 최종 경계

이 값들은 제품 의미가 아니라 알고리즘·성능 파라미터이므로 benchmark와 사용성 검증으로 결정한다.

## TS-009.19 구현 시 금지되는 오해

- “3D 레이아웃”을 이유로 기존 JointJS renderer를 3D renderer로 교체하지 않는다.
- Composite Event에 임의의 3D hull 또는 volume을 만들지 않는다.
- parent container 자체를 force particle로 취급하지 않는다. region은 projected child geometry에서 파생한다.
- 회전할 때 latent node layout을 다시 최적화하지 않는다.
- z를 시간, 중요도, Canon 우열 등 의미축으로 재해석하지 않는다.
- perspective 때문에 y 위치가 변하는 projection을 초기 구현에 넣지 않는다.
- 한 각도의 미관만 최적화하고 다른 지원 각도의 가독성을 무시하지 않는다.

## TS-009.20 요약 계약

이 설계의 최소 계약은 다음 한 문장으로 요약한다.

> Atropos는 Y 범위가 제한되고 X/Z가 자유로운 리프 노드의 잠재 3D 레이아웃을 유지하며, Y축 yaw로 리프 좌표만 orthographic 2D 투영한 뒤 중첩 y-monotone region, Relation, label을 기존 2D 파이프라인에서 다시 파생해 렌더링한다.
