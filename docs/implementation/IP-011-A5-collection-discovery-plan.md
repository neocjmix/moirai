---
id: IP-011-A5
title: Graph 중심 Collection 발견과 이중 밀도 표현
status: planning-baseline
layer: implementation-plan
---

# IP-011 A5 — Graph 중심 Collection Discovery

2026-09-28 KST. 사용자 최신 A5 지시를 반영한 planning baseline. 조사 기준 `8937cb4142215b439d4430e61b9db1ae15f218c8` (PR #236). 계획 PR #237은 main `55cae82`에 통합됐다. **2026-09-28 구현 시작 지시로 A5 S0–S7 구현·merge·checkpoint 배포가 활성화됐다.** A6/M5·대량 역사 입력·canonical migration·새 유료 서비스는 비활성이다. 진행·검증 결과는 CURRENT와 a5-execution이 소유하며 아래 planning 조사와 제안/실측 구분은 유지한다.

상위 의미는 CON-003/CORE-MODEL, 독자 수용은 BR-003/JRN-004, 읽기 계약은 TS-005/006, 단계 의존성은 IP-011이 소유한다. 이 문서는 실행 순서·실험·채택 판정을 소유한다. 사용자 확정 방향과 아래 제안된 초기 실험 파라미터를 구별한다.

## 1. 실제 기준선과 조사 한계

2026-09-28 12:21 KST 최우선 HUD 결정: 임계 기준에 합격한 Composite만 찾는 방식이 아니라 화면 관련 후보들을 상대 점수화하여 하나를 고른다. partial/작은 면적/동률도 탈락 사유가 아니며 World-only는 후보가 실제 없는 경우에 한한다. 이 결정은 아래 기존 no-topic/partial/ambiguity 초기 실험 가정을 대체한다. suppression·viewport·World 좌표 계약은 불변이다.

2026-09-28 11:45 KST 사용자 피드백이 아래 초기 실험 결정을 대체한다. HUD는 fade/면적과 독립적으로 현재 보이는 Composite 맥락을 선정한다. 선형·작은 Composite도 단독 후보면 제목으로 표시하며 graph label과 HUD 동시 표시를 허용한다. suppression 자체는 유지한다. 운영 데이터 부족을 해결하기 위해 현재 개발 World에 합성 데이터를 직접 추가·수정하는 것이 명시 승인됐다. 별도 World 격리나 read-only 제한은 이 A5 합성 corpus 작업에 적용하지 않는다. 출시 reset은 향후 별도 작업이며 지금 일괄 삭제하지 않는다. A6/M5·schema migration·새 유료 서비스는 계속 비활성이다.

- `git fetch origin` 후 origin/main과 로컬 HEAD는 위 SHA로 일치했다. 공개 Atropos `/health`도 같은 SHA와 `status:ok`를 반환했다. 운영 브라우저 UX·DB inventory를 이번에 다시 시험했다는 뜻은 아니다.
- A4는 사용자 승인으로 잔여를 이관하여 종료했다. PR #235의 코드 기준은 `035cc069b00c0cc722c17f8b976b36c8738335ad`; #236은 종료 문서다.
- A4 최종 증거: 기존 모바일 12 case 및 worker 2 case 성공. 30회 왕복 sustained 시작/중간/복귀 frame p95 50/56/62ms, max 100/84/92ms로 p95 ≤33.4ms 미달. 동일 복귀 IDs/geometry·DOM 229·cache 8항목/700360 serialized bytes는 보존. heap 증거와 혼동하지 않는다.
- CURRENT가 기록한 운영 콘텐츠는 Revision 32, Event 127, Collection 6, Relation 415, Narrative 133이다. 이번 조사에서 수량을 재조회하지 않았다. 6 Collection만으로 다중 활성 용량을 입증할 수 없다.
- 관련 구현을 정적으로 추적했다. 새 성능 실험은 실행하지 않았다. DOM/paint/React/query 중 **현재 용량의 지배적 병목은 미확정**이다.

### 1.1 코드 근거와 planning 질문 12개

경로는 저장소 루트 기준이며 아래 식별자는 위 SHA에서 조사했다.

| 질문 | 실제 관찰 | 계획상 판단 |
| --- | --- | --- |
| 1. dominant 판정 재사용 | `graph-shell.tsx/getCompositeSurfaceOpacityScale`: viewport로 clip한 polygon 면적 비율. coverage ≤0.35는 1, ≥1은 0, 사이는 선형 fade. 대표 주제 선택기는 없음 | coverage를 재사용하되 dominant topic 선정·동률·완전성·시간적 안정성은 별도 파생한다. 가장 큰 ancestor를 무조건 제목으로 쓰지 않는다 |
| 2. label/geometry 결합 | 같은 파일 `chartCompositeRegions`, `chartInstantPoints`, `farZoomElisionState`, `selectCompositePaintTargets`. showLabel은 분리돼 있으나 descendant opacity와 surfaceOpacity, entity 사전 제거는 geometry·label 모두에 영향 | 데이터 후보 → 표현 eligibility → paint → interaction으로 책임을 분리. full-viewport 억제와 작은 Composite 자식 fade를 별개 정책으로 유지 |
| 3. renderer 변경 범위 | 중심 파일 `apps/atropos-web/src/urdr-port/src/components/graph-shell.tsx` 약 4천 줄. label-policy, composite, paint-presence, world-geometry helper가 존재 | SVG 유지. 순수 representation policy 모듈·결과 구조를 추출하고 point/region/edge paint와 hit target 소비부만 바꾼다. 대규모 renderer 교체·전면 리팩터링은 범위 밖. 난도 중간 이상 |
| 4. hit testing 분리 | point는 별도 rect, region path와 label은 onPointerDown. 라벨을 숨겨도 point의 label 길이 기반 rect와 region primary target이 남음. pointer capture·tap slop은 stage에 있음 | 분리 가능. Geographic은 초기안에서 primary hit target·tab stop 없음. Semantic만 명시적 target. gesture 처리는 기존 stage에 유지 |
| 5. 활성화 비용 | `v5-atropos-root.tsx`의 selection 변경으로 loader 생성. 캐시는 loader 소유. `v5-spatial-publication.ts/readV5SelectedViewport`가 World 공간 후보를 membership으로 거름 | 서버 projection 재생성은 없음. membership 확인·shape/edge 조회·새 snapshot·React 및 geometry 재평가·캐시 교체 비용이 증가 |
| 6. 실제 capacity 병목 | shell/viewport/search API와 selected viewport reader에 8 Collection 제한. 선택 수와 index 깊이에 따라 rawLimit 감소. shell은 최대 16 page, reader 내부 object 상한·응답 1MiB 제한. A4 profile은 많은 Collection 수를 독립 변수로 분리하지 않음 | 8개 제한은 확인된 장애물. 지배적 시간 병목은 측정 전 단정 금지. 단순 max(8) 증가는 금지. per-request와 전체 gesture 누적 비용을 함께 제한 |
| 7. suppression 충돌 | label opacity도 surfaceOpacity를 곱하고 exact-zero 도형은 paint 목록에서 제거. 퇴장 220ms와 color 유지 회귀가 존재 | Geographic 승격이 full-viewport/중복 ancestor 억제를 우회하지 않게 한다. HUD 후보는 paint 제거 이전 자료에서 구한다 |
| 8. relevance 관계 충분성 | `projections/v5-content.ts`에 Event→Collection page, Collection→Event page, adjacency, contains·temporal detail. 공간 leaf의 read_hint는 membership ≤8일 때만 전부 포함 | 초기 overlap/인접 heuristic의 사실 재료는 충분. 전체 Collection 순회 없는 temporal candidate discovery와 대규모 검색의 접근 경로는 보강·검증 필요 |
| 9. 새 persisted data 필요 | canonical에 importance/recommended_with 없음. 기존 역색인·World 공간 읽기 사용 가능 | 초기 runtime inference 가능. 성능상 필요하면 재생성 가능한 Publication summary/index 추가. canonical field/table·사용자 계정 동기화 DB는 불필요 |
| 10. spatial memory 위험 | `v5-world-layout.ts/buildV5WorldLayout`은 World/Revision/Time System 단위. 선택이 좌표를 계산하지 않음. App은 loader 변경 시 workspace 보존. 다만 client hull·color·label history는 active 자료/loader 영향을 받음 | canonical 좌표 이동 위험은 낮으나 표현·navigation clamp·캐시 초기화의 변화 위험은 있음. 자동 fit 금지; shared 좌표와 bounded geometry support·색·선택 유지 시험 |
| 11. 모바일 충돌 | graph-shell CSS에 safe-area/100dvh/touch-action:none, 768px breakpoint. stage pointer capture와 drawer drag 존재 | HUD는 작은 overlay, 배경 hit 차단 없음. edge affordance가 pinch/OS edge gesture와 겹치지 않게 예약 영역·dwell·개수 제한 시험. permanent sidebar 없음 |
| 12. 접근성 | Island에 button/input/tab, drawer dialog가 있으나 graph SVG targets는 pointer 중심이고 point/region에 keyboard activation 경로가 확인되지 않음 | 기존 graph가 완전 접근 가능하다고 주장하지 않는다. A5 Semantic target의 keyboard/focus·동등한 목록 경로를 추가. Geographic은 접근성 트리에서 장식 처리, 내용은 search/detail로 도달 |

추가 관찰: `V5GraphPage`는 Collection catalog **첫 128개 page**를 읽고 기본으로 그 목록을 모두 선택하며 URL selection도 그 페이지로 걸러낸다. 현재 목록을 전체 World browser라고 재사용할 수 없다. `GraphSourceIsland`는 Collection picker 외에도 사건 검색·미배치 접근·관계 필터·시간 기준을 소유한다. mount를 끄면 해당 Island 진입점은 사라진다. 2026-09-28 후속 사용자 결정에 따라 사건 검색·관계 필터·미배치 사건 접근은 새 Graph UX가 채택되면 하단 내비게이션의 탐색으로 해결한다. 이번 실험의 동시 대체 구현 요구는 아니다. GraphQueryProvider의 v5 선택은 `collections` URL을 replace하고 v5 popstate 복원은 별도 구현되지 않는다. 자동 활성 집합을 이 필드에 그대로 넣으면 user intent와 추론이 섞인다.

LOD 조사: 운영 `/graph/v5/shell` viewport 응답은 `lodLevel: 0`을 반환한다. client는 scaleY의 editorial zoom bucket과 Composite 높이에 따른 descendant fade를 사용한다. 안정된 서버 다중 해상도 representation 공급이 이미 구현됐다고 가정하지 않는다. v5 shell shape mapping은 editorial metadata를 붙이지 않으므로 generic renderer의 editorial 기반 far-zoom elision이 v5에서도 동일하게 작동한다고 가정하지 않는다. 독립 X/Y zoom을 representation fixture에 포함한다.

현재 앱/패키지에서 공용 feature-flag framework는 발견하지 못했다. fixture env, cutover env, localStorage settings는 있으나 Island rollout flag는 아니다. 최소 typed 실험 설정을 SSR bootstrap에서 한 번 결정해 전달하는 방안을 계획한다. 새 유료 flag provider는 쓰지 않는다.

## 2. Goal와 변경된 UX model

**Graph를 탐색하면 관련 Collection이 드러나고, 사용자는 중요한 맥락을 고정하며 탐색 세계를 넓힌다. Graph exploration이 기본 모드다.** 알고 있는 목적지와 자동 판단 실패를 위한 전체 Collection browser/search는 항상 접근 가능하다.

확정된 방향:

- Island는 삭제하지 않고 flag로 꺼서 비교·복구할 수 있게 한다. 새 UX의 전제가 아니다.
- 좌상단에는 배경/container 없는 중간 크기 typography로 World 이름, 다음 줄에 dominant Composite 주제를 표시한다. 제목은 Collection명으로 대체하지 않는다. 대표가 없으면 World만 보인다.
- Semantic/Text 밀도는 강하게 제한하고 Graphic/Geographic 밀도는 더 높게 허용한다. Geographic은 지리 좌표를 뜻하지 않는 **graph의 공간·구조 표현**이다.
- 정보 없는 full-viewport/중복 ancestor geometry는 계속 억제한다. 사라지는 의미는 HUD가 이어받는다.
- Collection 활성화와 entity 표현, 사용자 pin과 자동 relevance는 독립적이다.
- 표현 capacity를 검증한 후 자동 relevance를 넣는다. A/B cluster나 고정 tile 도입은 완료 의무가 아니다.

사용 흐름: World/주제를 읽는다 → graph를 이동·확대한다 → 연관 맥락이 약하게 드러난다 → 필요한 것을 pin한다 → 내용은 늘지만 읽어야 할 label은 제어된다 → 원할 때 전체 browser에서 직접 찾는다. 자동화 실패 시 auto를 끄고 수동 pin만으로 동일 탐색을 계속한다.

## 3. Domain/state model

정본은 그대로다: World가 사실·identity·Revision 경계, Collection은 Event 선택 집합, Composite는 contains 파생, 각 Event/Collection에 단일 Narrative. 다음은 Atropos 탐색 상태이지 새 ontology가 아니다.

| 축 | 제안 상태 | 책임 |
| --- | --- | --- |
| 명시 의도 | pinned IDs, session manual-active IDs, explicit excluded IDs, autoDiscoveryEnabled | Pin은 사용자가 해제하기 전 항상 effective active. 수동 activate는 현재 탐색 세션 동안 유지하는 명시 의도로 구분 |
| 추론 | relevance evidence, confidence/completeness, contextual/suggested/none, enter/exit timestamps | user intent를 덮어쓰지 못함 |
| 실제 활성 | explicit intent와 안정화된 contextual 결과에서 파생 | loading/partial/error는 activation과 별도. active라고 모든 구성원이 전송·표시됐다는 뜻 아님 |
| 표현 | semantic/geographic/suppressed + label/geometry/interaction eligibility | Event별 파생. 여러 Collection에서 같은 Event는 1개 |
| 탐색 context | World/Revision/Time System, camera, explicit focus, navigation epoch, provenance | snapshot·cursor·cache identity 및 자동 증폭 차단 |

UX의 네 계층은 위 축에서 투영한다. 우선 pinned, 다음 contextual active, 다음 suggested, 나머지 World로 보이되 수동 activate의 유지 사유는 숨기지 않는다. UI 명칭·배치와 임시 활성의 세부 해제 방식은 slice에서 검증한다.

제안 동작 계약:

- pin은 해당 ID의 제외를 지우고 고정한다. 다른 Collection에서 동일 Event가 선택돼도 중복되지 않는다.
- unpin은 '고정 해제'이며 contextual로 남을 수 있음을 구별한다. '끄기'는 pin/manual-active를 해제하고 session exclusion을 남겨 자동으로 즉시 되켜지지 않게 한다.
- '모두 끄기'는 explicit active를 비우고 auto도 중지한다. 빈 선택은 빈 graph이며 World 전체 활성으로 해석하지 않는다. browser는 계속 사용 가능하다.
- auto off는 contextual만 해제하고 pins/manual-active는 보존한다. 오류·timeout·부분 후보는 relevance 0으로 간주하지 않는다. 마지막 확인 상태를 제한 시간 유지하고 새 자동 확장을 중지하며 수동 조작을 보장한다. TTL은 실험 전 명시한다.
- 첫 방문은 읽기 좋은 특정 맥락에서 시작한다(사용자 확정). 전체 World 개요나 첫 catalog page 전체 선택을 기본값으로 삼지 않고, 최초 맥락의 구체적 선정은 실험에서 결정한다. 한 번 이상 방문한 사용자는 **현재 구현의 이전 viewport 복원 로직을 유지**한다. 재방문에서 첫 방문용 맥락이나 자동 relevance가 복원된 위치·배율을 덮어쓰지 않는다. 명시 URL/focus와 저장 상태의 기존 우선순위도 보존한다. 복원 이후 camera 또는 명시 focus에서 bounded seed를 얻고, seed가 없으면 World와 browser를 제공하며 무작위 추천하지 않는다.
- 기존 `collections=` 링크는 명시 selection으로 해석하여 pins/manual mode로 복원한다. 새 공유 상태는 World, camera, focus, explicit intent, auto mode를 구분하며 자동 결과를 pin으로 직렬화하지 않는다. 정확한 inference replay에는 Revision+policy version도 필요하다. URL을 매 frame 갱신하지 않는다.
- pin은 다음 방문에도 유지하며 사용자가 명시적으로 해제·초기화한다(사용자 확정). 초기 구현 범위는 같은 브라우저/World와 공유 URL이고 account sync/서버 개인화는 제외한다. 명시된 URL 상태가 로컬 저장보다 우선하며 자동 상태·타이머는 세션 파생값이다. pin 복원이 기존 viewport 복원을 덮어쓰거나 auto-fit을 유발해서는 안 된다. URL/state 크기 제한도 조용한 pin 삭제로 처리하지 않는다.
- 열린 Event drawer·keyboard focus는 Collection 자동 해제에도 유지한다. 이는 그 Event에 대한 bounded detail context이며 Collection 전체를 자동 pin하는 근거가 아니다.

## 4. Rendering model과 HUD hand-off

데이터/geometry 후보 → 완전성·spatial information 판단 → geographic eligibility → semantic budget/label placement → interaction eligibility → paint/transition 순으로 나눈다. semantic을 표시하지 않는다는 이유로 유효 geometry를 삭제하지 않는다. eligibility는 하나의 enum으로 강제하지 않는다.

- **Semantic:** label과 식별 가능한 shape, 명시 primary target. 선택/focus 대상은 우선하지만 큰 면 전체를 clickable하게 만들 필요는 없다.
- **Geographic:** 구조를 드러내는 point/line/contour/region. 초기안은 primary pointer target·tab stop을 만들지 않는다. 직접 읽기는 확대·semantic 승격·목록·search로 접근한다.
- **Suppressed:** full coverage, 중복 ancestor, 화면 밖, 지나친 subpixel 중첩 등 추가 정보를 주지 못하는 표현. 정본 삭제나 데이터 누락과 구분한다.

Graphic budget은 semantic budget보다 높지만 무제한이 아니다. geometry 수, vertex 수, 면 중첩/ink coverage, paint·query 비용을 별도 제한한다. 다수 반투명 fill로 화면을 덮지 않는다. 선택된 대형 Composite도 억제를 무시하지 않고 HUD/선택 표시에서 의미를 보존한다. 새로운 내용이나 사실을 가짜 지형으로 생성하지 않는다.

dominance 신호는 paint 제거 전의 검증된 geometry에서 얻는다. coverage만으로 HUD 주제를 확정하지 않고 중심의 맥락·contains 관계·대표성·직전 주제의 안정성을 함께 비교한다. 중첩 ancestor/동률, 부분 hull, 작은 Composite, 주제가 없는 공간을 fixture로 고정한다. 불완전 geometry로 확실한 dominant를 주장하지 않는다. label과 HUD의 의미 인계는 같은 신호를 사용하되 enter/exit와 dwell을 두며 양쪽이 동시에 사라지는 공백을 막는다. 다중 주제에서 확신이 없으면 잘못된 하나를 강제하지 않는다.

기존 35%→100% 면적 fade와 220ms exit는 최초 대조군에서 유지한다. 부분 억제 곡선·중복 ancestor의 정보량 규칙 개선은 golden 비교와 명시적 변경 기록을 거친다. 작은 parent 때문에 descendant가 fade되는 정책은 full-viewport suppression과 섞지 않는다.

## 5. Relevance model — 설명 가능하고 자기증폭하지 않는 자동화

### 5.1 근거를 만드는 경로

1. 사용자 camera/zoom/pan 또는 explicit navigation으로 navigation epoch를 연다. 시스템 activation·fade·HUD 변경은 새 navigation epoch를 만들지 않는다.
2. 같은 World/Revision의 **effective active 선택에 의존하지 않는 bounded 공간·시간 query**로 anchor evidence를 만든다. 화면에 실제 paint된 label/Geographic 수를 relevance 입력으로 쓰지 않는다. seed 후보를 읽는 것과 graph에 활성화하는 것은 구별한다.
3. anchor Event의 paged membership과 bounded 1-hop adjacency로 후보를 만들고, 시간/공간 summaries는 보조 evidence로 사용한다. collection 전체 본문·전체 membership을 매번 읽지 않는다.
4. viewport/navigation 관련성이라는 최소 자격을 통과한 후보에만 pin affinity를 보정값으로 적용한다. 멀리 떨어진 pin만으로 후보를 생성하거나 연쇄 확장하지 않는다.
5. 같은 epoch의 contextual 결과를 다시 seed로 투입하지 않는다. 시스템 content·transition·layout 변화에서 온 신호는 provenance로 배제한다. 사용자가 그 사건을 직접 선택하면 다음 epoch에서 명시 신호가 될 수 있지만 Collection pin으로 자동 해석하지 않는다.
6. 동일 camera/Revision/explicit intent에서 contextual content만 주입·제거한 대조 실험의 후보·score·active 결과가 같아야 한다. 독립 World query에 원래 포함된 Event는 activation 때문이 아니라 동일 공간 근거로 포함됨을 증명한다.

이 방식으로 no-pin/빈 graph에서도 발견이 가능하고 자기증폭을 막는다. 공간 query도 제한적이므로 누락을 '관련 없음'으로 단정하지 않는다. query 결과·선정 근거·partial·provenance를 진단에서 추적한다. 사용자 설명은 '같은 사건', '연결된 사건', '겹치는 시기' 등 확인된 사실만 쓴다.

### 5.2 안정성과 수식 선택

정확한 score weight는 미확정이다. 먼저 개별 evidence를 노출하는 단순 heuristic을 비교한다. enter > exit threshold, enter/exit dwell, 안정된 tie-break, 변경 batch, 재진입 cooldown을 조합하고 사용자 gesture 중 자동 membership commit을 지연한다. gesture와 settled viewport 판정은 animation 종료가 아니라 사용자 입력 provenance에 연결한다.

초기 **시험값**: enter dwell 600ms, exit dwell 1500ms, settle 후 한 번의 activation batch, dwell 이하 boundary jitter에서 toggle 0회. 이는 검증된 최적값이 아니며 S0에서 기록한 값으로 시험한 뒤 채택/기각한다. pause·exclusion은 timer보다 우선한다. 응답 지연/역순/Revision 전환으로 이전 epoch의 결과를 활성화하지 않는다.

Suggested는 graph entity selection에 영향을 주지 않는다. suggestion의 작은 방향 affordance만 별도 overlay로 표시할 수 있다. Contextual로 전이할 때 Geographic이 먼저 들어오고 semantic eligibility가 뒤따른다. 퇴장은 semantic → geographic → 제거로 진행한다. reduced-motion에서는 animation 없이 동일 의미·선택 안정성을 유지한다.

## 6. Interaction·desktop/mobile·접근성

- HUD: World + 안정된 topic으로 시작. 이후 명시 pin/auto 상태와 browser 진입점만 최소한으로 추가한다. 네 계층을 모두 펼친 상시 패널로 만들지 않는다.
- 후속 사용자 결정: 사건 검색·관계 필터·미배치 사건 접근은 이번 Graph UX가 괜찮다고 판단되어 채택되면 하단 내비게이션의 **탐색**에서 해결한다. Graph/HUD에 대체 control을 추가하는 것은 S1 선행조건이나 A5 실험 실패 기준이 아니다. 기존 구현은 Island와 함께 보존한다. 탐색 surface의 구현은 채택 이후 별도 후속 범위로 계획하며 이번 planning만으로 시작하지 않는다. 전체 **Collection** browser/search escape hatch와 이 세 기능은 구별한다. Collection 탐색·pin은 Graph mode에서 계속 가능해야 한다. 시간 기준 선택은 이번 후속 지시의 이동 대상에 포함하지 않고 기존 계획대로 필요한 접근을 보존한다.
- feature 설정은 최소한 legacy Island와 새 discovery experience를 원자적으로 전환한다. 미완성 단계에서는 auto를 별도로 OFF할 수 있다. 잘못된 설정·SSR hydration에서 두 chrome이 동시에 뜨거나 control이 사라지지 않는다. legacy 복구는 현재 pins/effective selection을 유효한 수동 상태로 변환하고 데이터는 변경하지 않는다.
- spatial suggestion: 확인된 graph evidence 위치가 있을 때만 방향/가장자리 표시. 임의 지리 방향을 발명하지 않는다. 공간 근거 없는 no-time 후보는 HUD/browser에서만 제공한다. 초기 동시 최대 2개는 시험값이다. 작은 이동마다 뒤집히지 않게 한다.
- suggestion 선택 시 초기안은 맥락 미리보기/임시 activate이며 즉시 camera fit·영구 pin을 하지 않는다. '그쪽으로 이동', '고정'은 명시 동작이다. 정확한 표면은 prototype에서 비교한다.
- Desktop: hover는 보조 수단. keyboard로 동일한 pin/off/browser/선택과 pan/zoom 경로를 제공한다. 상시 sidebar는 요구하지 않는다.
- Mobile: 안전 영역을 고려한 좌상단 overlay; graph 영역은 유지. browser만 필요 시 bottom sheet. drawer와 sheet는 focus·gesture 소유권을 명확히 하고 닫으면 원래 graph focus로 복귀한다. edge suggestion은 시스템 edge gesture·축·drawer handle의 예약 영역을 피한다.
- 장식 overlay는 pointer-events:none, control만 입력을 받는다. touch target은 제안 최소 44×44 CSS px로 시험하고 긴 한국어 제목·200% text·가로/세로 회전에서 가림과 clipping을 검사한다.
- Semantic 대상은 accessible name, keyboard activate, focus 표시를 갖고 과도한 tab stop은 roving focus 또는 접근 가능한 bounded 목록으로 제어한다. Geographic은 비상호작용/aria-hidden. HUD 변경은 매 frame announce하지 않는다. 색만으로 pinned/contextual/suggested를 구별하지 않는다.

## 7. Architecture와 capacity 측정

기존 경로: canonical World → worker temporal/layout → immutable Publication (content·membership·spatial·adjacency) → Atropos selected viewport → shell mapping/edge query → snapshot loader → SVG. A5는 이 경계를 유지한다. selection/relevance가 canonical write 또는 worker rebuild를 유발하지 않는다.

필수 변경 seam은 (a) read-only discovery query, (b) explicit intent store + inference controller, (c) representation policy, (d) HUD/interaction adapter다. 공용 엔진/새 서비스/graph DB를 만들지 않는다. 필요 추가 index는 Publication version/completeness/digest 계약에 포함하며 기존 immutable key를 덮어쓰지 않는다.

현재 8개 제한과 read_hint membership 8개 제한은 다른 제약이다. 전자는 query 입력 제한, 후자는 큰 membership을 생략하고 posting lookup으로 가는 최적화다. 함께 숫자만 올리면 고차수 비용이 폭증한다. S3에서 paged inverse membership과 active set intersection, 검증된 selection state의 재사용을 비교하고 정한 요청·메모리 예산 안에서 확장한다. 선택 수가 커질수록 고정 ID 순서의 Collection이 굶지 않도록 공정성/continuation을 시험한다.

Pin을 renderer cap 때문에 자동 해제하지 않는다. 물리 상한을 만나면 명시 partial/loading과 continuation·범위 좁히기를 제공하고, pins는 활성 의도로 남는다. 동시에 pins만 들어온다는 이유로 contextual representation을 영구 starvation시키지 않는다. semantic quota를 Collection마다 1개씩 강제하면 label 수가 Collection 수에 비례하므로 그런 모델도 피한다.

선택 변경에 따른 loader/viewport cache 전체 교체, Composite placement history reset은 A5의 자동 토글과 직접 결합한다. camera·immutable geometry/detail 재사용·색과 label 안정성을 보존하되 selection이 다른 응답을 혼합하지 않도록 cache identity를 분리한다. World 공간 좌표는 동일 입력에서 같아야 하며 자동 fit/강제 recenter는 하지 않는다.

## 8. 단계별 implementation slices — 실행 상태는 CURRENT 참조

| Slice | 사용자 가치/산출물 | 검증·다음 단계 gate |
| --- | --- | --- |
| S0 기준·계측·시험 등록 | 현 UI/World와 synthetic 입력·baseline·예산 고정. 문서 정합성 및 flag 설계 | baseline screenshot/state/golden, A4 원시값 구분, 신규 metric·실험값·실패 조건을 결과 보기 전에 기록 |
| S1 Island OFF + Context HUD | 기존 Island 보존, graph+두 줄 HUD로 orientation. 최소 escape/accessibility 경로 | flag 양방향, Collection escape 접근, full-viewport fade와 HUD hand-off, no-dominant·nested·partial·동률, 모바일 초기 점검 |
| S2 표현·입력 분리 | 풍부한 Geographic, 제한된 Semantic, 별도 hit targets | 동일 activation에서 기존/A5 비교; suppression golden, invisible hit 0, overlap·paint·label·선택·200% text·touch/keyboard. 자동 추천 없음 |
| S3 수동 다중 활성 capacity | 작은 Collection 수에 UX를 묶지 않고 현실적인 처리량 확인 | 1/2/4/8 Collection 비교 후 bounded query 변경을 포함한 16/32/64 probe. 8 초과 변경 전 기존 failure를 기록. 동일 geometry 조건과 실제 증가 조건 분리. 확장 채택 여부 판단 |
| S4 의도·추론 상태와 수동 control | pin/activate/off/auto-off/all-off/URL/escape hatch | inference는 fake trace 또는 shadow mode만. pin 자동 해제 0, manual exclusion 준수, 전체 catalog paging·search, 첫 페이지 밖 ID·no-time·빈 collection, pin 재방문 유지·기존 viewport 복원·명시 링크 우선순위 검증 |
| S5 bounded relevance shadow → contextual | 이유가 보이는 단순 heuristic와 안정된 자동 유입 | 고정 navigation trace, 자기증폭 대조군, far-pin 무효, 역순/실패/Revision, jitter/enter/exit/hysteresis. 통과 전 실제 자동 활성 금지 |
| S6 HUD control + spatial discovery | graph 안에서 발견→activate→pin→더 읽기 | edge 후보 0/1/2, 근거 없는 화살표 0, tap/pinch 충돌·desktop keyboard·drawer 유지; spatial affordance 실패 시 기각 근거와 동등한 graph-context discovery 대안 검증 |
| S7 통합·read-only 역사 dogfood | 단종·임진왜란·일본사 기존 콘텐츠로 실제 탐색 품질 검증 | full E2E·scale/sustained·mobile/desktop·accessibility·수동/자동 fallback·사용자 읽기 경험 확인. 새 대량 작성은 A6로 남김 |

모바일은 마지막까지 미루지 않고 S1부터 매 slice gate다. 타일/cluster는 S3에서 기존 구조로 비용·발견 가능성을 만족하지 못한 증거가 있을 때 독립 prototype으로만 진입한다. 채택 후에만 TS/Publication 계약에 반영한다. 새 엔진 전환은 자동 승인 범위가 아니다.

## 9. Measurable exit와 performance budget

### 9.1 고정 A1/A4 기준 — 그대로 유지

| 항목 | 기준/측정 |
| --- | --- |
| interactive read/discovery | cold p95 ≤500ms (20 process samples), warm p95 ≤100ms (50 samples); index 포함 ≤1MiB, object reads ≤256; per-query row/candidate 상한, full-history replay 0 |
| discovery | 후보 ≤500/request, 응답 ≤20/page. continuation·query digest·Revision 고정. 전체 Collection 순회 없음 |
| page/read | decoded initial HTML ≤1MiB, graph response ≤1MiB; 20 navigations graph-ready p95 ≤3000ms, drawer ≤1000ms; page error 0 |
| frame | pan/zoom/toggle p95 ≤33.4ms, max ≤100ms; 각 active 600+ frames. 30회 왕복 시작/중간/복귀와 whole interval 모두 보고 |
| scale | 1k/10k/100k Event × sparse/dense/shared/large. 동일 local query에서 먼 콘텐츠 증가 시 bytes/rows ≤2배. 추가 Collection 128/1k/10k, membership 고차수 8 초과·empty/no-time 포함 |
| worker | 기존 10k ≤180s/≤3GiB 유지, 변경된 index의 100k CPU/RSS/output/cancel/restart 별도 보고 |

고정 profile은 기존 Ubuntu CI/mobile WebKit iPhone 14/no throttling/local object store다. 실기기/운영 네트워크는 별도 결과다. query를 둘로 나눠 각 256회 읽기로 통과시키지 않는다. **S0 제안 추가 gate는 하나의 settled navigation에서 viewport+discovery의 cold 누적 artifact bytes/reads도 1MiB/256 안에 배분**하는 것이다. 기존 gate보다 강한 새 결합 예산이므로 S0에서 명시 등록하고, 별도 승인 없이 기존 실패를 없애기 위해 완화하지 않는다. 갱신 빈도·취소 후 낭비·background 요청 수도 기록한다.

### 9.2 A5 신규 품질 gate — 제안된 초기 합격 기준

- identity/meaning: shared Event 중복 0, 동일 Revision에서 Collection 조작으로 좌표·시간·Narrative 변경 0, 사용자 개입 없는 camera 이동 0.
- return visit: 같은 브라우저/World 재방문 시 pins와 기존 viewport 위치·배율을 복원하고 first-visit seed/자동 활성에 의한 덮어쓰기 0. 최초 방문·재방문·명시 Event/viewport 링크를 별도 회귀 시험한다.
- intent: pin 자동 해제 0; explicit off 이후 자동 재활성 0; all-off가 비어 있음; auto-off에서도 browser/search/pin/detail 동작.
- representation: Geographic primary targets/tab stops 0; suppressed paint 잔류는 기존 exit 완료 후 0. full-viewport ancestor를 1/4/16개 중첩한 fixture에서 억제 후 추가 fill/primary target 0. 선택 의미는 HUD/detail로 보존.
- hand-off: 사전 고정 nested/dominant/no-topic/partial 시나리오의 예상 HUD 결과 모두 일치. 단일 확정 주제에서 fade가 끝났는데 HUD도 없는 checkpoint 0. 불확실 사례는 정해둔 fallback과 일치.
- density: pixel 면적당 Semantic label 수·bounding-box overlap·primary target 수와 Graphic shape/vertex/ink coverage를 별도 기록. 자동 UI가 추가한 label 겹침 0을 목표 gate로 삼고 긴 제목/선택 충돌은 배치 또는 생략으로 해결. label 총량/graphic cap은 S2 pilot 후 **holdout 검증 전에 고정**; 숨긴 개수만으로 성능 채택 금지.
- continuity: 같은 camera/Revision/선택으로 복귀하면 world geometry·IDs 일치. stable context에서 자동 토글로 인한 label churn/색 변경/shape support 변화 기록; 무입력 60초 동안 초기 안정화 후 activation 변화 0, dwell 미만 jitter trace에서 activation 변화 0. deliberate enter→exit trace는 정한 시간 안에 각각 1회 전이.
- feedback: contextual 렌더 결과만 바꾼 counterfactual에서 추천/활성 결과 동일; 원거리 pin 추가만으로 local candidate 자격을 얻은 항목 0. 자동 activation을 100 cycle replay해 seed/active가 연쇄 증가하지 않음.
- capacity: **16개 동시 effective-active를 최소 검증 가설**로 두고 32/64는 capacity probe로 측정한다. 16은 제품 상한·현재 달성 주장이 아니다. 1/2/4/8과 semantic budget을 동일하게 하고 실제 union·geometry·membership 차이를 함께 보고한다. 16개에서 gate를 못 맞추면 'capacity 확대 완료'로 보고하지 않고 원인·추가 slice 또는 명시 재결정을 남긴다.
- orientation/exploration: 미리 답을 고정한 5개 과업(현재 주제 파악, graph에서 관련 Collection 발견, pin 후 공유 사건 읽기, 무관한 자동 활성 끄기, 첫 catalog page 밖 목적지 검색)을 desktop/mobile에서 완료. 자동 E2E는 5/5 통과. 사용자 walk-through에서는 검색 escape 없이 contextual 발견 과업을 수행하고 Pinned/Contextual을 구별할 수 있는지 확인한다. 실제 사용자 검증 없이 이를 통과로 주장하지 않는다.
- relevance: 사전 검토한 10 context fixture(관련 6, 무관 2, empty/no-time 2)를 tuning/holdout으로 분리. 관련 holdout마다 허용된 Collection이 첫 5 후보 안에 최소 1개; 무관 context 자동 활성 0. no-time은 위치/연대를 발명하지 않고 명시된 adjacency 또는 browser 경로 사용. 설명 근거 ID 검증 100%. 수식은 tuning에만 맞추고 holdout 결과로 채택한다.
- accessibility/mobile: keyboard만으로 5개 과업 수행; touch 44px target·200% text·safe-area·portrait/landscape·reduced-motion·screen-reader 순서 확인. browser 닫기/뒤로가기/선택 focus 복구, pinch 시 오활성 0. viewport를 가리는 permanent sidebar 0.

### 9.3 병목을 분리하는 실험

World N, Collection C, union Event U, membership degree M, visible vertices V, semantic labels L을 독립적으로 변화시킨다. 같은 U/V에서 C만 증가하는 overlap fixture와 C에 따라 U/V도 증가하는 disjoint fixture를 둘 다 쓴다. no-op toggle·reused response·query-only·paint-only 대조를 사용하되 원래 end-to-end gate를 대체하지 않는다.

서버는 index/artifact bytes/object reads/parse/membership/edge 시간을, client는 fetch/parse/cache, geometry transforms/closure/label work, React commit, SVG nodes/paths, paint·frame, history/churn을 기록한다. label 없는 Geographic이 많아져도 layout/paint 비용이 남는지 확인한다. 장시간 heap은 가능한 브라우저 보조 관측과 실제 WebKit 한계를 분리한다.

모든 cap·threshold·시간값은 실험 설정으로 version 고정하고 raw 결과·실패·채택 이유를 보존한다. A4-B01 미해결은 그대로 표시하며 최종 성능 채택 전 해결 또는 명시 재결정이 필요하다. 빠른 prototype만으로 A5 완료 처리하지 않는다.

## 10. A4와의 경계·범위

| 항목 | A5 처리 |
| --- | --- |
| B01 지속 frame p95 미달 | 기존 backlog 유지. A5 동일 profile 비교·최종 판정에는 결합. 전체 원인 조사를 A5 첫 단계 선행으로 만들지 않음 |
| B02 region 반복 변환/closure | representation/HUD/capacity에 필요한 좁은 부분만 S2/S3 dependency로 승격. 무관한 최적화는 backlog |
| B03 실기기·메모리 미검증 | 모바일 사용성 검증과 실기기 체감 주장 전 증거는 S7과 연결. WebKit heap 미측정은 남기며 다른 수치로 대체 통과 금지 |
| semantic overload/비어 보이는 graph | A5 핵심 범위. 이중 밀도와 suppression으로 검증 |
| 8개 입력 제한·loader 재생성·첫 catalog page 한계 | 새 goal에 직접 필요한 A5 capacity/state/escape dependency |
| 고정 tile/다중 level·임시 cluster | 조건부 실험. 단순 방식으로 목표 달성 시 명시 보류 |
| 사건 검색·관계 필터·미배치 사건 접근 | 새 Graph UX 채택 후 하단 내비게이션 탐색으로 해결할 후속 작업. S1/Graph 실험의 대체 control 구현 의무에서 제외 |
| WebGL/3D·새 DB·canonical importance·account sync·새 history ontology | 제외 |
| 실제 역사 탐색 | 기존 공개 데이터 read-only A5 tuning. 신규 대량 입력·정본 보정은 A6 |

## 11. 기존 기준선과 충돌 및 갱신

| 기존 내용 | 새 결정/문서 처리 |
| --- | --- |
| A5-E1~E3: Composite/fade 대 cluster A/B, tile prototype을 중심으로 순서 정의 | 이 문서 S0~S7이 대체. representation capacity 우선, tile/cluster는 근거 기반 옵션. reader-performance-plan의 A4 이력은 유지 |
| 추천은 graph를 바꾸지 않는다는 이전 제안/암묵 전제 | Suggested는 영향 없음. Contextual Active는 명시된 자동 활성 정책에 따라 graph 참여. BR-003/TS-006에 둘의 구별 반영 |
| 선택 Collection 합집합으로 읽기 | 유지하되 선택 입력을 explicit intent + stable contextual에서 파생. 자동 추론으로 pins/off를 덮지 않음 |
| A3 UI 전면 보존 | 최신 사용자 승인으로 Island feature-off와 HUD/표현/입력 변경만 예외. drawer·URL·camera·identity·기존 기능 접근은 유지 |
| active Collection마다 모든 사건을 읽고 조작 | 현재도 label 생략은 있지만 interaction 결합이 남음. 활성/표현 분리 계약을 BR-003/TS-005/006에 명시 |
| 모두 OFF이면 빈 graph | 유지. auto도 pause하는 명시 동작으로 정의하여 자동 재진입 모순 해결 |
| A5 뒤 A6 역사 dogfood | A5 read-only UX tuning과 A6 신규 작성 검증 분리. 대량 입력 허가 아님 |
| 구현 상태 문서 'A5 비활성' | 'A5 planning 활성, implementation 비활성'으로 구분. 구현 진입·배포를 문서 수립과 혼동하지 않음 |
| 8개 engineering limit/첫 page 전체 선택 | 의미적 Collection cap이나 user pin으로 승격하지 않음. measured bounded capacity와 paged browser로 대체할 계획 |

CON-003와 CORE-MODEL의 World/Collection/Event/Narrative 의미는 변경할 필요가 없다. TS-002 canonical schema·TS-004 authoring policy도 변경하지 않는다. user intent·relevance는 읽기 UX 계약에만 추가한다. TS-006의 오래된 'D 단계' 표기는 A5 S5로 정정한다. CURRENT/IP-011/INDEX/AGENTS 및 reader-performance-plan은 이 계획을 단일 A5 실행 기준으로 연결한다. A4 evidence는 수정하지 않는다.

## 12. Risk·mitigation·자기검토

| 위험 | 대응 |
| --- | --- |
| HUD가 큰 ancestor를 역사 주제로 오인 | coverage는 후보 신호만, specificity·안정성·partial 근거, no-topic fallback·holdout |
| Graphic 밀도 확대로 탁한 화면/paint 과부하 | 독립 ink/vertex budget, 중복·full-viewport suppress, fill/contour 실험, paint 계측 |
| invisible target와 gesture 강탈 | 별도 interaction eligibility, Geographic primary target 0, stage gesture 회귀 |
| pins가 많아 조회/URL/메모리 폭증 | intent 유지 + bounded fair read/partial, budget 고정, 큰 selection 경로 검증; silent unpin 금지 |
| auto가 자기증폭·pin 연쇄 확장 | selection-independent anchor query, provenance/epoch, viewport 자격 gate, 반사실 대조 |
| inferred selection이 URL에 영구 고정 | explicit/derived 저장 분리, legacy URL 변환, history/restore 시험 |
| partial query가 false negative로 탈활성 | unknown과 irrelevant 분리, TTL·보류·수동 fallback, stale epoch 차단 |
| Island OFF에서 기존 기능 진입점이 없어짐 | 사건 검색·관계 필터·미배치 접근은 UX 채택 후 하단 탐색으로 이관. 초기 Graph 실험에서는 대체 UI를 강제하지 않음. Collection escape와 필요한 시간 기준 접근·flag rollback은 유지 |
| 과도한 기술 범위 | SVG+기존 Publication 재사용, tile/cluster/engine은 조건부 또는 제외, slice별 중단·채택 근거 |

자기검토 결과와 반영 사항:

1. picker 재포장 아님: Graph context → auto/geographic → 명시 pin 과업이 별도 exit이며 browser만으로 이 과업을 통과 처리하지 않는다.
2. user intent/system inference 분리: pin/off/auto pause를 독립 축으로 모델링했다.
3. activation/representation 분리: active는 eligibility 입력일 뿐 label 수를 강제하지 않는다.
4. semantic/geographic 분리: budget·paint·interaction 및 측정치를 따로 둔다.
5. suppression 유지: full-viewport와 descendant fade를 구별하고 기존 golden·exit를 유지한다.
6. feedback 방어: 화면에 나타난 결과 대신 독립 World anchor evidence를 쓰고 contextual counterfactual을 검증한다.
7. escape hatch: catalog 128개 이후까지 조회 가능한 browser/search, auto off, explicit exclusion을 포함했다.
8. Graph 우선: container 없는 HUD·최소 control, permanent sidebar 없음; control chrome 면적과 gesture 충돌을 검증한다.
9. 복잡도: representation capacity를 먼저 검증하고 단순 heuristic을 채택한다. tile/cluster나 계정 인프라를 선행하지 않는다.
10. 품질 exit: orientation·발견·pin·공유 Event 읽기·오판 회복과 holdout relevance·실기기 한계를 포함한다.

리뷰에서 발견해 수정한 누락은 (a) unpin과 off 차이, (b) 모두 OFF와 auto의 충돌, (c) empty bootstrap, (d) 기존 Island의 숨은 기능과 UX 채택 후 하단 탐색 이관 경계, (e) 첫 catalog page 밖 Collection, (f) loader/URL의 inferred state 혼합, (g) suggested hint와 실제 graph participation 구별, (h) 많은 pins의 starvation, (i) probe UI가 없는 장식 geometry의 접근 경로, (j) 사용자 검증을 자동 테스트로 대체할 위험이다.

정확한 HUD tie-break, semantic/graphic 수치 cap, ranking weight, 임시 activate 표면, 공간 힌트 위치/형태는 실험 결정사항이다. 이는 goal·meaning의 미정이 아니라 사전 기준을 둔 채택 절차다. 구현 첫 단위는 S0/S1이며 **S0/S1 실행을 시작했다**.

## 13. 이번 planning 작업 검증

최신 origin/main 조회·운영 health SHA 대조, 위 12개 질문의 코드 경로 조사, A4 증거와 고정 budget 대조, 변경 문서의 상대 링크 존재 검사와 `git diff --check`를 수행했다. 변경 대상은 이 계획을 포함한 Markdown 문서 12개이며 runtime 코드 변경은 없다. 신규 기능 테스트·성능 재측정·운영 브라우저/실기기 시험은 실행하지 않았다. commit/push/merge/deployment 및 운영 데이터 쓰기는 하지 않았다.

후속 사용자 정정(2026-09-28 10:16 KST): 사건 검색·관계 필터·미배치 사건 접근의 목적지는 UX 채택 후 하단 내비게이션 탐색이다. §1/6/8/10/12의 동시 대체 요구를 정정했고 전체 Collection escape hatch와 구분했다. 런타임 구현은 하지 않았다.

후속 사용자 확정(2026-09-28 10:19 KST): 첫 방문은 읽기 좋은 특정 맥락, pin은 다음 방문에도 유지. 한 번 이상 방문한 사용자는 기존 viewport 복원 로직을 유지하며 첫 방문용 초기화로 덮어쓰지 않는다. §3/S4/exit에 반영했다.
