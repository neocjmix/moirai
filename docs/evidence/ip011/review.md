# IP-011 자기검증 기록

문서/계약의 scenario review이며 runtime v5 테스트 통과 기록이 아니다. 같은 작성자가 아래 두 full pass를 수행했다. 별도 독립 agent 검토를 주장하지 않는다.

## Pass 1 — 실제 상태에서 초안으로

| 단계                       | 발견 / 반영                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Reconstruct                | main/PR/CI/Railway/v4 export 확인; CURRENT 기능 SHA보다 최신 docs 배포 확인                                    |
| Model                      | World reality, Collection selection, Event identity, 단일 Narrative, contains 파생 결정                        |
| Contradiction Search       | 기존 1..N membership은 selection과 충돌 → 0..N; Relation Canon scope도 별도 현실을 만들므로 World facts로 전환 |
| Scenario Test              | 계유정난 같은 ID에 2 primary, 임진왜란 수군 관점 본문 확인 → owner별 내용 보존 통합, 첫 Canon 선택 금지        |
| Minimality Test            | 새로운 composite type/importance/order/추천 링크/Claim ontology 불필요 → 기존 joins·Event·Relation 재사용      |
| Implementation Feasibility | v4 Narrative update는 owner 변경 불가, kind 정정도 제한 → versioned migration/관리 명령과 v5 동시 cutover      |
| Plan Consistency           | M5 뒤에 둔 scale·lifecycle 일부를 A1~A4로 이동; IP-007 완료 이력과 새 의미를 분리                              |
| Adversarial Review         | 정책 version echo가 이해 증명은 아님; machine invariant와 agent 결과 검증을 분리                               |

## Pass 2 — 처음부터 재검증

Reconstruct에서 world.get30/30/30 ready와 공개 status SHA를 재확인하고, Model→Contradiction Search에서 헌법·BR·journey·TS·계획을 다시 검색했다. 다음 문제를 수정했다.

1. JRN-001에 마지막 membership 강제가 남음 → Event0..N, Relation World ownership으로 수정.
2. JRN-005와 TS-010에 Collection별 사실/시간 해석이 남음 → 단일 World constraints와 selection으로 정정.
3. TS-002의 이전 temporal placement 표와 canonical kind가 새 계약과 충돌 → 제거; TS-010 virtual reference/capability 보존.
4. TS 인덱스·TS-001·TS-008에 JointJS와 낡은 M4-D 상태가 남음 → 현재 SVG와 실제 v4 상태로 정정. TS-009는 명시적 historical draft.
5. TS-008 초기500KB와 spatial1MiB를 같은 budget처럼 읽을 위험 → 초기 압축 artifact와 개별 viewport 응답으로 구분.
6. Collection 모두 OFF 또는 membership0 Event가 사라질 위험 → 빈 선택·직접 URL·World 검색·bounded neighbor 동작 정의.
7. visible children만으로 Composite를 판정할 위험 → World projection child count/partial, hidden containment 근거 유지.
8. A1 정책 필드를 strict v4에 조용히 추가할 위험 → v4 transition policy 조회와 격리된 v5 guard prototype을 분리, production enforcement는 A3.
9. policy 변경 후 이미 성공한 write retry를 거절할 위험 → 동일 ID/digest는 기존 결과 반환, 신규 write만 최신 정책 검사.
10. Canon별로 유효한 temporal graph를 union하면 충돌할 위험 → A2 World union constraint audit를 A3 blocker로 명시.
11. 엔티티 ID ENT-002를 의미가 달라진 Collection에 재사용할 위험 → ENT-002 superseded, ENT-021 신규 발급.
12. 새 자료 범위를 World 이름으로 정의하는 오류 → 같은 historical World ID 보존, coverage와 reality title 분리.

