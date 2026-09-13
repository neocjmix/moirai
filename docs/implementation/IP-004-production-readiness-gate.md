---
id: IP-004
title: Production Readiness Gate before M5
status: accepted
layer: implementation-plan
---

# IP-004 — Production Readiness Gate before M5

## 1. 목적

M4 계열의 graph/exploration 구현은 기능적으로 충분히 진전했지만, 첫 제품이 M5의 lifecycle·portability·operations 단계로 넘어가기 전에 세 가지 production readiness 문제가 남아 있다.

이 계획은 새 제품 기능 milestone이 아니라 **M5 진입 전 필수 gate**다. M5의 의미와 범위는 [IP-001 §IP-001.9](IP-001-first-product-plan.md#ip-0019-milestone-5--생명주기이동성출시-품질) 및 [IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위)이 계속 소유한다.

M5는 이 계획의 exit criteria가 충족되고 사용자가 별도로 활성화하기 전까지 비활성 상태를 유지한다.

## 2. 현재 기준선과 판단

- M4.7 viewport continuity와 graph exploration 안정화는 완료된 기준선으로 취급한다.
- Graph view는 현재 production-readiness 작업의 주된 불안정 영역으로 보지 않는다. 회귀 방지와 필요한 최소 수정만 수행한다.
- Island와 Event view는 여전히 production UI 수준에 미달하며 안정화가 필요하다.
- 특히 Island는 사용자 제품면보다 운영/관측면 성격이 강하다. 내부 진단·운영 정보는 사용자 탐색의 primary information architecture가 되어서는 안 된다.
- Clotho의 자연어 작성이 실제 canonical abstraction을 어떻게 형성하고, 기존 지식을 점진적으로 refinement하며, 그 결과가 Atropos에 자연스럽게 노출되는지 end-to-end로 검증해야 한다.
- 대량 자료에서 실제 Atropos query latency, scope size, cache hit/miss, rebuild/invalidation 비용을 측정한 뒤 query/cache/materialization 전략을 확정해야 한다. 캐시 계층 자체를 선행 가정하지 않는다.

## 3. 범위

Production Readiness Gate는 세 track으로 구성한다.

### PR-A — Atropos product surface

목표: Graph의 현재 안정성을 보존하면서 Island와 Event view를 첫 제품의 사용자-facing surface 수준으로 끌어올린다.

범위:

- Island의 information architecture를 제품 탐색 중심으로 재정의한다.
- revision, ingestion, diagnostic, low-level query state 등 운영자용 정보가 primary UI를 지배하지 않도록 격리하거나 secondary surface로 이동한다.
- Island loading/empty/error/partial-result 상태를 제품 문맥에 맞게 안정화한다.
- Event view의 narrative, time, Canon membership, relation/context, evidence/source 표현을 안정화한다.
- Event route 및 selection/inspector 왕복 시 상태 소실, 레이아웃 점프, stale selection, inconsistent loading을 제거한다.
- 기존 Graph viewport, layout, composite geometry, pan/zoom/selection behavior는 regression baseline으로 유지한다.

명시적 제외:

- Graph renderer 재작성
- 새로운 ontology 도입
- M5 lifecycle UI
- 운영 dashboard 자체의 확장

PR-A 종료조건:

1. Island가 기본적으로 사용자에게 “무엇을 탐색할 수 있는가”를 설명하며 내부 운영상태가 주 정보 위계를 차지하지 않는다.
2. Island의 loading/empty/error/partial-result 상태가 deterministic하고 layout jump 없이 안정적이다.
3. Event view에서 Narrative, 시간, membership, 관계, evidence가 현재 accepted semantics와 일치한다.
4. graph → event → graph, island → result → event → back 왕복에서 route/selection/query context가 예측 가능하게 복원된다.
5. mobile Playwright 및 public production smoke에서 Graph baseline 회귀가 없다.
6. 사용자가 내부 `/__status`, raw diagnostic, revision metadata를 이해하지 않아도 핵심 탐색 흐름을 사용할 수 있다.

### PR-B — Clotho semantic E2E and progressive refinement

목표: 자연어 입력이 Clotho를 통해 적절한 canonical abstraction으로 변환되고, 여러 번의 추가 입력이 중복/붕괴 없이 동일 World 지식을 점진적으로 정교화하며, 결과가 Atropos에서 조회되는지 검증한다.

검증 흐름:

```text
natural-language intent
  -> Clotho context discovery
  -> change planning / validation
  -> canonical commit
  -> World Revision
  -> Publication rebuild / served Revision
  -> Atropos Island / Event / Graph read
  -> later natural-language refinement
  -> same identities + richer detail where semantically appropriate
```

필수 시나리오:

1. **coarse creation**
   - 간단한 자연어 설명으로 World에 사건/관계/서사를 생성한다.
   - 생성 결과가 overly-fragmented event proliferation이나 arbitrary Canon duplication 없이 표현되는지 확인한다.

2. **progressive detail**
   - 동일 주제에 날짜/원인/참여자/관계/서사 같은 세부 정보를 후속 입력으로 추가한다.
   - 기존 identity를 적절히 재사용하고, update가 필요한 것과 새로운 Event/Relation이 필요한 것을 구분한다.

3. **ambiguity and conflict**
   - 기존 Canon과 다른 해석 또는 불확실한 정보를 추가한다.
   - accepted Canon/Event/Relation semantics를 침범하지 않고 필요한 distinction을 보존한다.

4. **public readback**
   - 각 commit 뒤 Publication이 갱신되고 Atropos의 Island/Event/Graph에서 동일 의미를 탐색할 수 있다.

5. **session independence**
   - 새 LLM session이 World ID와 공개/허용된 read tools만으로 충분한 context를 재발견해 다음 refinement를 수행할 수 있다.

PR-B 종료조건:

1. 최소 3단계 이상의 progressive refinement fixture가 자동화 또는 재현 가능한 scripted acceptance로 존재한다.
2. 후속 detail 입력이 의미상 동일한 entity를 불필요하게 duplicate하지 않는다.
3. 새 Event/Relation이 필요한 경우에는 기존 identity를 억지로 mutation하지 않고 accepted semantics에 맞게 분리한다.
4. validation/commit conflict 시 최신 context를 다시 읽고 재계획하여 의미를 보존한다.
5. 각 단계의 resulting Revision이 Publication 및 Atropos public surface까지 도달한다.
6. Atropos에서 coarse state와 refined state의 차이를 사람이 이해 가능한 형태로 확인할 수 있다.
7. 테스트가 단순 HTTP 200/row existence가 아니라 canonical identity, membership, relation, narrative와 public readback을 검증한다.

### PR-C — Scale, query latency and cache strategy

목표: 실제 Publication/query shape를 기준으로 대량 자료에서 성능 병목을 측정하고, 필요한 query/index/cache/materialization 전략을 구현·검증한다.

원칙:

- cache provider나 Redis 같은 특정 구현을 선행 결론으로 두지 않는다.
- synthetic workload는 Atropos의 실제 Island/Event/Graph read path와 동일한 query shape를 사용한다.
- canonical PostgreSQL은 durable source이고 Publication/cache는 rebuildable하다는 기존 원칙을 유지한다.
- future multitenancy/private publication 안전장치는 [RM-001](../roadmap/RM-001-personalization-multitenancy.md)을 검토한다.

성능 단계:

1. representative fixture를 준비한다. 최소 10^2, 10^3, 10^4 Event scale을 포함하고 가능하면 기존 100k fixture와 연결한다.
2. 각 scale에서 Island initial read, Event detail, graph scoped read, common navigation query의 latency와 payload size를 측정한다.
3. server query, Publication composition, serialization, network payload, browser parse/render를 분리해 병목을 식별한다.
4. index/query shape 수정만으로 충분한지 먼저 검증한다.
5. 필요할 경우 cache/materialized projection을 최소 경계에 추가한다.
6. cache key는 최소한 World/Revision/query scope/version을 안전하게 반영하고 stale cross-revision 결과를 허용하지 않는다.
7. invalidation은 canonical write에 직접 종속된 ad-hoc purge보다 revision-addressed artifact 또는 reproducible rebuild를 우선한다.

초기 acceptance budget은 구현자가 현재 production baseline을 측정해 문서화한 뒤 합리적인 수치로 고정한다. 측정 이전에 임의의 p95 목표를 product requirement처럼 선언하지 않는다.

PR-C 종료조건:

1. 대표 workload와 benchmark procedure가 repository에 재현 가능하게 존재한다.
2. scale별 latency/payload/build cost baseline이 evidence로 기록된다.
3. 병목 위치와 선택한 최적화가 측정치로 연결된다.
4. 반복 query가 불필요한 전체 Publication recomposition 또는 전체 dataset browser load를 일으키지 않는다.
5. cache/materialization이 도입된 경우 Revision 변경 후 stale result가 노출되지 않는 자동 test가 존재한다.
6. 100k급 fixture가 사용 가능한 path에서는 전체 Event를 browser memory에 적재하지 않는 기존 graph budget을 유지한다.
7. production-like synthetic environment에서 Island/Event/Graph의 핵심 read path가 정의된 acceptance budget을 통과한다.

## 4. 실행 순서

PR-A와 PR-B를 먼저 병행할 수 있다. PR-C의 최종 workload와 optimization 판단은 PR-B가 만든 실제 semantic/publication path와 PR-A의 실제 UI query shape를 재사용해야 한다.

권장 slice 순서:

- PR-0: baseline freeze / acceptance harness
- PR-A1: Island product surface
- PR-A2: Event view stability and navigation
- PR-B1: coarse natural-language creation E2E
- PR-B2: progressive refinement / ambiguity fixture
- PR-B3: session-independent read-plan-commit-readback acceptance
- PR-C1: representative scale fixtures + instrumentation
- PR-C2: query/index optimization
- PR-C3: cache/materialization only if measured need remains
- PR-Z: full production-readiness acceptance and documentation closeout

PR-A와 PR-B의 독립적인 slice는 병렬 수행 가능하지만, 동일 file/runtime surface 충돌이 예상되면 작은 PR로 직렬화한다.

## 5. PR-0 baseline freeze

Work는 구현 전에 다음을 직접 확인하고 evidence에 기록한다.

- remote `main` HEAD
- open PR 및 최신 CI 상태
- `CURRENT.md`의 active milestone
- public Atropos `/__status` build SHA
- Graph / Island / Event의 현재 public behavior
- Clotho read/validate/commit availability
- current synthetic World와 served Revision
- 기존 100k fixture, graph budget, query contract의 위치와 재사용 가능성

Graph view는 baseline screenshot/interaction regression 대상으로 잡고, 불필요한 재설계 대상으로 삼지 않는다.

## 6. 승인 경계

이 계획은 다음을 미리 승인한다.

- Island/Event UI stabilization
- synthetic/public test fixture 추가와 reset 가능한 synthetic data 사용
- query/index 변경
- rebuildable Publication/cache artifact 변경
- benchmark instrumentation
- CI/E2E/Playwright test 추가

다음은 별도 사용자 승인이 필요하다.

- accepted ontology 또는 Canon/Event/Relation 의미 변경
- irreversible canonical production data 삭제/변환
- 새 유료 infrastructure/provider 도입
- public/private access policy 변경
- M5 활성화

## 7. 전체 종료조건 — M5 entry gate

다음이 모두 충족되어야 한다.

1. **Product surface:** Graph baseline을 유지하고 Island/Event가 첫 제품 사용자-facing surface 수준으로 안정화됐다.
2. **Semantic E2E:** 자연어 coarse input에서 시작해 여러 차례 detail refinement 후에도 canonical identity와 accepted semantics를 보존하고 Atropos에서 결과를 탐색할 수 있다.
3. **Scale:** 실제 query path의 scale benchmark가 존재하고, 정의된 acceptance budget에서 핵심 read path가 통과한다.
4. **Cache correctness:** 도입한 cache/materialization은 Revision consistency와 deterministic rebuild를 보존한다.
5. **Public verification:** CI, production deployment, `/__status`, synthetic smoke, mobile E2E evidence가 한 packet으로 연결된다.
6. **No semantic drift:** CON/BR/TS/IP-003 accepted semantics와 모순되는 convenience shortcut이 없다.
7. **M5 remains inactive:** 이 gate 완료 사실은 M5 자동 시작을 의미하지 않는다. 사용자가 별도로 M5를 활성화해야 한다.

## 8. Work handoff rule

Work는 별도 재계획 없이 이 문서의 PR-0부터 진행할 수 있다. 각 slice마다 AGENTS.md의 실행 루프를 따른다.

Work는 다음 이유로 중단하지 않는다.

- ordinary implementation/test failure
- benchmark가 예상보다 느림
- UI regression 발견
- cache가 필요 없다는 측정 결과

대신 원인을 진단하고 같은 accepted 범위 안에서 수정한다.

반대로 accepted product semantics를 바꿔야만 다음 단계가 가능하거나, 새 provider/비용/security policy가 필요하면 해당 지점에서만 사용자 결정을 요청한다.
