---
id: TS-006
title: Publication과 확장 가능한 탐색 읽기
status: accepted
layer: technical-specifications
---

# TS-006 — Publication과 확장 가능한 탐색 읽기

## TS-006.1 경계와 현재 상태

Atropos는 공개 allowlist Publication만 읽고 canonical DB/private provenance에 접근하지 않는다. Worker는 World Revision으로부터 immutable artifacts를 만들고 digest를 검증한 완전한 manifest의 served pointer를 원자적으로 교체한다. 늦게 끝난 worker가 pointer를 역행시키지 못한다. current/target/served 차이는 노출한다.

현재 v4는 spatial bands·bounded payload·on-demand Event detail·LRU cache가 있지만 cold query가 World 규모에 의존한다. 실제 경로와 측정 한계는 [조사](../evidence/ip011/reconstruction.md)를 참조한다. 기존 100/1k/10k 회귀와 spatial 100k 결과를 end-to-end scalability 증명으로 확대 해석하지 않는다.

## TS-006.2 read 계약

입력은 World/revision vector, active Collection IDs, viewport/time range, scale, 선택 Event, bounded neighborhood depth 및 node/edge/bytes/read budget이다. pagination·continuation은 동일 query digest와 Revision에 고정한다. 응답에는 하나의 World/Event node, matched memberships, edges, Composite child completeness, Collection overlays, source revision/algorithm, truncated/continuation/diagnostics를 포함한다.

active Collections의 합집합으로 Event를 선택하되 node를 복제하지 않는다. 모두 OFF이면 빈 선택을 보여주며 무제한 World scan으로 해석하지 않는다. World 검색·직접 Event URL·명시적 bounded neighborhood는 membership 없는 Event에도 접근 가능하다. 선택 이웃이 Collection 밖에 있으면 그 이유를 표시한다. temporal/contains 진실은 hidden endpoint나 Collection OFF로 바뀌지 않는다.

## TS-006.3 target data path

Worker가 World-level temporal/contains/identity 결과와 안정된 layout을 생성한다. 공개 store에는 bounded root catalog, paged Collection summaries/membership posting lists, temporal/spatial/scale shards, adjacency pages, Event detail을 둔다. shard manifest도 계층화하여 root가 World 전체 문서 목록을 실어 나르지 않게 한다. 큰 Collection과 고차수 Event도 paging/budget을 적용한다. row/byte/object-read 상한을 넘으면 continuation 또는 명시적 partial을 반환한다.

동일 Revision의 불완전한 rehearsal root/index는 `v5/staging/{completeness}/`에 append-only로 보관하고, 모든 읽기 shard를 검증한 serving root/index는 별도 `v5/complete/`에 둔다. `current.json`은 최종 root key와 digest를 명시하고 `complete`만 가리킨다. 단계별 index 확대를 같은 immutable key에 덮어쓰거나 staging root의 completeness 문자열만 바꿔 승격하지 않는다.

Atropos query는 catalog → 필요한 index pages → intersecting shards → membership intersection/union → bounded neighbors 순으로 선택하며 전체 World/Collection materialization을 금지한다. storage는 기존 Publication store와 typed index seam을 우선 사용한다. 별도 graph DB/search service는 측정된 필요 없이 추가하지 않는다. offline full rebuild 비용은 별도 budget과 측정 대상이며 interactive path와 분리한다.

## TS-006.4 cache와 incremental UX

immutable cache key는 World/revision/algorithm/shard/filter를 포함한다. pointer는 revalidation하며 서로 다른 Revision fragment를 섞지 않는다. 요청 coalescing·byte 제한·eviction·negative error TTL을 명시한다. pan/zoom 시 유지 범위의 node/edge를 keyed delta로 보존하고 bounded overscan을 사용한다. stale request는 취소하거나 sequence로 무시한다. 매 gesture마다 전체 layout·React tree를 재구축하지 않는다. 줌은 준비된 scale projection을 선택하며 사실을 재계산하지 않는다.

## TS-006.5 discovery

paged inverted membership, 시간 범위·spatial/scale summaries, bounded adjacency를 이용해 후보를 생성한다. 현재 visible Event overlap, active Collection overlap, time proximity와 이웃 연결로 설명 가능한 relevance를 파생한다. 모든 Collection을 요청마다 순회하지 않는다. 후보 수·posting read·response budget과 continuation을 둔다. 시간 정보가 없거나 candidate가 없을 때 명시적으로 처리한다. ranking formula와 가중치는 D 단계의 UX 실험으로 정하며 canonical importance/recommended_with를 추가하지 않는다. 결과는 권위 순위가 아니다.

## TS-006.6 Narrative와 navigation

Event URL은 World/Event identity를 사용하고 Collection은 선택 context일 뿐 본문 owner가 아니다. drawer/full-height direct URL/history/close-to-focus를 유지한다. 하나의 Event Narrative 본문과 펼침 가능한 주석/인용을 표시한다. Collection 소개는 별도 owner의 Narrative다. Collection과 Composite의 비슷한 container 표현은 label·legend·선택 행동으로 구별한다. 모바일 touch·접근성·pan continuity를 유지한다.

## TS-006.7 병목 측정과 exit gates

단계별로 DB query 수/rows/history replay, projection CPU·heap, object reads/bytes/parse time, API p50/p95·payload, layout CPU, React commit/SVG node 수, main-thread long task와 gesture frame을 기록한다. authoring query, publication build, cold read, warm read, eviction/revision change, toggle, pan/zoom, dense neighborhood를 분리한다. 프로파일과 synthetic fixture 크기·graph shape·hardware/network·cache 상태를 같이 기록한다.

1k/10k/100k Event와 sparse/dense/overlap/large Collection fixtures에서 동일 local query를 유지한 채 먼 Event와 Collection만 늘린다. correctness 외에 cold path rows/bytes/object reads가 전체 World N에 선형 증가하지 않는지 확인한다. 초기 목표는 기존 viewport payload 1 MiB 이하·object reads 256 이하를 유지하되, index reads를 포함해 총량으로 측정한다. 이 수치는 현재 구현 일부의 상한이며 실측 달성 주장이나 충분한 latency 기준이 아니다.

A1에서 고정 모바일·네트워크 profile과 허용 p95/interaction budget을 측정 근거로 명시하고 A4 시작 전에 고정한다. [A1 실행 근거와 고정 budget](../evidence/ip011/a1-execution.md)을 따른다. 임의 성능 수치를 완료 증거로 만들지 않는다. A4 종료는 합의된 latency/frame gate와 bounded cold cost 둘 다 통과해야 한다. budget 초과·cold cache·전체 World 증가에서 실패하면 미완료다.

## TS-006.8 무결성과 복구

private origin·policy audit·tokens는 공개하지 않는다. Markdown/raw HTML은 sanitize한다. revision/digest mismatch는 fail closed, 일부 shard 실패는 명시적 partial이며 성공으로 가장하지 않는다. layout 변경은 algorithm version/path 변경으로 제공하고 기존 immutable Revision을 덮어쓰지 않는다. server build rollback과 canonical migration rollback을 구분한다. 새 manifest 검증 실패 시 이전 served pointer를 유지한다.

이전 세부 조항은 기준 commit `05ebf3b27794e60d734a885cc428a30104118896`의 Git 이력에 보존한다. 같은 문서 ID의 이번 개정 본문이 현재 목표 계약이며 삭제된 Canon-specific 조항은 실행 요구가 아니다. 변경하지 않은 보안·transaction·portability 규칙은 TS-001/003/007/008을 참조한다.
