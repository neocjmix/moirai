# M4-D 시간 동작 특성화 기준선

이 문서는 [IP-002 Slice 1](IP-002-temporal-model-realignment.md#slice-1--기존-동작-특성화)의 결과다. 기준 application SHA는 `350920bbdb3928f34e406940b9d9f0d95f7e8c65`, 코드 기준선은 `52dc241aeb7d48d658c4fbb7465c8a1fd448928a`다. 아래 내용은 유지해야 할 제품 의미가 아니라 **교정 전 구현이 실제로 하는 일**을 기록한 golden characterization이다.

자동 기준은 `packages/projections/src/temporal-characterization.test.ts`와 `packages/domain/src/temporal-characterization.test.ts`에 있다.

| 사례             | 현재 M4-D 관찰값                                                                                                                                     | IP-002 목표와의 차이                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 연·월·일         | Placement의 safe integer 범위와 opaque `precision`·`display_label`로만 보존한다. Timeline은 calendar boundary를 계산하지 않는다.                     | Time System adapter가 lossless canonical string과 실제 calendar boundary를 소유해야 한다. |
| 밀리초           | epoch millisecond가 safe integer인 동안 numeric range로 왕복한다.                                                                                    | 좌표 형식과 해상도가 adapter 계약으로 검증되지 않는다.                                    |
| 피코초           | 전체 epoch picosecond를 `number`로 만들면 인접한 두 좌표가 같은 값으로 collapse한다. 현재 Change Plan schema도 coordinate를 safe integer로 제한한다. | canonical string으로 두 좌표를 byte 단위로 구분해야 한다.                                 |
| 상대 선후        | Placement 없이 `precedes`만 있는 Event는 `structural_order`와 rank로 투영되며 절대 날짜를 만들지 않는다.                                             | 보존할 동작이다. strict/non-strict/equality solver로 확장해야 한다.                       |
| 모순 cycle       | Timeline은 `timeline_cycle`을 진단하지만 현재 Change Plan validate는 `precedes` cycle을 거절하지 않는다.                                             | 신규 모델은 revision 증가 전 충돌 Relation과 함께 거절해야 한다.                          |
| Process Duration | descendant Placement의 최솟값·최댓값을 `durations`로 계산한다. Process 밖의 explicit `starts`·`ends` 경계는 Duration 근거로 사용하지 않는다.         | explicit boundary Duration과 descendant span을 서로 다른 projection으로 분리해야 한다.    |
| during-only      | `contains`가 없는 외부 Event는 Process descendant가 아니며 Process Duration 근거에도 들어가지 않는다. 별도의 during 의미는 계산하지 않는다.          | 비-membership 시간 제약을 계산하고 Atropos에서 구분해야 한다.                             |
| membership State | `starts`·`ends` Event의 numeric Placement와 identity component로 Subject, start/end와 Duration을 계산한다.                                           | 관계 구조는 보존하되 새 Time Event·solver 좌표를 사용해야 한다.                           |

이 기준선 테스트가 성공해도 새로운 시간 표현력이 통과한 것은 아니다. 특히 피코초 손실과 cycle validate 허용을 성공 조건으로 승인하지 않는다. 이후 slice가 해당 동작을 의도적으로 교정할 때 characterization 기대값과 이 문서를 같은 변경에서 갱신하고, [표현력 종단간 수용시험](TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md)으로 대체 근거를 남긴다.

## 로컬 golden semantic digest

아래 digest는 기준선 입력과 M4-D algorithm version으로 계산한 결과를 exact assertion으로 고정한다.

| 관찰                              | algorithm                | semantic digest                                                    |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| calendar precision numeric ranges | `m4-timeline-v1`         | `208255f1576982f823b6f5c0778568b12dc7451488adeea49fe9395eeeb8fca3` |
| picosecond collapse               | `m4-timeline-v1`         | `2595a59595dd672181dccd9d5af2654599e280471f5a6f8d66aaa32f272f9cd4` |
| relative-only order               | `m4-timeline-v1`         | `a1d44f6b9086dce50408a17edf68dc0ac5109a1fb8e7a8e61b5b353a654393f9` |
| precedes cycle diagnostic         | `m4-timeline-v1`         | `2a311e832284b8c8dd2a436d4f2cfaa06a4e84e32399dea630bbaf4559e3d325` |
| descendant-span Process duration  | `m4-process-v1`          | `346c32d594200419142443f9ea4d598007cdda64937cc811f9cf4ed6c50aaf33` |
| membership State duration         | `m4-state-membership-v1` | `ba18757afc8370df6599397c5521afa4f2e45f617bc11d6473751c15d62d38ca` |

## 배포 기준선 읽기

2026-09-05 읽기 전용 Clotho 조회에서 `Clotho Synthetic Observatory`는 current·target·served Revision `29`, projection `ready`였다. Revision `28` 조회도 가능했고, M4-D 배포 smoke `33942566968`은 application SHA `350920bbdb3928f34e406940b9d9f0d95f7e8c65`에서 Revision `28`의 작성→Publication→Atropos 경로를 통과했다. Slice 1은 이 World에 쓰지 않았다. 이 세션에서 접근 가능한 Clotho read 결과는 개별 artifact digest를 반환하지 않았으므로, 재현 가능한 artifact 기준은 위 로컬 golden semantic digest로 고정했다.
