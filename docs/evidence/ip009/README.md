# IP-009 임진왜란 구축 기록

World: `01995c2a-7b00-7000-8000-000000000101` (`early-joseon`). 기존 50개 Event와 세 Canon을 모두 조회한 뒤 새 사건과의 겹침이 없음을 확인했다. World 제목·설명만 변경하고 ID/slug를 유지했다. 이 write path는 PR #122에서 history, revision, idempotency, outbox를 포함해 구현하고 전체 CI 및 Railway 세 서비스 배포를 거쳤다.

## 재현 가능한 공개 원고

`scripts/history/imjin-data.py`는 57개 사건·묶음과 검토한 출처 목록이다. `imjin-plans.py`는 최대 100 operations 안의 11개 단계별 v4 ChangePlan을 생성한다. `imjin-enrichment.py`는 날짜 주석·난중일기 reference 보강과 해상전 Canon의 기존 Event 재사용 계획을 만든다. Python `korean-lunar-calendar==0.3.1`이 필요하다. scripts는 네트워크·credential을 사용하거나 commit하지 않는다.

모든 단계는 Moirai Live `change.validate` → `change.commit` → revision을 고정한 실제 readback을 거쳤다. 변경 전 World export에서 동명·유사 사건을 확인했다. 입력은 공개 역사 서술이며 원문을 장문 전재하지 않았다.

| Revision | 변경 |
| --- | --- |
| 11 | World 범위·제목·설명 확대 |
| 12 | 임진왜란 Canon 및 기존 Time System 연결 |
| 13–14 | 전쟁/침공 Composite, 부산진·동래·상주·충주, 왕실 이동·한양·평양 |
| 15 | 1592년 수군 전선 |
| 16–17 | 의병·관군·명군·평양 탈환·벽제관·행주 |
| 18 | 강화교섭·한양 수복·진주 2차·훈련도감·교섭 결렬 |
| 19–20 | 정유재란·칠천량·복귀·남원·직산·명량·울산 |
| 21–22 | 1598년 연합 작전·철수·노량·이순신 전사 |
| 23 | 전쟁 전야의 사절과 원정 동원 |
| 24 | 본문과 분리한 날짜/사료 주석, 난중일기 링크, Canon 서문 |
| 25 | 해상전 Canon: 11 atomic Event 재사용, 새 관점 Narrative, 별도 Composite |

## 날짜와 사료

선조실록의 침공·지휘관 교체·칠천량·노량 기사, 선조수정실록의 평양 탈환 기사, 김성일의 진주 보고, 난중일기의 사천·당포·명량 기록을 검토했다. 난중일기는 국사편찬위원회의 해당 날짜 번역·인용과 해설을 통해 대조했으며 중앙정치의 직접 관찰 사료로 사용하지 않았다. 훈련도감에는 징비록 번역 자료를 연결했다. 개별 전투는 한국민족문화대백과사전과 우리역사넷의 연구 해설로 교차검토했다.

원 음력 날짜를 attributes에 보존하고 Gregorian half-open 지식 범위를 관계로 표현했다. 0.4.0으로 처음 계산한 날짜는 0.3.1로 전부 재계산하여 같은 결과임을 확인했다. 날짜 변환은 계산상 대응이며 사료 원 날짜와 구분한다. 상주·충주 및 명량의 날짜 차이는 좁은 범위로 남겼다. 실록의 기사일을 그 안에 서술된 전투일과 동일시하지 않았다. 출처 상충과 달력 검증 주석은 annotation으로 분리했다.

전체 전쟁의 exact Duration을 창작하지 않았다. contains로 묶은 사건의 알려진 날짜 범위와 실제 지속시간은 구별한다. 하위 사건이 모두 dated일 때에도 중첩 Composite의 descendant span이 unresolved가 되던 projection 결함을 실제 데이터로 재현했고 회귀 검사와 함께 수정했다.

최종 publication/구조/브라우저 검증 결과는 이 디렉터리의 후속 evidence에 기록한다.
