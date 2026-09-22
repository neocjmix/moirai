---
id: IP-005
title: Graph reader consolidation before M5
status: complete
layer: implementation-plan
---

# IP-005 — Graph reader consolidation before M5

> IP-011 이후 실행 순서와 목표 domain 계약은 [IP-011](IP-011-architecture-realignment.md)을 따른다. 아래 기록의 Canon·Narrative·membership 전제는 당시 구현 이력이며 현재 목표 의미를 재정의하지 않는다. 완료 이력은 취소하지 않으며 미완료 backlog는 IP-011로 재분류한다.

## 1. 효력과 실행 상태

**구현·통합 검증·배포·공개 QA complete · M5 inactive.**

완료된 [IP-004](IP-004-production-readiness-gate.md)와 비활성 M5 사이의 독립 리팩터링이다.
IP-004의 미완료 track이나 M5 slice가 아니다. 2026-09-19 사용자의 구현 실행 지시에 따라
단계 2~7을 수행했고 [PR #98](https://github.com/neocjmix/moirai/pull/98)을 main
`6c30c7bbe8825957d4ad85b685137946d129df87`로 병합·배포했다. canonical write, schema migration,
Publication Store 정리 또는 M5 활성화는 수행하지 않았다. 종료 근거는
[IP-005 evidence](../evidence/ip-005-graph-reader-consolidation.md)에 고정한다.

2026-09-14 GitHub 재확인 기준 main은 `6f0ea8c6f6cfad883710caf683fcff6b552dfbf0`
([PR #96](https://github.com/neocjmix/moirai/pull/96))이다. IP-005 원격 branch/PR은 없었고,
인계 경로의 로컬 문서 branch는 같은 HEAD, clean working tree, stash 없음이었다.
이 기준선 이후 변경은 덮어쓰거나 되돌리지 않는다. 사라졌던 미push 초안은 산출물로 계산하지 않는다.

IP-004의 runtime `b90d06f4ab0e876102f05285d89aaa664765f2fc`, Revision 6 및
[기존 evidence](../evidence/ip-004-gate-status.md)는 과거 checkpoint다.
이번 문서 작업에서 Railway/public runtime/Clotho를 다시 검증한 것으로 주장하지 않는다.
[이전 handoff](IP-004-fresh-session-handoff.md)의 canonical refinement 지시를 재실행하지 않는다.

## 2. 규범 추적과 제품 결정

[IS-001](IS-001-agent-mobile-strategy.md), [IP-001](IP-001-first-product-plan.md),
[TS-006](../technical-specifications/TS-006-atropos-publication.md)을 따른다.
상위 의미는 [CON-002](../constitution/CON-002-system-boundaries.md),
[CON-003](../constitution/CON-003-world-truth.md),
[CON-005](../constitution/CON-005-publication-boundary.md),
[BR-003](../business-requirements/BR-003-atropos-publication.md),
[BR-004](../business-requirements/BR-004-world-expressiveness.md),
[BR-007](../business-requirements/BR-007-publication-lifecycle.md)를 보존한다.
JRN-003/004/005/007의 읽기·공유·해석 구분 능력은 페이지 통합으로 없애지 않는다.

- `/`는 `/graph`로 리디렉션한다. 독립 landing/World directory를 기본 화면으로 두지 않는다.
- Event 읽기는 **Graph Event drawer** 하나로 통합한다. peek/full은 동일 표면의 표시 상태다.
  독립 **Event reading page**는 제거하며 이 용어는 과거 구현/evidence 설명에만 남긴다.
- full 직접 URL은 SSR 읽기 entry이기도 하다. 별도 정보 구조·중복 읽기 구현을 만들지 않는다.
- World/Canon/Search/Subject 읽기·탐색은 Graph와 island/drawer로 이전한다.
  도메인 개념과 읽기 능력은 유지하며 미구현 비교 기능을 새로 구현하지 않는다.
- private/explore/settings는 현재 페이지·진입점·availability 그대로 남긴다. 기능을 채우거나 활성화하지 않는다.
- 구형 **UI URL** 하위호환은 필요 없다. alias/redirect shim 없이 404를 허용한다.
  `/` 리디렉션은 명시된 예외다. Publication format 호환·durable data 정책은 이 결정과 별개다.
- drawer/sheet 형태와 dialog의 접근성·모달 동작은 별개다. 이름을 이유로 접근성을 낮추지 않는다.

[IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위)의 lifecycle,
Revision diff, portability, governance/access, operations는 M5에 남긴다.
구형 UI alias 보존 문구만 이 계획의 URL 계약으로 대체하며 identity/tombstone 의미는 유지한다.
[RM-001](../roadmap/RM-001-personalization-multitenancy.md)은 경계 점검일 뿐
private Publication, ACL, Tenant, E2EE, 신규 telemetry 승인으로 해석하지 않는다.

## 3. URL·Revision·탐색 맥락 계약

목표 full URL: `/graph/events/{worldId}/{eventId}?revision=N&canon={canonId}`.
worldId/eventId는 World-owned Event identity이며 canon은 선택적 해석 맥락이다.
지정 Canon의 같은 World와 해당 Revision의 Event membership을 검증한다.
생략 시 첫 Canon을 default로 고르지 않고 membership 및 Canon별 Narrative·관계·시간을
구분해 읽는다. Canon별 Event 복제나 서로 다른 서술의 자동 병합을 하지 않는다.

### 실제 encoding과 정규화

기준선 코드 `src/lib/moirai-graph-source-query.ts`와 `packages/contracts/src/graph.ts`는
`mq`에 URLSearchParams로 인코딩한 JSON을 넣는다. `version: 1`, `query`, `focus` 구조이며
query의 target Time System, source set(World/Canon/served Revision vector), scope,
entity/relation/diagnostic filter와 budget을 보존한다. 아래 src 경로는 `apps/atropos-web/` 기준이다.

| 상태             | encoding 및 목표 계약                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 대상과 full 상태 | 위 path가 Event와 full 상태의 유일한 권위다. full URL에 중복 `gsEvent`/`gsStage`를 만들지 않는다.                                                                           |
| Revision         | 양의 safe integer `revision`. 명시하면 고정 artifact를 읽고 latest로 fallback하지 않는다.                                                                                   |
| 그래프 맥락      | 유효한 `mq` JSON을 유지한다. source 순서는 Canon 합성 위치에 영향을 주므로 정렬하지 않는다. 동일 source의 중복은 정규화하며 World별 Revision을 하나로 강제 합성하지 않는다. |
| island           | `readerTab=sources                                                                                                                                                          | entities | search | relations`, `readerFind`(최대 512자). 기본 sources/빈 검색은 공유 URL에서 생략 가능하다. |
| viewport         | `gsViewport=centerX,centerY,spanX,spanY`, 유한 수/양의 span 검증, 현재 6자리 소수 정규화 유지.                                                                              |
| peek             | `/graph?mq=...&gsEvent=...&gsStage=peek`; mq.focus는 World-scoped semantic reference, gsEvent는 renderer adapter의 표시 ID로 양방향 매핑한다.                               |
| closed           | `/graph?mq=...`; mq.focus는 null, gsEvent/gsStage 제거. 탐색 필터와 Revision vector는 유지한다.                                                                             |

현재 `event-reading-navigation.ts`의 allowlist와 상한(`mq` 65536,
`gsViewport` 256, `gsEvent` 4096, `gsStage` 16, `readerTab` 16, `readerFind` 512)을
안전한 경계로 재사용한다. canonical builder는 key 순서를 고정하고 기본값·중복 표시 상태를 제거한다.
hover/animation/local UI 상태, 임의 return URL, credential은 공유하지 않는다.
TS-006의 과거 개별 `queryVersion/sources/zoom/x/y` 표기를 별도 병행 grammar로 구현하지 않는다.

revision을 생략한 직접 진입은 유효한 mq의 해당 World pin이 있으면 그 pin을 사용한다.
둘 다 없으면 서버가 current를 한 번 resolve하고 served Revision을 bootstrap과 정규화된
공유 URL에 고정한다. client가 current를 재조회하지 않는다. 명시 revision과 mq pin이 충돌하면
명확한 invalid-context 오류로 처리하며 다른 source를 조용히 최신으로 이동시키지 않는다.
명시 path 대상이 mq.focus와 다르면 path 대상을 focus로 정규화하되 source/filter는 잃지 않는다.
유효하지 않은 mq나 canon membership을 default query/첫 Canon으로 덮어쓰지 않는다.

mq 없는 직접 진입도 핵심 SSR 읽기는 즉시 가능해야 한다. Graph 맥락은 대상 World의
고정 Revision과 명시 Canon 또는 동등하게 표시한 Event memberships로 구성한다.
Time System 선택이 필요한 경우 기존 선택 흐름을 사용하며 새 compatibility를 추론하지 않는다.
기존 필터 밖 Event도 선택과 bounded 주변 맥락을 별도로 유지하며 필터를 조용히 바꾸지 않는다.
호환되지 않거나 unplaced인 대상은 텍스트와 원인을 보존하고 가짜 좌표를 만들지 않는다.
내부 Event 링크는 실제 새 href를 가지며 revision 및 해당 대상에 유효한 Canon 맥락을 보존한다.
비member인 대상에 현재 canon을 붙이지 않는다. 다른 World는 그 World의 pin을 사용한다.

## 4. 상태 전이와 full → peek 포커싱

| 동작                   | URL/UI 결과                                                    | history                                 |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------- |
| Graph에서 Event 선택   | 같은 World/Revision의 선택, peek, mq.focus 및 gsEvent 일치     | 새 대상이면 push 1회; 같은 선택은 no-op |
| peek → full            | 동일 Event의 full path, query context 유지                     | push 1회                                |
| full → peek 축소       | `/graph`, 동일 Event 선택 유지, 가용 영역에 새 focus/적정 배율 | push 1회; 이후 정규화는 replace         |
| peek/full 닫기         | closed, 선택 해제, context 유지; full에서는 graph로 복귀       | push 1회; 이미 closed면 no-op           |
| back/forward           | 해당 entry의 path·stage·selection·query·viewport 복원          | push 금지, 복원 루프 금지               |
| reload/직접 주소 입력  | URL 우선 복원; full은 full SSR, peek는 같은 선택               | 필요 정규화만 replace                   |
| pan/zoom·서버 pin 확정 | 같은 entry의 viewport/pin 갱신                                 | replace; frame마다 entry 추가 금지      |

축소는 닫기나 이전 viewport 복원이 아니다. full이 화면을 가리는 동안에도 대상 identity와
해석 맥락을 유지한다. 축소 후 drawer/island/safe area를 제외한 **실제 가용 영역**에
Event와 필요한 neighbor/parent/child 맥락을 bounded query로 확보하고 적정 배율로 맞춘다.
기존 viewport 밖 선택 및 이전 viewport 없는 직접 진입도 검증한다.
레이아웃 측정·resize가 focus 재적용 진동을 만들지 않게 한 전이에 한 번 적용하며,
지연 응답은 selection + World/Revision/query 요청 키를 확인해 stale 결과를 버린다.
공간 표현 불가 시 unplaced/호환성 오류와 텍스트 맥락을 명시하며 다른 Event로 이동하지 않는다.

현재 URDR 기반 renderer/layout/pan/zoom, M4.7 viewport continuity·선택 retention과
PR #77 label hysteresis를 유지한다. renderer 재작성·JointJS 회귀·별도 복귀 버튼은 추가하지 않는다.
키보드 activation, modal 시 focus containment, 닫은 뒤 원래 trigger(없으면 Graph의 합리적
focus target)로 복귀, reduced motion과 모바일 읽기를 보존한다.

## 5. SSR 읽기와 실패 계약

full URL은 서버에서 Event title/summary, Narrative, parent/child, 관계·membership,
시간·출처와 내부 참조를 읽을 수 있는 HTML로 제공한다. hydration 후 동일 Graph Event drawer의
콘텐츠가 되며 no-JS에서 가려지거나 client fetch를 기다리지 않는다.
안전한 Markdown 변환, raw HTML/script URL/handler/위험 embed 차단과 locale/시간 precision을 유지한다.
full drawer 내부 링크는 실제 href여야 한다. SSR과 Graph는 같은 served Revision vector를 쓴다.
이것은 읽기·인용 계약이며 SEO 순위 개선을 보장하지 않는다.

| 경우                                         | 요구되는 결과                                                       |
| -------------------------------------------- | ------------------------------------------------------------------- |
| invalid ID / 없는 Event / invalid membership | 명확한 not-found/invalid-context; 임의 Event·Canon 대체 금지        |
| invalid revision/query                       | 안전한 입력 오류; 잘못된 값을 latest/default로 숨기지 않음          |
| unavailable Revision/artifact                | 해당 pin의 unavailable 상태; 다른 Revision으로 fallback 금지        |
| loading/error/retry                          | 현재 대상과 맥락을 유지하고 구분 가능한 상태 제공; retry는 같은 pin |
| partial source failure                       | 실패 source와 범위를 명시하고 다른 source pin 유지                  |
| 빠른 선택 변경                               | 오래된 응답이 새 drawer를 덮지 않음; focus/URL 불일치 없음          |

## 6. 실제 route/import inventory와 정리 경계

아래는 계획 당시 main `6f0ea8c`의 read-only inventory다. PR #98에서 대체 기능과 전체
import/call graph를 다시 확인한 뒤 구형 UI route와 전용 component를 제거했다.

| 현재 파일 (`apps/atropos-web/src/` 기준)                                    | 현재 역할 → 향후 처리                                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                                                              | Publication World directory → `/graph` redirect                                                                       |
| `app/worlds/[worldId]/page.tsx`                                             | World/Canon 목록 → Graph source/island 읽기                                                                           |
| `app/worlds/[worldId]/search/page.tsx`                                      | SearchSurface 독립 읽기 → island search                                                                               |
| `app/worlds/[worldId]/events/[eventId]/page.tsx`                            | readWorldEvent + EventSheet + Canon별 temporal 조회 → full SSR drawer                                                 |
| `app/worlds/[worldId]/canons/[canonId]/events/[eventId]/page.tsx`           | membership 검사 + EventSheet → 새 URL의 canon context                                                                 |
| `app/worlds/[worldId]/canons/[canonId]/page.tsx`                            | Canon Narrative/temporal/Subject/Event 링크 → island/drawer                                                           |
| `app/worlds/[worldId]/canons/[canonId]/subjects/[subjectHandleId]/page.tsx` | derived Subject/lineage/anchor → Graph 내 읽기                                                                        |
| `app/graph/[screen]/page.tsx` + `lib/atropos-screen-registry.ts`            | `/graph/private`, `/graph/explore` unavailable, `/graph/settings` available 보존; operations auth_gated_future 미활성 |

두 Event route → `components/event-sheet.tsx` → `lib/event-reading-navigation.ts`,
`components/event-time-context.tsx`/`relational-time.tsx`가 SSR·시간·링크 경로다.
Graph는 `urdr-port/src/components/graph-shell.tsx`의 EventDrawerContent 및
`lib/graph-spatial-detail.ts`의 stable href를 사용한다.
`lib/graph-fallback-markup.ts`, `components/graph-source-island.tsx`,
`components/status-island.tsx`, SearchSurface와 위 route들의 링크도 함께 이전한다.
`event-reading-navigation.ts`는 Graph root/query-context에도 사용되므로 통째로 dead code로 간주하지 않는다.
`event-sheet`의 공개 JSON 링크 및 temporal 표시도 읽기 능력 이전 전 삭제할 수 없다.

“가비지 코드 및 데이터 콜렉팅”은 불필요해진 경로 정리이며 새 개인정보/telemetry 수집이 아니다.
구형 전용 component, 중복 read/fetch/query/bootstrap payload, 불필요한 전량 로딩,
무참조 fixture/mock, dependency/style/export/helper, 구형 route만을 위한 테스트/링크를 조사한다.
`/graph/demo`와 source-query의 mock도 실제 테스트·demo 참조를 확인한 후에만 후보로 판정한다.
유효한 회귀 assertion은 새 표면으로 이전하며 삭제해서 gate를 통과시키지 않는다.

**보존:** canonical PostgreSQL 데이터/schema 의미, World/Canon/Event/Relation/Narrative identity와
membership, Publication Store 및 immutable Revision artifact와 format read 호환,
Publication JSON 경로, Graph API(`/graph/query`, `/graph/search`, `/graph/spatial`, `/graph/detail`),
bounded spatial query, health/status(`/health`와 live/ready, `/__status`, `/status-public`),
실제 공개 데이터, IP-004 evidence, URDR 저장소.
`app/worlds` 디렉터리를 통째로 삭제하지 않는다. current.json/revisions artifact route는 남는다.
reset, canonical 삭제, Publication Store 청소, migration, infrastructure 삭제는 정리 권한 밖이다.

## 7. 실행 단계와 각 종료조건

아래 단계 1~7은 완료됐다. 실제 검사·SHA·배포 연결은 종료 evidence를 따른다.

| 단계                 | 변경 범위                                                     | 사용자에게 보이는 결과                 | 자동 검증                                                             | 유지 경계                                            | 종료조건                                                      |
| -------------------- | ------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| 1. 계획·문서 계약    | IP-005 신설, CURRENT/TS-006/INDEX 및 최소 대체 안내           | 실제 GitHub docs-only PR               | 링크·ID·trace·용어·상태·URL 계약, 전체 diff, secret scan              | runtime/데이터/배포 무변경, M5 inactive              | remote commit/변경 파일 확인과 main 대상 PR 생성; merge 안 함 |
| 2. Graph 중심 라우팅 | root redirect와 Graph 내 World/Canon/Search/Subject 진입 준비 | 기본 Graph 진입과 내부 탐색            | route·내부 href·기존 화면 smoke                                       | 읽기 대체 전 구형 페이지 제거 금지, 보존 screen 유지 | root/Graph 진입 및 후속 이전 경로 검증                        |
| 3. 단일 drawer       | full route, peek/full/closed, history, occlusion-aware focus  | 링크 직접 읽기와 축소 후 같은 Event    | URL round-trip, offscreen/direct focus, history, race 테스트          | renderer/layout/Revision/identity 불변               | §3~4 전이와 context 보존 검증                                 |
| 4. SSR 이전·정리     | 핵심 SSR/참조 이전, 구형 UI/무참조 코드·payload 제거          | no-JS 읽기, 새 링크만 사용, 옛 UI 404  | SSR/hydration pin·safe Markdown·route/import 검사                     | JSON/API/health, durable data·artifact 보존          | 기능 대체 증거 후 삭제, stale 내부 링크 0                     |
| 5. 통합 검증         | 회귀·접근성·성능·보안                                         | 모바일 안정성·실패/재시도·bounded 읽기 | 관련 format/lint/typecheck/unit/contract/build/mobile/secret 및 scale | 유효 assertion 유지, 임의 budget 완화 금지           | §8 전체 runtime acceptance 증거 확보                          |
| 6. 병합·배포·공개 QA | runtime PR merge, Railway 배포와 관측                         | public Atropos에서 새 읽기 UX          | CI, status/health/synthetic smoke, 공개 mobile QA                     | 별도 구현 실행 권한 아래만, canonical write 불필요   | 실제 deployed SHA와 QA 연결; 오류는 수정 후 재검증            |
| 7. 종료 기록         | evidence packet/CURRENT 정합화                                | 완료/미검증 범위와 다음 경계가 명확    | SHA·URL·검사·문서 상태 교차검사                                       | IP-004 evidence 소급 수정 금지, M5 inactive          | 전체 종료조건 충족 시에만 IP-005 complete                     |

## 8. 전체 종료조건과 미래 검증

- `/` → `/graph`, full URL 직접 진입/reload/내부 링크가 같은 Event를 연다.
- full → peek는 동일 Event를 실제 가용 영역의 적정 위치·배율에 놓는다.
  offscreen·직접 진입도 동작하고 collapse와 close가 구분된다.
- back/forward·URL·UI·selection이 일치하며 불필요 history entry/상태 진동이 없다.
- World/Revision vector/Canon/source/query/search/Time System 맥락이 보존된다.
- SSR/no-JS 핵심 읽기 및 hydration served Revision이 일치한다.
- Narrative·관계·membership·시간·출처·derived 관점 표현이 보존된다.
- invalid ID/membership, unavailable Revision, loading/error/retry, partial source가 명시적이다.
- 제거 UI route는 404이고 내부 stale href가 없다. private/explore/settings는 기존 상태로 남는다.
- Publication JSON·Graph API·health/status 및 format 호환 회귀가 없다.
- viewport continuity·selection retention·label hysteresis가 유지된다.
- 불필요한 전량 fetch·선택 race·stale response·cross-Revision cache 혼합이 없다.
- canonical 데이터/schema·identity/membership 및 기존 immutable artifact가 불변이다.
- 실제 commit/배포/공개 QA evidence로 종료하며 M5는 inactive다.

runtime 검증은 format/lint/typecheck/unit/contract/build/mobile WebKit, secret scan,
100/1k/10k scale reader와 기존 100k bounded spatial 회귀를 통과했다. 전체 100k canonical
workload 또는 production WAN p95를 검증한 것으로 확대하지 않는다. 배포 SHA와 공개 QA의
정확한 범위는 종료 evidence에 기록하며 M5는 계속 inactive다.
