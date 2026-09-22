# IP-009 임진왜란 실제 역사 검증

World `01995c2a-7b00-7000-8000-000000000101`의 제목은 **조선사 — 건국에서 임진왜란까지**다. 기존 `early-joseon` slug를 유지하여 URL/API 호환성을 보존했다. World metadata 수정은 PR #122의 공식 v4 ChangePlan 경로로 수행했으며 직접 DB 수정은 없었다.

## 구축 범위와 보존

| 항목 | 임진왜란 두 Canon의 합집합 | World 전체 |
| --- | ---: | ---: |
| Canon | 2 | 5 |
| 고유 Event | 58 | 108 |
| atomic / Composite | 46 / 12 | — |
| Narrative | 89 | 140 |
| Relation | 195 | 359 |

주 Canon **임진왜란 — 침공에서 노량까지**는 57개 Event, 해상전 Canon **임진왜란 — 수군과 해상 보급로**는 12개 Event다. 해상전 Canon의 atomic 11개는 주 Canon의 기존 World Event를 membership으로 재사용한다. 새로 만든 것은 관점에 따른 Composite 하나와 Canon별 서술이다.

Revision 10의 기존 Canon 3개, Event 50개, Relation 164개, Narrative 51개, Time System 하나는 내용과 ID가 모두 보존됐다. 제목 중복 검사와 부산진/부산포, 평양 점령/수복, 진주 1·2차, 노량 전투/이순신 전사 등의 의미 비교에서 동일 atomic 사건의 중복은 발견되지 않았다.

## 구조와 서술

최상위 전쟁 → 9개 흐름 Composite → atomic Event의 3단계 구조다. 전쟁 전야는 별도 Composite로 두어 1592–1598 전쟁 자체의 범위를 부풀리지 않았다. 침공·왕실 이동·수군·지역 항전·명군 반격·교섭·정유재란·1598년 작전·철수가 병렬 또는 교차 연결된다.

195개 Relation은 contains 66, not_after 46, precedes 69, influences 10, enables 3, causes 1이다. precedes 중 46개는 날짜 상한 관계이고, 실제 Event 간 선후관계는 23개다. 주 Canon의 contains는 55개이며 순환이 없다. atomic 쌍 1,035개 중 988개에는 authored precedes 경로가 없다. 같은 날짜의 한산도와 이치도 임의로 순서를 매기지 않았다.

Narrative는 primary 70개와 annotation 19개다. primary 본문은 총 25,003자이며 최소 255자다. 단종 Canon의 기존 primary 총 895자와 비교해 전선·맥락·전개·결과를 훨씬 풍부하게 서술했다. primary의 작성 과정·QA·일반 면책 문구 검사는 0건이었다. 사료 링크는 37개 고유 URL이며 모든 Narrative에 reference가 있다.

## 날짜와 주요 사료

22개 atomic Event는 하루 범위, 24개는 사료에 맞는 기간 또는 불확실성 범위다. Gregorian Time System의 일 단위 경계를 사용하고, 원 음력 날짜와 변환 정보를 attributes에 보존했다. 상주·충주와 명량처럼 날짜가 충돌하는 경우 범위를 남겼다. 알려진 날짜 범위와 실제 사건 지속시간을 혼동하지 않는다.

- 선조실록: 침공, 지휘관 교체, 칠천량, 노량 및 이순신 전사 보고.
- 선조수정실록: 평양성 수복 경과. 김성일의 진주 보고도 대조했다.
- 난중일기: 국사편찬위원회의 사천·당포·명량 일자별 번역·인용과 해설. 중앙정치의 직접 관찰 사료로 확장하지 않았다.
- 징비록: 훈련도감 창설 관련 번역 자료.
- 우리역사넷·한국민족문화대백과사전: 개별 전투와 외교·군제의 연구 해설.

원고와 링크 목록은 `scripts/history/imjin-data.py`, 단계별 계획 생성기는 `imjin-plans.py`와 `imjin-enrichment.py`에 있다. 최종 revision 26의 서문 보강 계획은 `plan-14-final.json`이다. 생성기를 실행해도 네트워크 요청이나 데이터 쓰기는 일어나지 않는다.

## 수정한 시스템 문제

1. World 제목·설명의 공식 write capability 부재: 기존 권한, revision, history, idempotency, outbox 경로에 v4 update를 추가했다. slug/identity는 고정한다.
2. 중첩 Composite 후손 범위가 unresolved: populated Composite의 후손을 추적하도록 수정했다. 빈 Composite/날짜 없는 atomic은 여전히 unresolved이고, 실제 Duration은 창작하지 않는다. 공개 projection v2에서 주 Canon의 11개 descendant span을 확인했다.
3. 직접 URL의 Canon 범위 무시·중복 시간 설명: World Event를 한 번 읽고 명시적 Canon을 적용한다. 여러 Canon을 보여 주는 상세 링크는 임의의 첫 Canon으로 축소하지 않는다.
4. 공유 Event의 빈 viewport: bootstrap·navigation·spatial reader가 같은 World Revision plane offset을 사용하도록 통일했다.
5. 이전 camera와 drawer 복원 경합: 새 사건 URL은 해당 사건에 초점을 맞추며 명시적 URL viewport는 보존한다. 사용자 stage 조작을 우선하고 페이지 이동 시 남은 요청을 취소한다.

