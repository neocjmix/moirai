# A5 — 최적화 착수 전 상태 기준점

2026-09-28 23:25 KST 사용자 지시: 새 기능·최적화 설계 없이 현재 상태를 정합화하고 커밋한다. 이 문서는 관측 기록이며 최적화 계획이 아니다. 안정점은 재현 가능한 코드·증거·미해결 목록을 뜻하며 모든 기능·성능의 정상화를 뜻하지 않는다.

## 코드·운영·검증

- runtime/main: `bf8701e043d3dfa67a04cb25bd70e088e4396349` (#256), tree `99c509d2f3429b620aa072d31cb1e3ed1dcffdc0`.
- 시작 시 로컬 작업 tree는 main과 동일하고 미커밋 변경 없음.
- 공개 /__status의 application.commit_sha 일치, deployed_at `2026-09-28T12:39:21.511Z`, surfaces atropos/health/status 모두 ok.
- [CI 36423087955](https://github.com/neocjmix/moirai/actions/runs/36423087955): completed/success.
- [공개 iPhone 36423087941](https://github.com/neocjmix/moirai/actions/runs/36423087941): completed/success, 2 tests pass. 역사 사건 115는 segment이므로 실제 point 119(단종 영월 유배)로 assertion을 교정했다.
- [Post-deploy smoke 36423498717](https://github.com/neocjmix/moirai/actions/runs/36423498717): completed/success. 공개 status에는 같은 run이 running으로 남아 있다. 관측 상태 기록 불일치이며 이번에 runtime을 변경하지 않는다.
- 이번에는 공개 모바일 시험을 새로 실행한 것이 아니라 기준 SHA의 완료된 증거를 확인했다.

## 수정된 결함과 미해결

역사 6개 Collection 선택 시 shell 16-page budget에서 잘린 응답을 client가 끝으로 취급하던 결함은 #255에서 수정됐다. 동일 1330–1460년 viewport가 point 3→25, region 1→11로 복원됐다. #256은 모바일 assertion 교정이다. 로딩 속도나 모든 relation/hull support 완전성이 해결된 것은 아니다.

후속 30개 선택 조사: X -1000..1000, Y 186200..204400, width 390, height 730, scale .04, Revision 56. 시간은 단일 관측의 첫 요청 시작부터 누적한 client wall time이며 네트워크를 포함한다. cold/warm 통제 또는 server-only benchmark가 아니다.

| shell 응답 | 누적 초 | point 수 | region 수 | 다음 cursor |
| --- | --- | --- | --- | --- |
| 0 | 15.7 | 68 | 12 | 있음 |
| 1 | 27.4 | 70 | 10 | 있음 |
| 2 | 43.8 | 54 | 13 | 없음 |

수량은 중복 제거 전 응답별 수치이며 최종 화면 수량과 합산 비교하지 않는다. 별도 브라우저 관측에서 최종 point 105 / region 37이 표시됐다. 사용자 보고의 영구 빈 화면은 재현·원인 확정하지 못했다. client는 전체 continuation 완료 뒤 snapshot을 반영하므로 긴 대기가 남는다.

미해결: 여러 shell 응답 사이 관계선, 자식 페이지/좌표 부족 시 hull support, selection 변경 시 cache 교체, catalog 첫 128개, S2 200% text 검증, S3 capacity/latency, A4 sustained frame 및 실기기·메모리 증거. 원래 A4 기준은 [백로그](../../implementation/IP-011-A4-closeout-backlog.md)에 보존한다.

## 확인된 현재 구현

- 발행 시 World 좌표와 공간 트리를 만든다. 트리 level은 탐색 깊이이며 줌별 표현 LOD가 아니다.
- 선택은 내부 8개 batch, shell은 요청당 최대 16 page. client는 cursor를 따라 union하며 취소·정체·중복을 방어한다.
- Composite 응답은 worldBounds와 자식 ID를 포함하고 완성된 hull 꼭짓점을 전달하지 않는다. UI가 수신한 자식 point/하위 hull로 원형을 준비하며 support가 없으면 bounds를 사용한다. 전체 자식 좌표가 항상 수신되는 것은 아니다.
- hull 원형은 응답 단위로 준비하고 navigation에서 재사용한다. 화면 변환·표현 선택·SVG paint 비용은 별도다.
- raw immutable object cache와 요청 내부 Promise 재사용은 존재한다. 데이터량이나 특정 연산이 지배적 병목이라고 단정할 측정은 아직 없다.

근거 코드: `packages/graph-presentation/src/v5-spatial-index.ts`, `v5-spatial-publication.ts`; `apps/atropos-web/src/lib/v5-shell-reader.ts`, `v5-graph-read-loader.ts`, `publication.ts`; `apps/atropos-web/src/app/graph/v5/shell/route.ts`; `apps/atropos-web/src/urdr-port/src/components/graph-shell-world.ts`.

## 실행 경계

기준점 로컬 검증: 기존 loader continuation 8개, shell adapter 3개, Composite world geometry 3개 테스트 총 14개 통과. runtime 변경 없이 기존 회귀를 확인했다. 문서 상대 링크·diff whitespace·변경 파일의 일반 credential 패턴 검사를 수행한다. 전체 CI/모바일 재실행을 대신하는 성능 검증은 아니다.

신규 기능, 최적화 설계·구현, 데이터 추가·reset, 인프라 변경은 이번 범위가 아니다. Redis/Elasticsearch·타일·LOD·hull 사전 생성·점진 렌더링 제안은 채택되지 않았다. 별도 설계 문서나 미완성 구현을 추가하지 않는다. 제품 의미·World 좌표·카메라·suppression 계약은 보존한다.
