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

PR #202 병합 main/배포 SHA `587761d4964d2e6e4128a73a98d977f9152093ba`; PR CI `36149828794`, main CI `36150156139`, post-deploy smoke `36150528134` 모두 성공. Railway web/API/worker SUCCESS, 공개 `/__status`도 동일 SHA를 반환했다. [PR #202 release comment](https://github.com/neocjmix/moirai/pull/202#issuecomment-5834527991).

## Slice 5: 큰 Publication의 인증 인덱스 페이지 폭

읽기 추적 결과 1k의 6개/124265 B 중 인덱스 리프 2개가 약 94KB, 100k의 11개/338358 B 중 인덱스 분기·리프 7개가 약 286KB였다. 고정 질의의 선택 결과는 각각 1개로 같았다. 128 fanout을 모든 크기에 적용할 때 100k에 큰 인덱스 페이지가 중복 전송된다. 반면 모든 World에 32를 적용하면 1k 78145 B, 100k 160158 B로 2배 기준을 근소하게 초과했다. 따라서 문서 수가 10000개를 넘는 새 index에만 fanout 32를 사용하고 기존 128 root도 계속 읽고 검증한다. 문서별 digest, ordered range, 완전성 검사는 그대로다. 기존 운영 Revision의 128 fanout artifact는 다시 만들지 않는다.

| 규모/분포 | index fanout | fixed query reads / bytes / shapes | build/artifacts |
| --- | ---: | ---: | ---: |
| 1k sparse complete | 128 | 6 / 124265 B / 1 | 0.77 s / 3.95 MB |
| 10k sparse complete | 32 | 9 / 101226 B / 1 | 8.55 s / 41.50 MB |
| 100k sparse complete | 32 | 14 / 154558 B / 1 | 167.88 s / 779.52 MB |
| 10k dense staged, 300 local | 32 | 31 / 190322 B / 16 + cursor | 3.66 s / 43.71 MB |
| 10k shared staged | 32 | 10 / 105186 B / 1 | 3.51 s / 41.57 MB |
| 10k large Collection staged, 10000 members | 32 | 11 / 127925 B / 1 | 3.61 s / 51.53 MB |

동일 sparse query의 1k→100k 바이트는 1.24배, 읽기는 2.33배이며 응답은 약 150 B. 고정 budget의 2배 조건이 **rows/bytes**인 만큼 bytes는 통과했지만 object reads의 256 상한은 별도로 통과한다. 100k complete 빌드 `real 168.998 s`, `user 187.198 s`, `sys 14.536 s`, 종료 RSS 2935 MiB (Node heap 2900 MiB 상한), 인덱스 object 19407개. 이 수치는 로컬 단일 프로세스이고 Ubuntu/PostgreSQL 17의 20 cold/50 warm p95나 peak RSS를 대신하지 않는다. 100k artifact bytes는 오히려 약 6.3 MB 증가했으며 index 개수가 4737→19407개로 증가해 저장·업로드 비용과 cancel/restart는 후속 검증이 필요하다. A4 exit 미완료.

PR #203 병합 main/배포 SHA `ba69adc44c5a6410f025bfcbb9683ec05e70d62d`; PR CI `36151949466`, main CI `36152315868`, post-deploy smoke `36152672004` 성공. Railway web/API/worker 모두 SUCCESS이며 공개 `/__status`는 동일 SHA, 그래프 SSR의 served Revision 32를 반환했다. [PR #203 release comment](https://github.com/neocjmix/moirai/pull/203#issuecomment-5834794528)에는 1k/100k dense·shared·100000 회원 대형 Collection의 추가 고정 질의 결과를 남겼다.

## Slice 6: 프로세스 단위 cold/warm v5 질의 계측

`scripts/ip011-a4-process-benchmark.ts`는 합성 v5 artifact를 한 번 만들고 고정 viewport에 실제로 필요한 digest 검증 object만 파일 store에 저장한다. 별도 Node 프로세스 20개에서 각각 첫 조회를, 같은 프로세스에서 50회 연속 조회를 측정한다. 모든 시료의 결과·continuation·object 수·바이트를 최초 빌드 질의와 비교하고 raw JSON 시료를 출력한다. `ip011-a4-query-process.yml`은 Ubuntu runner에서 sparse/dense/shared/large × 1k/10k/100k를 각각 실행·보존한다. 기존 v4 `ip004-scale.yml` 대신 v5 경로를 측정한다.