Scenario Test·Minimality Test·Implementation Feasibility·Plan Consistency·Adversarial Review를 수정 후 다시 수행한 결과는 아래와 같다. schema/data 이행 미실행과 미측정 latency는 명시적 실행 gate이며 숨은 설계 결정을 남긴 것이 아니다.

## Scenario matrix

| 시나리오                       | 기대 동작                                           | 반례 / 실행 검증                                                          |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 조선 초기·단종·계유정난        | 동일 World/Event, 여러 Collection, 단일 본문        | 두 primary를 하나의 본문으로 통합하되 정보·인용 보존 mapping 검사         |
| 임진왜란                       | 전쟁 contains와 육전/수군 Collection은 별개         | 수군 Collection 끄기가 전쟁 구성·시간·노량 본문을 바꾸지 않음             |
| 일본 전국시대                  | 실제 역사 World의 관측 coverage 확대                | 연도 attrs만으로 placement 금지, temporal bounds·공유 부산진 ID 유지      |
| shared Event                   | Collection ON/OFF·선택 순서와 무관한 node 하나      | World/Event key, 단일 drawer, 직접 진입/닫기 focus 회귀                   |
| Collection와 Composite overlap | selection overlay와 contains region 공존            | 같은 이름이어도 ID/타입 의미·동작을 합치지 않음; hidden child count 유지  |
| 실제 역사/삼국지연의/MCU       | 별도 reality identity, compatible time display 가능 | 삼국지 정사는 실제 역사 Collection; 시간축 일치로 Event merge 금지        |
| 매우 큰 World                  | index/shard/budget 기반 local read·discovery        | cold cache에서도 전체 World/Collection fetch 금지; root manifest도 paging |
| 오래된 agent                   | v5 cutover 후 missing/stale policy·v4 write 거절    | 자동 version 채우기 금지; recovery로 정책 조회/재계획; exact retry 예외   |
| 마지막 membership 제거         | Event·Narrative·Relation 유지                       | Collection 철회가 사건 삭제로 cascade되지 않음                            |

## 아홉 완료 질문 추적

| 질문                        | 답의 authoritative 근거                                             |
| --------------------------- | ------------------------------------------------------------------- |
| World/Collection/Event 경계 | CON-003, CORE-MODEL BCR-001/002/004와 위 실제 사례                  |
| Collection/Composite 차이   | BCR-004, TS-002.7, TS-006.6                                         |
| Event 재사용                | World-owned IDs, 153 memberships/26 shared 관측; TS-002.13          |
| Narrative ownership         | CON-003.6, TS-002.9; IP-011 160→133 보존 계획                       |
| read 확장 경로              | TS-006.2~7, A1 계측/A4 bounded cold gate                            |
| agent 품질 경로             | BR-001.10, TS-004 policy API/3층/version guard/acceptance           |
| 문서 계층 정합              | IP-011 authority map, superseded historical plans, 이번 2-pass 정정 |
| 유지 vs migration           | reconstruction code map, data-audit IDs, IP-011 §5                  |
| 다음 실행 순서·exit         | A1→A2→A3→A4→A5→A6→M5; 구현 비활성                                   |

## 검증 범위

이 PR은 문서만 변경하므로 runtime unit/E2E·migration을 실행한 것처럼 보고하지 않는다. local Markdown format, 변경 파일 링크·whitespace, diff review, secret scan으로 문서 전달을 확인한다. 실제 World union satisfiability, owner-full migration, performance profile, v5 acceptance는 A1~A4의 필수 미완료 gate다. unresolved target semantic contradiction은 현재 검토에서 발견되지 않았지만 운영 이행 완료를 뜻하지 않는다.

전달 검증: 변경 Markdown 53개를 ignore override로 format했고 파일 링크 검사에서 누락0을 확인했다. 재구성 과정의 오래된 section 링크5개도 현재 문서 참조로 정리했다. Gitleaks는 evidence 디렉터리 검사에서 누출0이며 push 전 staged diff 전체도 검사한다.
