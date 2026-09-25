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

사용자의 명시적 공개 게시 승인 후 PR #199를 병합했다. main·web/API/worker 배포 SHA `50ca35b6bf1edd0fb2cd1210c0c896f79cfb012e`; CI `36143207267`의 quality/PostgreSQL/build/audit, 모바일 WebKit, secret scan 모두 성공. main CI `36143570996`와 post-deploy smoke `36143860264`도 성공했다. 공개 readiness·운영 iPhone WebKit·인증 v5 authoring/policy probe를 포함한다. [PR #199 release comment](https://github.com/neocjmix/moirai/pull/199#issuecomment-5833684995)에 배포 증거를 남겼다. 이전 push 차단은 승인 후 해소됐다.

## Slice 2: 동등한 후보 군집 탐색

10k 레이아웃 단계별 계측에서 후보 군집화 21.96초, X force 17.01초였다. 전체 후보를 매번 다시 훑는 군집 BFS를 동일 interval-key와 직접 제약의 이웃 인덱스로 교체한다. 동일 입력 순서의 방문 및 결과는 유지한다. 후보 상세 조회도 ID Map으로 바꾼다. 1k·10k sparse에서 수정 전후 **전체 레이아웃 digest** 각각 `8b87de4f…d80540e2c`, `b53c16ab…4d65428e769`로 일치했다. 10k 레이아웃 39.47→18.59초, 완전 Publication 빌드 49.12→27.65초 (RSS 534 MiB). 10k의 fixed viewport 9 object reads/315635 B와 좌표 이동 문제는 그대로다. 기존 URDR 화면과 v5 geometry는 변경되지 않았다.

다음 slice는 X force의 제곱 비용과 국소 좌표 드리프트를 해결해야 한다. 100k, 20 cold/50 warm, dense/large Collection, 모바일 600 frame, authoring query 및 worker cancel/restart는 여전히 A4 exit에 필요한 미검증 영역이다.

Dense 1k 첫 페이지는 16 Event·continuation, 38 object reads·935367 B였다. 같은 300개 국소 Event와 viewport를 유지한 10k dense 첫 페이지는 16 Event·continuation이지만 57 reads·1793805 B로 **1 MiB 예산을 위반**했다. 중복 digest-index page 조회가 누적된다. 별도 shared-membership/large-Collection 1k 첫 페이지는 각각 10 reads·264488 B, 8 reads·220749 B. 이 수치들은 로컬 메모리 store의 첫 읽기 3회 중 첫 시료이며 20 cold/50 warm p95 gate가 아니다.

PR #200 병합 main/배포 SHA `1641c63426eba812d284adee7d495d077082b399`; PR CI `36146100222`, main CI `36146498579`, post-deploy smoke `36146869881` 모두 성공. Railway web/API/worker 정상이고 운영 iPhone WebKit·인증 v5 authoring smoke가 통과했다. [PR #200 release comment](https://github.com/neocjmix/moirai/pull/200#issuecomment-5833999838).

## Slice 3: 요청 범위 immutable object 재사용

한 viewport 조회에서 digest-index page, Collection detail, spatial shard 및 membership posting의 동일 object key를 다시 요청하지 않도록 Promise를 한 query 범위에 저장한다. 실패·404도 해당 요청에서만 공유하고 각 참조의 digest 검증은 계속 수행한다. 응답의 Event/continuation/Revision은 변경하지 않는다.

| Synthetic fixed query | 수정 전 reads/bytes | 수정 후 reads/bytes | 결과 |
| --- | ---: | ---: | --- |
| 1k dense, 300 local | 38 / 935367 B | 21 / 127892 B | 16 Event, continuation |
| 10k dense, 같은 local | 57 / 1793805 B | 23 / 228464 B | 16 Event, continuation |
| 10k very large Collection, 10000 members | 미측정 | 7 / 225830 B | 좌표 드리프트로 0 Event |

이 결과는 로컬 메모리 store 측정이다. 동일 query의 index+artifact 1 MiB 기준은 dense 1k/10k 첫 페이지에서 통과하지만, 운영 cold 20회와 100k는 아직 측정하지 못했다. 큰 Collection의 0 Event는 성공 증거가 아니라 레이아웃 좌표 이동의 재현이다. A4 exit는 미완료다.

PR #201 병합 main/배포 SHA `ce1da34331c9135b889d9b68e24d2a654103c4d3`; PR CI `36147301799`, main CI `36147721477`, post-deploy smoke `36148100807` 모두 성공. Railway web/API/worker SUCCESS. [PR #201 release comment](https://github.com/neocjmix/moirai/pull/201#issuecomment-5834175359).

## Slice 4: 큰 World의 시간 인접 X 반발 범위

기존 X force는 모든 movable Event를 서로 비교해 10k에서 17초가 걸렸고, 원격 Event 증가만으로 국소 좌표가 변했다. Event가 500개보다 많을 때만 시간순으로 가까운 양쪽 24개씩, 10년 안의 이웃에게 반발력을 계산한다. 직접 관계의 attraction, anchor, 나머지 배치 과정은 유지한다. 작은 World에는 기존 force 경로와 `v5-world-layout/1`을 그대로 적용한다. 큰 World는 immutable artifact manifest에 `v5-world-layout/2`를 기록한다. 600개와 1200개 원격 Event 입력의 국소 geometry 동등성 테스트 및 기존 URDR 스냅샷을 통과했다. 500→501 전환에서는 좌표가 달라질 수 있으므로 새 Revision의 artifact를 따로 만들어야 한다.

Node 24 로컬 메모리 object store, 합성 Revision 31, 동일 sparse viewport `x[-356.6,-353.6], y[203419,203422]`, 첫 세 조회의 첫 시료. 이전 `/1`의 `x[-724,-721]`과 달리 `/2` 좌표를 중심으로 고정했다. `A4_QUERY_CENTER_X=-355.1`로 재현한다. 두 알고리즘의 X 좌표계가 다르므로 버전 사이의 위치나 응답 크기를 직접 비교하지 않는다.

| 규모/분포 | staged build | complete build | local Event X | 고정 query reads / bytes / shapes | artifacts |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1k sparse | — | 0.90 s | −355.137021 | 6 / 124265 B / 1 | — |
| 10k sparse | — | 9.41 s | −355.137021 | 8 / 226292 B / 1 | 40.98 MB |
| 100k sparse | 70.15 s | 167.33 s | −355.137021 | 11 / 329398 B / 1 | 773.18 MB |
| 10k dense (국소 300) | 3.35 s | — | −502.506 | 25 / 333305 B / 16 + cursor | 43.12 MB |
| 10k large Collection (회원 10000) | 3.12 s | — | −355.137021 | 8 / 235579 B / 1 | 50.73 MB |

Sparse 1k→100k의 첫 페이지 reads 6→11, bytes 124265→329398은 2배 기준을 위반한다. 10k→100k는 reads 8→11, bytes 226292→329398으로 2배 이내다. 100k complete 프로세스의 종료 RSS 2975 MiB, artifact 773 MB, 단계별 별도 실행에서 temporal 26.40 s/layout 5.38 s/content 8.37 s였다. Complete proof는 71.7→118.2 s, finalize는 118.2→167.3 s가 가장 큰 잔여 비용이다. 10k worker의 ≤180 s/≤3 GiB 기준은 로컬에서 통과했지만 100k의 메모리 여유는 약 97 MiB로 작다. 100k CPU/RSS peak, cancel/restart, 운영 환경·cold 20/warm 50 p95, 모바일 600 frame, authoring query는 여전히 확인해야 한다. A4 exit 미완료.
