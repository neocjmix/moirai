# IP-011 A4 — 실행 기록 (진행 중)

## 시작 기준선 — 2026-09-25

- main 및 공개 `/__status` SHA `72377e3563a88760e00f06cfe9cdf996fd829689`; contract 5, schema 011, v5 Publication, smoke passed (`36121610532`). Railway production의 web/API/worker/Postgres 모두 SUCCESS이며 pending work는 없다.
- 운영 `/graph/v5?world=01995c2a-7b00-7000-8000-000000000101`의 server-rendered catalog는 `servedRevision:32`, `buildRevision:v5:…:32`. Live MCP catalog의 `world_get` 호출은 `unknown_tool`을 반환했으므로 canonical DB의 *현재* Revision은 별도로 인증 확인하지 못했다. 이 단계에서는 운영 DB를 변경하지 않았다.
- A3 UI 복원 SHA `9ff100d`, 증거 SHA `9dbdd99`. 이번 slice는 UI, renderer, layout 알고리즘 및 canonical data를 변경하지 않는다.

## 재현 가능한 첫 v5 profile

`node --import tsx scripts/ip011-a4-profile.ts 1000 sparse` (각각 10000/100000). `A4_PHASES=1`은 projection/layout/spatial index/content 단계별 추가 실행, `A4_COMPLETE=1`은 완전 Publication과 completeness proof를 측정한다. 합성 World Revision 31, Gregorian, 두 Collection, 12개 국소 Event는 1453년, 나머지는 2000–2019년에 있다. 동일 viewport `x[-724,-721], y[203419,203422]`. Ubuntu가 아닌 로컬 Node 24.19.0, 메모리 object store, 무제한 네트워크 지연 0. 아래 수치는 A1의 Ubuntu/PostgreSQL 17/20 cold·50 warm/iPhone profile을 대체하지 않는다.

| scale | v5 spatial staged build | temporal | layout | content | fixed viewport reads/bytes | local Event 0의 X | fixed viewport shapes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1k sparse | 1.11 s (단계 추가 계측 실행) | 135 ms | 388 ms | 37 ms | 8 / 217399 B | −722.780 | 1 |
| 10k sparse | 83.16 s (단계 추가 계측 실행) | 1149 ms | 39542 ms | 312 ms | 9 / 315635 B (완전 빌드 후) | −774.400 | 0 |
| 100k sparse | 완전 빌드 120 s 제한 초과 (exit 124) | — | — | — | 측정 전 중단 | — | — |

단계 추가 계측이 없는 10k staged build는 43.58 s. 1k 완전 빌드는 1.12 s, 중복 레이아웃 재계산 제거 후 10k 완전 빌드는 49.12 s, RSS 545 MiB, 40.80 MB artifacts, 50196 documents + 397 digest index nodes. 10k 동일 고정 viewport 응답은 49 B이고 선택 결과가 비어 있다. local Event의 Y는 두 규모 모두 203420.248이지만 X가 51.62 이동했다. 이는 먼 데이터 추가에 따라 World force placement가 바뀐 결과로 보이며, 같은 국소 질의의 identity/geometry 안정성과 100k worker 예산은 실패 위험이다. 현재 프로파일은 매 측정에 새 객체를 읽고 digest를 확인하지만 OS/process cold samples, API/HTML, DB rows/history replay, browser frame은 포함하지 않는다.

## Slice 1: 완전 Publication에서 재계산 제거

`buildV5WorldCompleteArtifacts`가 공간 staged tree 생성에 사용한 시간 projection과 레이아웃을 completeness proof에 다시 계산하지 않고 재사용한다. 원래 동일 `state`, `revision`, `time_system_id`에 대해 호출했던 함수의 반환값만 공유하며, artifact key·digest·레이아웃 좌표·검증 반복 및 served pointer 조건은 그대로다. 10k의 단계별 계측에서 layout 한 회가 39.5초로 가장 컸다. 이 slice는 worker CPU의 반복 계산을 제거한다. 완전 10k build ≤180s/≤3GiB는 이번 실행에서 통과했다. 100k, 20 cold/50 warm, dense/large Collection, 모바일 600 frame, authoring query 및 restart/cancel은 **미검증**, A4 exit 미완료다.

다음 slice는 대형 World에서 레이아웃의 제곱 비용과 국소 좌표 드리프트를 원인별로 줄이고, 1k/10k/100k의 고정 질의를 동일 좌표/선택으로 검증해야 한다. 원격 push는 자동 승인 검토에서 두 차례 거부됐다. 두 번째 거부 전 사용자 지정 URL과 Git remote 일치, 연결된 GitHub 저장소의 관리자·push 권한을 확인했지만 검토기는 공개 목적지로의 코드·증거 게시가 승인되지 않았다고 판단했다. 따라서 이 변경은 로컬 commit에만 있고, CI·모바일 회귀·배포 후 smoke는 아직 실행되지 않았다. 해당 gate를 완료 증거로 사용하지 않는다.