6. Canon별 실제 배치가 다른 공유 Event의 모바일 초점 이탈: bootstrap도 선택된 전체 source의 dedup 결과를 사용한다. 서로 다른 Canon 관계로 생성한 실제 artifact의 회귀 검사에서 구 구현 실패·수정본 성공을 확인했다.

## Publication과 실행 검증

Moirai Live와 공개 artifact에서 current/target/served **26**, projectionStatus **ready**, `event-relational-projection/2`를 확인했다. Revision 26의 구조·보존 검사는 `audit-revision26.json`, Composite 계산 결과는 `projection-revision26.json`에 있다.

PR [#122](https://github.com/neocjmix/moirai/pull/122), [#123](https://github.com/neocjmix/moirai/pull/123), [#124](https://github.com/neocjmix/moirai/pull/124), [#125](https://github.com/neocjmix/moirai/pull/125)에서 공식 쓰기 경로와 실제 E2E로 드러난 결함을 수정했다. PR #124 배포 후 강화된 acceptance는 desktop 두 건과 mobile overview는 통과했으나 mobile 공유 Event focus는 실패했다. 이를 완료로 처리하지 않고 #125에서 수정했다.

PR #124의 CI(타입·lint·unit·DB 통합·빌드·dependency/secret 검사와 기존 모바일 flow) 및 100/1,000/10,000 Event reader 회귀가 통과했다. 기능 commit은 `53418d297dd74594cd7fbe0ce80a47e1c37a53a3`이다. 최종 모바일 focus 보완은 #125의 기능 commit `ebea433cdc8a66e767c253b8fb15e9a988c6ece5`로 세 Railway 서비스에 배포했다.

배포 후 [CI 재실행](https://github.com/neocjmix/moirai/actions/runs/35713592786)의 job `106701098724`에서 실제 Publication을 대상으로 **iPhone 2건·desktop 2건, 총 4/4 통과**했다. 기존 mobile fixture는 25건 통과·기존 조건부 1건 skip이다. [공개·인증 smoke](https://github.com/neocjmix/moirai/actions/runs/35714013300)는 해당 기능 SHA에서 모두 통과했다. [100/1,000/10,000 reader 회귀](https://github.com/neocjmix/moirai/actions/runs/35712081390)와 최종 타입·unit·DB 통합·빌드·audit도 통과했다. 판정과 artifact digest는 `acceptance.json`에 보존했다.

[전체 전쟁 화면](atropos-imjin-overview.jpg)과 [iPhone의 두 Canon 서술](atropos-hansan-mobile.png)은 최종 배포본의 실제 화면이다. 전체 화면은 1592년 밀집 구간을 확대해서 탐색하는 용도다.

실행 URL: [임진왜란 최상위 사건](https://moirai-production-8ed1.up.railway.app/graph/events/01995c2a-7b00-7000-8000-000000000101/019f8c00-0000-7000-8000-000000001000?canon=019f8c00-0000-7000-8000-000000000100), [두 Canon의 한산도 서술](https://moirai-production-8ed1.up.railway.app/graph/events/01995c2a-7b00-7000-8000-000000000101/019f8c00-0000-7000-8000-000000001017?revision=26).

## 표현력 검증 결과

| 질문 | 실제 데이터와 검증 근거 |
| --- | --- |
| 동시·병렬 사건 | 같은 날짜의 한산도/이치에 순서를 만들지 않고 해전·육전 흐름으로 나눴다. 여러 x/y 위치를 실제 viewport에서 검사한다. |
| 부분적 선후관계 | Event 간 precedes는 23개이며 전체 atomic 쌍 대부분을 임의로 비교 가능하게 만들지 않았다. |
| 중첩 Composite | 전쟁 → 전선/국면 → 개별 사건의 3단계 contains, 순환 0개, 11개 Composite의 공개 descendant span이 후손 범위와 일치한다. |
| 흐름 간 합류 | 지휘관 교체·수군 패전/재건·명군 참전·교섭 실패·철수에서 원인/영향/조건 관계가 서로 다른 흐름을 연결한다. |
| Event 재사용 | 해상전 Canon의 atomic 11개가 주 Canon과 동일 ID다. DOM의 Event point ID도 중복되지 않는다. |
| Canon별 Narrative | 한산도의 한 drawer에서 두 Canon 제목과 별도 primary를 읽으며 명시적 Canon URL은 해당 서술만 읽는다. |
| 수십 개 Event UX | 57개 주 Canon Event의 탐색·검색·drawer·직접 URL을 desktop/WebKit iPhone에서 검사한다. 100/1,000/10,000 synthetic reader 회귀도 통과했다. |
| 사료/서술 분리 | primary 70개와 annotation 19개를 분리했다. 출처는 기본 접힘 영역이며 사용자가 펼치면 링크가 보인다. |

## 남은 한계

전쟁의 주요 전개를 다룬 선별된 역사 corpus이며 모든 소규모 교전·지역 피해·전후 복구를 망라하지 않는다. 일본·명 측 원사료 전체와 난중일기 원본 전체를 새로 교감한 작업은 아니다. 날짜 충돌은 좁은 범위와 별도 주석으로 남겼다. 전체 전쟁 화면에서는 1592년 사건이 밀집하므로 확대·이동·검색을 함께 사용한다.