| 로컬 Node 24, sparse | cold 20 p95 | warm 50 p95 | 첫 페이지 reads / bytes | 결과 |
| --- | ---: | ---: | ---: | --- |
| 1k | 20.886 ms | 29.906 ms | 6 / 124265 B | 1 Event |
| 10k | 10.551 ms | 6.268 ms | 9 / 104586 B | 1 Event |
| 100k | 15.386 ms | 15.841 ms | 14 / 160158 B | 1 Event |

로컬 수치는 synthetic filesystem object store와 새 애플리케이션 프로세스의 **query body만** 측정한다. 빌드 및 모듈 로딩 시간은 cold query에 포함하지 않으며 OS page cache는 비우지 않는다. 100k staged artifact 생성은 이 실행에서 108.97초였고 이전 complete worker 167.88초와 같은 단계가 아니다. Ubuntu runner의 원시 시료와 PostgreSQL 17 row/history read, 모바일 HTML/graph/navigation/frame, authoring 및 worker cancel/restart가 없으므로 A4 exit를 완료로 판정하지 않는다.

Ubuntu Actions run [36195166578](https://github.com/neocjmix/moirai/actions/runs/36195166578)의 Node 22.23.2 / AMD EPYC 9V74 (16 GB host) 12개 잡 결과. 각 칸은 **20개 별도 프로세스 첫 질의 p95 / 동일 프로세스 50회 warm p95**, 단위 ms다. `[a4-process-samples.json](a4-process-samples.json)`에 840개 원시 시료·host·fixture·각 query의 reads/bytes/결과를 저장했다. 빌드도 해당 run의 Ubuntu에서 분포별로 새로 수행했다.

| 분포 | 1k cold / warm | 10k cold / warm | 100k cold / warm | 100k reads / bytes | 1k→100k bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| sparse | 5.916 / 2.974 | 9.772 / 4.709 | 11.896 / 6.226 | 14 / 160158 B | 1.29× |
| dense, 국소 300 Event | 9.908 / 12.781 | 19.257 / 12.616 | 18.922 / 13.360 | 35 / 238102 B | 1.06× |
| shared membership | 10.394 / 5.800 | 9.138 / 4.226 | 10.912 / 5.444 | 13 / 136311 B | 1.10× |
| large Collection | 6.183 / 2.132 | 9.830 / 4.226 | 11.149 / 4.156 | 13 / 148101 B | 1.18× |

이 측정 범위의 cold <=500ms, warm <=100ms, <=1MiB, <=256 object 및 1k→100k bytes <=2배는 12개 잡 모두 통과했다. Dense는 16 Event와 continuation을 반환한다. 매 요청에서 root body는 fixture metadata로 이미 전달돼 읽기 바이트에 **포함되지 않는다**. 로컬 파일 객체 저장소의 OS cache를 강제로 비우지 않았고 DB·HTTP·HTML·모바일 렌더링은 이 잡에 포함되지 않는다. 따라서 A1 고정 환경의 **전체** cold/warm gate 통과라고 확대하지 않으며 PostgreSQL rows/history, 실제 API 응답, 모바일 20 navigation/600 frame, authoring 및 worker cancel/restart를 계속 검증해야 한다.

## Slice 7: 운영 v5 모바일 프레임 계측 (진단, 예산 미통과)

[PR #205](https://github.com/neocjmix/moirai/pull/205)의 iPhone 14 WebKit/Ubuntu hosted runner/no throttling 계측은 운영 SHA `e95b9d3b71a21b9cf81f6487411fdd3fc0f576d0`의 World Revision 32 경로 `/graph/v5`를 20개 새 browser context에서 열었다. [Actions run 36198164197](https://github.com/neocjmix/moirai/actions/runs/36198164197)의 [원시 20 navigation·각 600 frame](a4-mobile-samples.json)을 보존했다. profile 잡의 success는 스크립트가 실패를 JSON으로 보고한 결과이며 성능 gate 통과를 의미하지 않는다.

| 운영 v5, 127 Event | 실측 | A1 고정 예산 | 판정 |
| --- | ---: | ---: | --- |
| graph-ready p95 (20 navigation) | 1248.88 ms | <=3000 ms | 통과 |
| drawer p95 | 222.52 ms | <=1000 ms | 통과 |
| 첫 decoded HTML / 후속 graph response 최대 | 23877 / 1392 B | 각각 <=1 MiB | 통과 |
| page error | 0 | 0 | 통과 |
| pan 600 frame p95 / max | 18 / 36 ms | <=33.4 / <=100 ms | **동작 불확인** |
| zoom 600 frame p95 / max | 20 / 38 ms | <=33.4 / <=100 ms | 통과 |
| Collection 토글 600 frame p95 / max | 21 / 926 ms | <=33.4 / <=100 ms | **실패** |

Pan 자동화는 빈 캔버스 드래그 후 점 위치가 30px 이상 변하지 않아 유효한 조작으로 인정할 수 없다. 이를 frame 통과로 계산하지 않는다. Zoom은 URL viewport 변화까지 확인했다. Collection 토글은 패널 열기를 측정에서 제외했는데도 최대 926ms, 다음 frame 124ms 및 재선택 시 129ms를 기록했다. 첫 화면은 단일 실제 World/127 Event이므로 1k/10k/100k 합성 규모의 브라우저 비용을 대체하지 않는다. CI 모바일 회귀·secret scan과 배포 smoke는 별도로 판정한다. A4 exit 미완료.

## Slice 8: workspace 재사용 후 운영 v5 재계측

[PR #206](https://github.com/neocjmix/moirai/pull/206)의 v5 App은 Collection 쿼리 변경 시 동일 `buildRevision` workspace를 loading shell로 교체하거나 재파싱 객체로 다시 hydrate하지 않는다. UI·그래프·드로어 마크업과 v4 경로는 변경하지 않았다. PR CI `36255914798`의 mobile Playwright/secret scan 포함 전체 통과, 운영 배포 `4cb379a6c3346b1e7974f53877f82a3aaa3f1e9c` Railway web/API/worker SUCCESS. [PR #207의 공개 smoke와 재계측 run 36256388503](https://github.com/neocjmix/moirai/actions/runs/36256388503)은 먼저 이 운영 SHA의 `pnpm smoke`를 통과한 뒤 같은 World Revision 32를 20 navigation과 각 600 frame으로 측정했다. [원시 시료](a4-mobile-post206.json)를 보존한다.

| 운영 v5 127 Event | 이전 Slice 7 | workspace 재사용 후 | A1 예산 | 판정 |
| --- | ---: | ---: | ---: | --- |
| graph-ready p95 | 1248.88 ms | 1793.51 ms | <=3000 ms | 통과 |
| drawer p95 | 222.52 ms | 120.53 ms | <=1000 ms | 통과 |
| 최대 v5 shell response | 1392 B | 1392 B | <=1 MiB | 통과 |
| pan p95/max | 동작 불확인 | 19/25 ms | <=33.4/100 ms | **유효 pan 통과** |
| zoom p95/max | 20/38 ms | 20/34 ms | <=33.4/100 ms | 통과 |
| Collection 토글 p95/max | 21/926 ms | 21/903 ms | <=33.4/100 ms | **실패** |

Pan은 빈 캔버스를 반대로 끌어 점이 x -40, y -60px 이동했음을 확인했다. 이전 pan 실패는 한 방향의 경계/조작 문제를 구별하지 못한 계측 결함이었다. Collection 토글은 패널 열기를 제외했음에도 최대 903ms로 통과하지 못했다. 단일 실행의 최대값 비교만으로 개선을 주장할 수 없으며, 다음 slice는 JS/render/URL 갱신 구간을 분리해 실제 장시간 frame 원인을 찾아야 한다. 1k/10k/100k 모바일 fixture 및 PostgreSQL authoring cold/warm, 100k worker peak/cancel/restart는 별개 미검증이다. A4 exit 미완료.
