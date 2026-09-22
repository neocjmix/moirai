# IP-011 실제 상태 재구성 — 2026-09-22

## 관측과 authoritative state

| 표면           | 직접 확인한 상태                                                                                    | 판단                                           |
| -------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Git clone main | `05ebf3b27794e60d734a885cc428a30104118896` (#128)                                                   | 이 조사 기준 코드                              |
| GitHub PR      | #121~128 merged, open PR 검색 결과 0                                                                | 새 계획과 경쟁하는 open PR 미발견              |
| #128 head CI   | `abbeb592af5487425d72a660cb748adad7860483`, CI 35730583888 success                                  | 기존 CI 근거, 이 문서 branch CI와 구분         |
| Railway        | Atropos/Clotho/worker 세 서비스 latest SUCCESS, commit `05ebf3b…`                                   | CURRENT의 bf963161 기능 SHA 기록보다 최신 배포 |
| Moirai Live    | complete world_export revision30, contract_version4; world.get current/target/served 30/30/30 ready | 현재 public authoring/data 기준                |
| 기존 CURRENT   | IP-004~010 complete, M5 inactive                                                                    | 완료 이력 유지; 새 실행 baseline A0            |

Railway deployment IDs: Atropos `d6cdfdc6-a5ed-4565-bb70-0862481a7472`, Clotho `7e327245-1a3d-40f3-a6b4-e3568736548c`, worker `56ab6904-3459-47aa-a90a-805c0dd5d880`. Postgres도 SUCCESS다. 0 changes인 오래된 staged patch 하나가 보이며 적용하지 않았다.

현재 운영 권위는 조회된 v4 코드/배포/데이터, 목표 제품 의미 권위는 개정한 CON→BR→TS다. 이 차이는 IP-011 A1~A4의 명시적 이행 범위다. acceptance 문서를 수정했다고 runtime이 바뀐 것은 아니다.

## historical World snapshot

World `01995c2a-7b00-7000-8000-000000000101`, slug `early-joseon`, title `동아시아사 — 조선과 일본`.
6 Canon, 127 Event, 153 Event memberships, 415 Relation, 477 Relation memberships, 160 Narrative, 1 Time System. 상세 IDs는 [data-audit.json](data-audit.json).

- 101 atomic / 26 composite; contains143; kind와 contains 유무 불일치0.
- shared Event26. 계유정난은 동일 ID `019f5b00-0000-7000-8000-000000000115`, Canon별 primary 2개.
- Event Narrative155, Canon Narrative5; primary136/summary2/annotation22; locale ko만 관측.
- 17 Event에 cross-Canon Narrative. 본문 없는 Event12, Collection 후보2(조선 전기 연표/임진왜란 수군).
- exact title duplicate0, 동일 type/endpoints/direction/attributes Relation duplicate0. 의미적 중복 부재를 입증하지 않음.
- World coverage 확장이 reality 변경으로 표기됐던 metadata와 문서 전제를 바로잡아야 함.

## 코드 경로와 불일치

| 경계 / 근거 파일                                         | 관측                                                                                | target 영향                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| persistence migrations006–009                            | Event/Relation World ownership과 N:M, 마지막 membership 강제                        | 기존 join 재사용; zero membership 허용; Relation 적용 scope 제거 |
| contracts/domain / TS-002 기존                           | Event.kind, Narrative.canon_id와 scope, Canon별 endpoint/time 검증                  | 문자열 rename으로 해결 안 됨                                     |
| `packages/persistence/src/clotho-query.ts`               | bounded query 전 readWorldAtRevision 호출                                           | 작은 응답도 내부 비용 World history에 비례할 수 있음             |
| `packages/persistence/src/index.ts::readWorldAtRevision` | World의 revision 이하 change_operations 전체 읽기·fold                              | authoring 검색·read의 indexed current/history query 필요         |
| `apps/clotho-api/src/mcp.ts`                             | 긴 inline instructions; share 시 temporal Relation membership도 수동 공유           | policy API/version guard 부재; Japan 재발 메커니즘               |
| `apps/atropos-web/src/lib/graph-revision-source.ts`      | manifest에서 World의 canons/subjects/temporal/scope-overview 모두 read·digest·parse | cold World materialization; root manifest도 전체 문서목록        |
| `graph-publication-loader.ts`                            | readGraphRevision 뒤 최대8 World/32 Canon catalog 절단                              | response count 제한이 선행 비용 제한은 아님                      |
| `graph-spatial-query.ts`                                 | max_entities/relations/evidence MAX_SAFE_INTEGER로 compose 후 presentation          | selected graph 전체 구성; LRU4/128MiB는 규모 독립 해결 아님      |
| `urdr-port/src/moirai-spatial-reader.ts`                 | bands·cache·MAX_CELLS2500/bytes1MiB/object reads256                                 | 유지할 seam; upstream materialization은 별도                     |
| `graph-revision-source.ts::readGraphEventNarratives`     | detail on demand 후 canon_id filter                                                 | 좋은 lazy read 보존, 단일 owner로 filter 제거                    |
| source selection/plane composition                       | Canon별 geometry·offset 합성 후 shared ID dedupe                                    | 사실 시간·좌표를 Collection 선택에 의존시키지 않기               |
| 기존 UI·IP-007                                           | shared node 하나 + Canon별 Narrative section                                        | node 재사용 보존, section ownership 폐기                         |

worker publication build와 projection, graph query/presentation, spatial reader, browser retained viewport를 분리해 측정한다. 이미 bounded payload/cache/reader continuation이 있으므로 “매 pan마다 브라우저가 World 전체를 fetch한다”는 단정은 하지 않는다. React commit·layout CPU·cold/warm latency의 실측 원인 순위는 아직 없다. A1 trace/profile로 밝혀야 한다.

## 조사 한계

content export는 owner-full operational history/withdrawn rows/Subject handles/correspondence 목록을 대체하지 않는다. 실제 DB applied migration 표는 미조회이며 코드 migrations로만 구조를 확인했다. 이 제한은 A2 mandatory inventory gate다. 이번 작업에서 runtime/schema/production canonical data를 변경하지 않았다. 외부 역사 자료의 사실성 전수 재검증은 A6 별도 작업이며 이번 통계는 서비스 데이터 감사다.

추가 live 확인: world.list(limit100)는 접근 가능한 World1개, truncated=false를 반환했다. 이는 전체 설치의 비접근 World가 없다는 증거는 아니다. Atropos `/__status`는 commit `05ebf3b…`, contract4/publication3.0.0과 surface ok를 반환했다. smoke 필드는 running으로 남아 있어 최종 success로 보고하지 않는다. Clotho `/__status`는404이며 Railway SUCCESS·Live 조회 성공과 구분한다.
