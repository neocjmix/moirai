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

## Slice 9: Collection 프레임 원인 분리 실험

[PR #208](https://github.com/neocjmix/moirai/pull/208)의 테스트 전용 진단은 배포 SHA `d4dad95a8d44c6636ae5acd7db91d297903235a8`에 대한 공개 `pnpm smoke`를 선행 통과하고, 동일한 운영 v5 World Revision 32를 새 iPhone 14 WebKit context 네 개에서 ABBA 순서로 측정했다. 각 context는 동일 Collection을 off/on하고 600 RAF 간격을 기록한다. 실험 조건은 `history.replaceState`에서 `collections` 쿼리 파라미터가 바뀌는 호출만 브라우저 테스트에서 억제한다. React local state와 v5 graph loader는 그대로 실행한다. [Actions run 36257063658](https://github.com/neocjmix/moirai/actions/runs/36257063658), [원시 시료](a4-collection-abba.json).

| 순서 | URL 조건 | 600 frame p95 / max | >100ms frame | URL 변경 호출 | checkbox off/on |
| --- | --- | ---: | --- | --- | --- |
| A1 | 정상 | 19/968 ms | 968, 103, 116 ms | 1, 6 ms | 정상 |
| B1 | Collection URL 억제 | 19/160 ms | 160, 123 ms | 억제 | 정상 |
| B2 | Collection URL 억제 | 19/151 ms | 151, 116 ms | 억제 | 정상 |
| A2 | 정상 | 19/154 ms | 154, 120 ms | 0, 0 ms | 정상 |

모든 조건에서 100ms 최대 예산을 넘었고 page error 0이다. 첫 A의 968ms와 뒤 세 context 151~160ms 차이는 첫 실행/JIT/캐시 등 순서 효과를 포함하므로 URL 갱신만이 병목이라고 결론 내릴 수 없다. 실제 `replaceState` 호출 자체는 A에서 0~6ms였지만 비동기 후속 라우팅 비용은 별도 분리되지 않았다. 실험 조건은 URL을 영속적으로 갱신하지 않아 제품 대안도 아니다. 첫 context cold와 후속 warm, 네트워크/React commit을 더 분리하고 기존 UI·조작·드로어를 그대로 유지해야 한다. A4 exit 미완료.

순서를 뒤집은 [BAAB run 36257435680](https://github.com/neocjmix/moirai/actions/runs/36257435680)에서는 첫 B(컬렉션 URL 억제) 자체가 **598ms**, 이후 A/A/B는 117/111/130ms였다. [BAAB 원시 시료](a4-collection-baab.json)의 각 mode도 600 frame·checkbox off/on·page error 0을 충족한다. 따라서 큰 냉간 첫 조작 지연은 Collection URL 쓰기가 없어도 재현된다. URL 갱신은 이 장시간 frame의 필요조건이 아니며, 후속 세 warm context도 모두 max 100ms 예산을 넘는다. 이 순서 실험은 renderer/JIT/네트워크 중 어느 하나를 아직 특정하지 못하며 제품 URL 동작을 변경하지 않는다.

## Slice 10: Collection 응답·DOM·RAF 시점 분리 (진단)

[PR #209](https://github.com/neocjmix/moirai/pull/209)의 테스트 전용 타임라인은 운영 SHA `d9ef65bd7d4f5927fb0b365f3a030b3d640d07ee`에 대한 공개 smoke를 먼저 통과했다. Ubuntu hosted runner의 iPhone 14 WebKit, no throttling에서 새 context 2개를 순서대로 열어 각 600 RAF frame과 실제 체크박스 off/on을 측정했다. [동일 진단 스크립트의 Actions run 36258405742](https://github.com/neocjmix/moirai/actions/runs/36258233939), [원시 시료](a4-collection-timeline.json). 제품 런타임·화면·URL 동작은 변경하지 않았다.

| Context | p95 / max (600 frame) | >100ms frame | off/on shell 응답 소요 | 그래프 DOM 변경 |
| --- | ---: | --- | --- | --- |
| 첫 cold | 19 / 943 ms | 943, 108, 123 ms | 215 / 234 ms | off 4827ms, on 5771ms 등 |
| 다음 warm | 18 / 168 ms | 168, 129 ms | 238 / 147 ms | off 2505/2514ms, on 2731/2899ms 등 |

수치는 페이지 navigation 이후 `performance.now()` 기준의 시점이며, 첫 context의 가장 긴 RAF 간격은 약 4819~5762ms, off shell의 resource 응답 종료는 5042ms였다. 따라서 shell 응답 215ms **만으로** 943ms 간격을 설명할 수 없다. 그래프 SVG mutation 관측도 이 구간에 있으나 RAF 간격 사이에 Playwright action 완료 timestamp가 있으므로 943ms를 단일 연속 JS/React long task로 단정할 수 없다. 브라우저 scheduling, paint/compositing, graph update 작업을 더 분리해야 한다. 정상 URL 변경은 각 context 두 번, page error 0, off/on 결과 정상이다. 두 context 모두 최대 100ms 고정 예산 **실패**이며 A4 exit는 미완료다. 이 진단 workflow의 success는 성능 예산 통과가 아니다.

## Slice 11: 긴 RAF 간격 중 JS timer 진행 여부

[PR #210](https://github.com/neocjmix/moirai/pull/210)은 운영 SHA `d4ac46bb03b52d3f7f633e82e8e94b68026cee38`에 대한 공개 post-deploy `pnpm smoke`를 선행 통과했다. 앞선 WebKit 진단에 10ms JS timer를 **테스트에서만** 병행하고 동일한 off/on, 각 600 RAF frame을 기록했다. [Actions run 36258954895](https://github.com/neocjmix/moirai/actions/runs/36258954895), [원시 시료](a4-collection-timer.json). 운영 web/API/worker는 모두 해당 SHA로 SUCCESS였다.

| 새 iPhone 14 WebKit context | RAF p95/max | >100ms RAF 안의 timer tick | 전체 timer tick / 최대 timer 간격 | shell off/on |
| --- | ---: | --- | ---: | ---: |
| 첫 cold | 19/969 ms | 969ms 중 71회; 111ms 중 8회; 125ms 중 8회 | 782회 / 31ms | 138/134ms |
| 다음 warm | 18/147 ms | 147ms 중 10회; 114ms 중 9회 | 749회 / 20ms | 145/225ms |

첫 navigation의 shell 응답은 1944ms로 해당 조작 전이며 첫 조작 결과와 혼동하지 않는다. 두 context의 체크박스 off/on 및 URL 변경은 정상, page error 0이다. 969ms RAF 공백 중 timer가 계속 동작했으므로 **연속적인 969ms JS main-thread block은 관측되지 않았다**. 이는 RAF/presentation 스케줄링 또는 테스트 실행 조건의 영향을 강하게 시사하지만 paint/compositor 원인이라고 확정할 근거는 아니다. 진단용 timer 자체가 샘플링 조건을 바꾸므로 timer 없는 Slice 10과 최대치 개선 비교도 하지 않는다. 두 context 모두 max <=100ms 고정 예산 **실패**; 별도 화면 녹화/visibility/RAF 원인 분리와 1k/10k/100k 규모의 실제 브라우저 검증이 남았다. A4 exit 미완료.

## Slice 12: cold idle RAF 대조군

[PR #211](https://github.com/neocjmix/moirai/pull/211)의 제품 변경 없는 대조 실험은 배포 web SHA `911e603b39683564fc7592d07fdfc56186490931`의 공개 smoke를 선행 통과했다. 첫 새 WebKit context의 그래프 준비·패널 개방 뒤 **토글 전 idle 600 RAF**를 측정하고 같은 context에서 Collection off/on 600 frame을 기록했다. 다음 새 context는 idle 없이 off/on했다. [Actions run 36259337428](https://github.com/neocjmix/moirai/actions/runs/36259337428), [원시 시료](a4-collection-idle-control.json).

| 순서 | idle 600 frame p95/max | 토글 600 frame p95/max | 토글 최대 간격 중 10ms timer tick | page error |
| --- | ---: | ---: | ---: | ---: |
| 첫 context, idle 먼저 | 19/182 ms (visible) | 21/905 ms | 59회 | 0 |
| 다음 context, 토글 먼저 | 없음 | 19/158 ms | 11회 | 0 |

첫 context에서 idle의 최대 182ms도 100ms gate를 넘지만, 약 10초의 idle 후에도 토글의 905ms 공백이 남았다. 즉 단순한 첫 RAF 시작/몇 프레임 warm-up만으로 설명되지 않는다. 타이머는 해당 공백 중 계속 진행해 연속 JS block과도 일치하지 않는다. 네트워크 응답·SVG 변경·브라우저 RAF presentation의 관계는 남아 있고, idle-first와 toggle-first는 서로 다른 context 및 순서 조건이라 원인 확정 실험은 아니다. 제품 URL·그래프·드로어를 변경하지 않았다. Collection max gate는 여전히 **실패**, A4 exit 미완료다.

## Slice 13: 모바일 Collection 입력 자동화 대조

[PR #212](https://github.com/neocjmix/moirai/pull/212)의 테스트 전용 진단은 운영 SHA `0c4a87760bfe8a97cfa3815e00637ed92c9ac8ee`에 고정된 공개 smoke를 선행 통과했다. 새 iPhone 14 WebKit context에서 각각 DOM `.click()` (untrusted), Playwright locator `uncheck/check` (trusted), 가시 label 행에 `touchscreen.tap` (trusted)을 순서대로 실행했다. 각 600 RAF frame, JS timer, 실제 input click의 `isTrusted`, 체크박스 off/on, URL 변경 및 page error를 확인했다. [Actions run 36260325116](https://github.com/neocjmix/moirai/actions/runs/36260325116), [원시 시료](a4-collection-input-method.json). 앞선 두 touch 시도는 input/행이 viewport 안에 없는 좌표를 탭하여 상태가 바뀌지 않았고 workflow가 실패했다. 최종 실험은 측정 **전에** 대상 input을 scrollIntoViewIfNeeded로 노출했다.

| 새 context 순서 | 입력 | 600 frame p95/max | >100ms | 실제 click 신뢰 여부 | off/on·URL·error |
| --- | --- | ---: | --- | --- | --- |
| 첫 | DOM click | 19/112 ms | 112 | false, false | 정상·2회·0 |
| 두 번째 | locator | 19/950 ms | 950, 127 | true, true | 정상·2회·0 |
| 세 번째 | touch | 18/141 ms | 141 | true, true | 정상·2회·0 |

Locator 950ms 동안 JS timer는 78회 진행했다. 이 조건에서 locator의 actionability/자동 스크롤/입력 대기 과정이 RAF 공백에 영향을 줄 가능성이 있다. 다만 순서가 고정이고 DOM click은 유저 입력이 아니며, 별도 context 간 네트워크/캐시 차이가 있어 **원인과 개선량을 확정하지 않는다**. 실제 모바일 조작을 대표하는 trusted touch조차 max 141ms로 고정 100ms gate **실패**다. 기존 20 navigation Collection 계측은 locator 입력이었으므로 터치 기준 20회 재측정이 필요하다. 제품 화면·그래프·드로어와 URL 코드는 바꾸지 않았다. A4 exit 미완료.

## Slice 14: 20 navigation 모바일 고정 예산의 trusted touch 재계측

[PR #213](https://github.com/neocjmix/moirai/pull/213)의 profiler-only 수정은 운영 SHA `3b024904def2cbddde9c9257e7323a94a1a4a7c6`에 대한 공개 `pnpm smoke`를 선행 통과했다. 기존 20개의 새 iPhone 14 WebKit context, no throttling, 각 pan/zoom/Collection 600 RAF sample 조건을 유지하고 마지막 Collection의 locator `uncheck/check`만 가시 label의 `touchscreen.tap` 두 번으로 대체했다. 상태 off/on·URL 변경·실제 `isTrusted=true` click 두 번을 요구한다. [Actions run 36260768760](https://github.com/neocjmix/moirai/actions/runs/36260768760), [원시 20 navigation 및 프레임 시료](a4-mobile-trusted-touch.json).

| 운영 v5, World Revision 32 | 결과 | 고정 예산 | 이 실행 판정 |
| --- | ---: | ---: | --- |
| graph-ready p95, 20 navigation | 1170.2 ms | <=3000 ms | 통과 |
| drawer p95 | 259.87 ms | <=1000 ms | 통과 |
| 최대 HTML / graph response | 23877 / 1392 B | 각각 <=1MiB | 통과 |
| page error | 0 | 0 | 통과 |
| pan p95/max, 600 frame | 18/25 ms | <=33.4/100 ms | 통과 |
| zoom p95/max, 600 frame | 20/32 ms | <=33.4/100 ms | 통과 |
| Collection touch p95/max, 600 frame | 20/25 ms | <=33.4/100 ms | **이 실행 통과** |

Pan 실제 점 이동과 zoom URL 변화 검사도 기존대로 유지한다. 이 한 실행의 Collection은 이전 locator 903ms보다 작지만 입력 방식이 달라 **제품 성능 개선치가 아니다**. 별도 유효 trusted touch 두 context에서는 max 141/132ms로 실패했으므로 재현성 검증 없이는 모바일 gate를 최종 완료로 선언할 수 없다. 1k/10k/100k 규모 모바일, PG17 authoring, worker peak/cancel/restart 등도 남아 있으며 A4 exit 미완료다.

동일 profiler의 최종 헤드 반복 [Actions run 36260933629](https://github.com/neocjmix/moirai/actions/runs/36260933629)은 graph-ready p95 1088.27ms, drawer 165.75ms, pan p95/max 18/55ms, zoom 19/32ms, Collection trusted touch 20/29ms였다. 그러나 [반복 원시 시료](a4-mobile-trusted-touch-repeat.json)의 `failures: ["zoom_ineffective"]`는 zoom 후 URL viewport 변화가 없었음을 뜻한다. Workflow success는 진단 결과의 실패를 exit로 승격하지 않는다. 첫 run은 zoom 동작 유효, 두 번째는 무효이므로 모바일 pan/zoom/Collection **통합 gate는 재현성 미확보**로 남는다.

## Slice 15: 모바일 profiler 실패를 CI 실패로 승격

[PR #214](https://github.com/neocjmix/moirai/pull/214)은 `failures`가 있으면 JSON 출력과 artifact 업로드는 유지하되 profiler를 비정상 종료하게 만든다. 이제 `zoom_ineffective`, 상태·URL·trusted touch 실패 또는 예산 위반을 녹색 workflow로 오인하지 않는다. 운영 SHA `529d18d771cfa5e3b80aed0a8cc0141dcdaa9853`에 고정된 post-deploy 공개 smoke를 먼저 통과한 [Actions run 36261346762](https://github.com/neocjmix/moirai/actions/runs/36261346762)의 [raw](a4-mobile-budget-gate.json): 20 navigation graph-ready p95 1436.34ms, drawer 120.73ms, 600 frame pan p95/max 18/41ms, zoom 20/32ms, Collection trusted touch 20/26ms, HTML/graph <=1MiB, page error 0, touch trusted click 2회, `failures:[]`. 이 run은 고정 모바일 수치와 조작 유효성 gate를 모두 통과했다. 그러나 Slice 13의 별도 touch max 132~141ms와 Slice 14의 zoom 무효 반복은 제거되지 않았으므로 운영 127 Event에서의 안정적 재현 및 1k/10k/100k fixture 모바일 시험은 후속 검증이다. A4 전체 exit 미완료.

## Slice 16: PG17 v5 authoring search 기준 계측

[PR #215](https://github.com/neocjmix/moirai/pull/215)의 [Actions run 36279059315](https://github.com/neocjmix/moirai/actions/runs/36279059315), [원시 20 cold·50 warm 시료](a4-authoring-query.json). Ubuntu hosted runner, PostgreSQL 17 Alpine, Node v22.23.2 x64. 임시 DB를 규모별로 만들고 migration 009→011을 적용했다. World Revision 31의 제목 `DanJong`인 21 Event를 높은 UUID ID에 고정하고, 그보다 낮은 ID의 원격 Event만 1k/10k/100k로 증가시켰다. 동일한 첫 페이지 20 Event와 continuation cursor를 각 시료에서 검증했다. 각 Event에는 Narrative가 있다. fixture 적재용 `narratives(scope_type,scope_id)` 인덱스는 검색·EXPLAIN 전에 삭제했다. 20 cold는 새 Node 프로세스 각각 첫 검색이고 PostgreSQL buffer 및 OS 캐시는 비우지 않았다. warm은 한 프로세스 50회다.

| Event | fixture 적재 | cold app p95 | warm app p95 | cold query p95 | warm query p95 | response | history rows | EXPLAIN |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1k | 0.22 s | 31.28 ms | 3.60 ms | 12.88 ms | 3.34 ms | 2113 B | 0 | Seq Scan, 979 rows filtered |
| 10k | 2.21 s | 38.62 ms | 9.03 ms | 21.27 ms | 8.36 ms | 2113 B | 0 | Seq Scan, 9979 rows filtered |
| 100k | 23.26 s | 32.12 ms | 4.35 ms | 14.17 ms | 3.67 ms | 2113 B | 0 | Bitmap Index Scan `events_active_title_trgm`, 21 rows |

실제 검색에서 10k의 순차 스캔이 가장 비싼 DB 단계였지만 100k에서는 제목 인덱스를 사용한다. 세 규모의 cold ≤500 ms, warm ≤100 ms, 응답 bytes 증가 1배, history replay 0으로 이 국소 제목 질의는 통과한다. EXPLAIN의 shared buffers는 순서대로 17/137/126 hit, 0 read이며 물리 디스크 cold 증거가 아니다. 첫 페이지 쿼리만 측정했고 다른 검색어·dense/discovery 후보 500·후속 페이지와 운영 데이터 분포를 대표하지 않는다. 코드 최적화는 이 수치만으로 정당화되지 않는다. A4 전체 exit는 dense·100k viewport의 충분한 cold/warm 수, 모바일 규모/반복, worker peak/cancel/restart가 남아 있다.

## Slice 17: 100k worker lease 재획득 안전성

[PR #216](https://github.com/neocjmix/moirai/pull/216) main/운영 `53fe5e53ff089402c2354f34ab76e9dbcbf6ef03`. 이전 worker claim lease 60초는 합성 100k 완전 빌드 약 168초보다 짧아 중복 claim 가능성이 있었다. v5 claim만 300초로 늘리고, 완료·재시도를 `status=processing` 및 `attempt_count`에 원자적으로 조건화했다. PG17 시험은 첫 lease 강제 만료→같은 job 재claim→첫 시도의 완료/재시도 거부→새 시도의 완료 및 World served 상태 유지까지 확인한다. [PR CI 36286539579](https://github.com/neocjmix/moirai/actions/runs/36286539579) 품질/PG17/모바일/secret scan과 [배포 smoke 36286797216](https://github.com/neocjmix/moirai/actions/runs/36286797216) 공개·모바일·인증 authoring 성공. 300초를 넘는 빌드와 실제 프로세스 종료 후 queue 재claim은 아직 별도 검증이다.

## Slice 18: hosted Ubuntu 10k/100k worker 프로세스 peak·강제 중단·재실행

[PR #217](https://github.com/neocjmix/moirai/pull/217)의 [Actions run 36286884869](https://github.com/neocjmix/moirai/actions/runs/36286884869), [원시 JSONL](a4-worker-process.jsonl). Ubuntu hosted x64, Node 22, 합성 Revision 31 sparse World, `A4_COMPLETE=1`, 고정 viewport 중심 X −355.1, 메모리 object store. 별도 Node 프로세스를 `/proc` 100ms 간격으로 추적해 VmHWM와 CPU tick을 기록했다. 10k 완전 빌드 후 100k 프로세스 RSS 300MiB 이상·3초 이후 SIGKILL, 이어 새 100k 완전 빌드를 수행했다.

| 단계 | wall | CPU sampled | peak RSS | 결과 |
| --- | ---: | ---: | ---: | --- |
| 10k complete | 5.04 s | 6.23 s | 496.47 MiB | 50,196 documents, 41.50 MB artifact; ≤180s/3GiB 통과 |
| 100k cancel | 3.03 s | 3.44 s | 412.33 MiB | SIGKILL; 완전 artifact 출력 전 종료 |
| 100k restart complete | 92.79 s | 108.84 s | **5069.41 MiB** | 601,597 documents, 779.52 MB artifact, 국소 viewport 1 shape |

이 실행에서 100k 취소 후 새 프로세스의 완전 빌드는 성공했다. 100k RSS는 이전 로컬 Node 24 종료 RSS 2975MiB보다 훨씬 높으며, 종료 RSS와 peak·실행 환경이 달라 개선/악화율로 해석하지 않는다. hosted 100k peak 5GiB는 운영 worker 용량·중복 빌드 위험을 조사할 근거다. 이 시험은 DB lease/실제 object-store 업로드/served pointer를 포함하지 않으므로 운영 queue의 중단·재개 성공으로 간주하지 않는다. 100k 메모리 감소와 queue end-to-end 재시작은 A4 잔여 작업이다.

## Slice 19: 긴 v5 immutable 업로드의 lease 소유권

[PR #218](https://github.com/neocjmix/moirai/pull/218)은 100k 합성 완전 산출물 약 601,597 documents와 19,407 index nodes를 순차 PUT하는 동안 300초 claim이 만료될 위험을 다룬다. 현재 시도의 `attempt_count`만 30초 간격으로 lease를 갱신하고, 빌드 이후·매 1,024 immutable 업로드·공개 pointer CAS 직전에 claim을 재검증한다. 잃어버린 claim은 공개 pointer를 바꾸기 전에 실패한다. PG17 재claim 시험은 이전 시도의 갱신 거부와 새 시도의 갱신 성공을, pointer 단위 시험은 업로드 후 CAS 직전 소유권 상실 시 이전 pointer 유지를 확인한다. main/운영 `8836ea7577190d06b031bb6666fb1487fd5f0257`, [PR CI/PG17/모바일 36287758648](https://github.com/neocjmix/moirai/actions/runs/36287758648) 및 [배포 smoke 36288059427](https://github.com/neocjmix/moirai/actions/runs/36288059427) 성공. 실제 S3 100k 업로드 시간과 실제 queue 중단·재claim은 시험하지 않았다.

## Slice 20: 100k 메모리 peak 위치

[PR #219](https://github.com/neocjmix/moirai/pull/219)은 관찰자가 있는 합성 프로파일에만 phase RSS/heap을 추가하고 운영 worker에는 전달하지 않는다. [hosted run 36288146604](https://github.com/neocjmix/moirai/actions/runs/36288146604)에서 100k 재실행 wall 174.33초, CPU sampled 202.22초, peak RSS **4806.48 MiB**. 단계 경계 RSS는 state 171.61, staged 2020.83, staged verification 2139.46, proof Map 2206.82, selection proof 2177.22, complete finalization 종료 2835.32 MiB다. 따라서 4.8GiB peak는 finalization 내부의 일시 할당 구간에서 관측된 것으로 추론한다. 경계 값은 peak 시점의 heap attribution이 아니다. [12개 1k/10k/100k 형상 매트릭스 36288146553](https://github.com/neocjmix/moirai/actions/runs/36288146553), [CI/모바일 36288146598](https://github.com/neocjmix/moirai/actions/runs/36288146598), [배포 smoke 36288519743](https://github.com/neocjmix/moirai/actions/runs/36288519743) 성공. main/운영 `c7c52c075bdb50be5df749dd3559ce7ea3b2424c`; 공개 contract 5/schema 011/v5, World Revision 32.

## Slice 21: 메모리 후보 두 개 기각

- [PR #220](https://github.com/neocjmix/moirai/pull/220)은 최종 검증 뒤 임시 content pages/Map/Set을 비웠으나 [hosted 100k 36288795209](https://github.com/neocjmix/moirai/actions/runs/36288795209) peak **4801.98 MiB**로 기준 4806.48 MiB와 사실상 같다. [12 형상 36288795204](https://github.com/neocjmix/moirai/actions/runs/36288795204)와 [CI/모바일 36288795212](https://github.com/neocjmix/moirai/actions/runs/36288795212)는 성공했지만 개선 증거가 없어 **병합 없이 종료**했다.
- [PR #221](https://github.com/neocjmix/moirai/pull/221)은 문서 60만 개의 leaf Ref 배열을 bounded leaf chunk 생성으로 바꾸었으나 [hosted 100k 36289128377](https://github.com/neocjmix/moirai/actions/runs/36289128377) peak **4799.36 MiB**였다. 산출물 601,597 documents/779,523,312 B, 10k 예산, [12 형상 36289128520](https://github.com/neocjmix/moirai/actions/runs/36289128520), [CI/PG17/모바일 36289128414](https://github.com/neocjmix/moirai/actions/runs/36289128414)는 통과했지만 peak 개선이 없어 **병합 없이 종료**했다. 이 후보는 실행 환경 연결 장애로 로컬 검사를 수행하지 못했고 CI를 검증 경계로 삼았다.

최신 운영 코드에는 두 후보가 포함되지 않는다. 100k worker peak 약 4.8–5.1GiB와 약 621k 객체의 실제 업로드 처리량, queue 수준의 프로세스 중단/재시작, dense·대형 Collection cold/warm 20/50 및 100k 모바일 frame 재현성은 A4 미완료 게이트다. A5·A6·M5는 시작하지 않는다.

## Slice 22: 실제 worker 업로드 중단·큐 재시작 검증

2026-09-27 시작 시 main/API/worker/web은 `8aa7c91812fbdaf89d74348cdd3842b89cded6dd`, 공개 served Revision 32였다. 직전 증거 배포의 [smoke 36289703247](https://github.com/neocjmix/moirai/actions/runs/36289703247)는 public readiness·live iPhone WebKit·인증 authoring 모두 성공했다.

[PR #223](https://github.com/neocjmix/moirai/pull/223)은 제품 코드를 바꾸지 않고 compiled Lachesis worker를 별도 프로세스로 실행하는 PG17/local HTTP object-store 회귀를 추가한다. 새 임시 DB의 history-only 1k 미배치 Event와 Narrative를 재구성하며, 로컬 store는 immutable PUT와 ETag 조건부 포인터 교체를 처리한다. 기존 build-only SIGKILL 시험과 달리 실제 claim·heartbeat·S3ObjectStore HTTP 요청·재시작·DB 완료 기록을 통과한다. 객체 인증 서명 검증이나 외부 S3 서비스 지연을 재현하는 시험은 아니다.

[hosted run 36298284643](https://github.com/neocjmix/moirai/actions/runs/36298284643), [원시 결과](a4-worker-recovery.json): 첫 시도의 100번째 immutable PUT 응답을 보류하고 실제 30초 heartbeat의 lease 연장을 확인한 뒤 SIGKILL했다. Revision 31 포인터가 그대로 유지됐다. 두 번째 worker의 readiness를 확인한 뒤에도 만료 전 claim은 attempt 1에 머물렀다. 죽은 프로세스의 lease를 **이 임시 DB에서만 SQL로 만료**시킨 뒤 attempt 2가 기존 객체 100개를 비교·재사용하고 업로드를 완료했다. 새 객체/포인터 PUT 2,020회, 최종 store 1,930,830 B, 포인터 교체 1회, root digest 검증 및 PostgreSQL served Revision 32/ready 일치, 전체 관측 37.53초(의도적 heartbeat 대기 포함), failures 0. 실제 300초 만료를 기다리는 시간 시험은 아니다.

초기 run 36297980967은 fixture의 v5 정책 identity 누락, 36298088379는 CI의 worker runtime dependency 미빌드로 실패했다. 정책 제약을 유지한 채 fixture에 실제 v5 정책을 기록하고 배포와 같은 compiled worker를 실행하도록 고쳤다. 런타임 오류를 회피하거나 예산을 완화하지 않았다. 로컬 strict typecheck·lint·gitleaks 성공. 최종 CI·모바일·배포 SHA/smoke는 PR 검증 댓글에 이어 기록한다.

이 slice는 1k 복구 경로만 검증한다. 100k 약 621k 객체의 실제 업로드 처리량·규모별 복구, dense/대형 Collection의 종단간 cold/warm과 모바일 1k/10k/100k frame exit는 여전히 미완료다. A3 UI/그래프/드로어는 변경하지 않았고 A5·A6·M5도 시작하지 않았다.

## Slice 23 진행: 전체 화면 경로와 UUID 100k 재검증

PR #224는 기존 내부 reader 측정을 실제 shell/search route, 전체 UUID Publication, 실제 worker process/HTTP upload 및 12개 규모·형태의 Next/WebKit 경로로 확장한다. 1k/10k/100k × sparse/dense/shared/large에서 동일 국소 질의를 유지한다. 첫 실행 `36300623994`는 100k semantic digest의 단일 문자열이 JS 문자열 상한을 초과함을 발견했다. 같은 정렬·직렬화 토큰을 스트리밍 SHA256에 공급해 digest 의미를 보존했다. 수정 후 실행 `36301030872`에서 100k 네 형태의 완전 Publication 생성이 성공했다. 이것만으로 A4 완료는 아니다.

전체 shell 측정은 내부 reader 통과가 실제 API 통과와 다름을 드러냈다. 로컬 1k dense에서 viewport 925 objects/1,996,103 bytes/warm p95 163.25 ms, Collection 270 objects로 고정 예산을 초과했다. 제목과 작은 membership 집합을 인증된 spatial leaf에 함께 넣고, Collection 목록은 시간 정보 없이 content detail만 읽도록 변경했다. 기존 leaf는 기존 경로로 읽으며, 새 hint는 완전 Publication 확정 시 canonical 값과 대조한다. geometry/좌표/256개 반환 상한은 유지했다. 로컬 같은 fixture 재측정은 viewport 211 objects/1,032,933 bytes/cold p95 113.76 ms/warm p95 44.51 ms, Collection 137 objects/440,566 bytes/cold 85.01 ms/warm 33.00 ms다. 로컬 수치는 진단이며 hosted 12-shape gate를 대체하지 않는다. 운영 Revision 32의 immutable artifacts는 변경하지 않았다.

2026-09-27 사용자 지적에 따라 opacity=0인 사건의 circle/text뿐 아니라 투명한 hit target도 계속 mount하던 것을 확인했다. 완전히 투명한 point와 relation SVG는 생략하고, 확대 복원에 필요한 geometry는 유지한다. Composite 진입·퇴장 fade는 유지하며 완전히 투명한 surface의 pointer events를 비활성화한다. 서버 fetch 감소와 DOM 감소는 별도로 측정한다.

### 사용자 추가 지시와 후속 검토 순서

- 15:56 KST: 화면상 충분히 작은 Composite를 면적 대신 점으로 표시하도록 명시적으로 요청했다. 작은 화면 footprint에서만 같은 Composite identity/drawer를 가진 점으로 바꾸고, 확대하면 영역을 복원한다. 일반 레이아웃 교체나 canonical Time Event 변경이 아니다. 경계 진동 방지와 모바일 회귀를 검증한다.
- 16:01 KST: 기존 작업을 마친 뒤 작은 구간별 cache, 서버에서 준비하는 상태별 작은 응답, 잦은 fetch의 trade-off를 후속 검토한다. 지금 cache 프로토콜 변경을 시작하지 않는다. 실측 server latency/왕복 지연, tile 크기·prefetch 여유·zoom별 payload·요청 빈도, World Revision/Collection selection cache key 및 이동 중 연속성을 비교할 것. A5/A6/M5는 활성화하지 않는다.


## Slice 24: bounded upload와 최종 읽기 증거 (2026-09-27)

PR #227의 `cf3535c1804b0d94b1d95c9612601782fe27416c`는 immutable upload를 최대 8개씩 처리한다. 실패한 batch는 전부 settle한 뒤 실패하며 다음 batch/root는 쓰지 않는다. 기존 객체의 내용 검증, root-last, claim fencing, pointer CAS는 보존한다. CI/PG17/mobile/security `36312770615`, 실제 worker recovery `36312770605` 성공. 큰 규모 실행 `36312770656`의 worker 10k/100k는 성공했지만 이 브랜치의 모바일 성능은 실패했다. worker 성공을 A4 전체 통과로 확대하지 않는다. [원시 worker 결과](a4-worker-batched.json).

PR #227은 main `8c556cf3d3d9e5e4491e9eb7305b43746f51c4a9`로 병합됐고 API/worker/web 모두 동일 SHA로 SUCCESS다. 공개 status SHA도 일치하며 main CI `36314668325`와 post-deploy `36314918364`의 readiness/live mobile/authenticated authoring이 성공했다.

프레임 후보와 합친 `fd090dd9057b8e83d21c6ee09208e7ea941f6689`의 `36314710167`에서 actual worker 10k/100k를 다시 통과했다. 10k build-to-first-PUT 7.90/10.92초, process peak 559.70MiB, 중단/heartbeat 대기를 포함한 전체 57.49초. 100k build-to-first-PUT 200.21/203.73초, peak 3613.53MiB, 전체 685.63초(11분 26초), CPU 첫/재시도 216.69/446.57초, 객체 621006개·1248073895B. 두 규모 모두 SIGKILL 후 이전 포인터 유지, 실제 heartbeat, 만료 전 claim 보존, 임시 DB에서 만료 시간을 앞당긴 뒤 attempt 2, immutable 104개 재사용, 최종 pointer 1회 교체/served 32를 확인했다. 10k의 고정 180초/3GiB는 통과; 100k에는 10k 상한을 잘못 적용하지 않으며 큰 RSS/전체 rebuild 비용은 운영 용량 위험으로 남는다. 외부 S3 지연·서명 인가·실제 300초 대기는 이 local HTTP store 시험 범위가 아니다.

`6ec9c8b8fa1d5da75903a81e2a14a4ffc61007d8`의 `36314634126`에서 전체 UUID Publication의 실제 shell/search route 12개 scale/shape가 모두 통과했다. viewport/detail/collection/search 각각 20 fresh-process cold, 50 same-process warm; pointer/root/index/artifact를 포함한다. 최악 cold p95 217.24ms, warm p95 60.40ms, 241 objects, 1032933B. 같은 query의 1k→100k bytes 증가 최대 1.1062배, objects 최대 1.9091배다. Dense는 256 entities와 explicit truncated를 반환한다. [원시 전체 경로 시료](a4-full-route-final.json). OS page cache를 비우지 않으며 네트워크 왕복과 query 이전 module loading은 cold query body 시간에 포함하지 않는다. 브라우저 navigation은 별도 20회 측정한다.

## Slice 25 진행: 모바일 최대 frame 재현성

PR #226은 pointer의 마지막 위치를 RAF당 한 번 적용하며 pointer-down/up 전에 pending 위치를 flush한다. 추가로 client 좌표만 저장하고 stage bounds를 RAF당 한 번 읽어 매 pointermove의 강제 layout을 줄인다. A3 화면/좌표/selection/pinch/URL을 보존한다. profiler는 자동화 mouse hover 준비 시간을 따로 기록하고 contact/move/up 및 이후 렌더를 기존 600-frame/p95 33.4ms/max 100ms 예산 안에 남긴다.

- `36314634126`: 12개 shape의 navigation/drawer/p95는 통과. graph-ready p95 최대 1405.42ms, drawer p95 최대 152.87ms. 11개 frame case는 통과하지만 100k large Collection toggle max 110ms 실패. [원시 frame 반복](a4-frame-repeat.json).
- `36314710167`: 같은 runtime + batch upload의 1k dense pan max 126ms 실패(나머지 mobile 11개 성공). 바로 이전 실행의 1k dense 96ms 성공을 선택해 이 실패를 덮지 않는다.
- 새 입력-burst E2E는 bounds read 0 synchronous/1 RAF를 통과했으나 pan 후 화면 밖으로 나가 제거되는 `event:founding`을 기다리다 실패했다. trace를 확인하고 pan 후에도 보이는 `event:capital`로 바꿨다. native pointer ID도 직접 capture한다. 기존 28개 mobile 회귀는 성공했다.
- 별도 timer 진단 `36315328270`은 1k dense pan 86ms gap 동안 10ms timer 7회/pointerup을 관측했다. 이 86ms 전체가 연속 JS block인 것은 아니다. timer 자체가 조건을 바꾸므로 acceptance 대체나 >100ms gap의 원인 확정으로 쓰지 않는다. [진단 원시 시료](a4-frame-diagnostic.json). 첫 진단 `36315138037`은 tsx __name helper가 serialized callback에 들어가 실패했고 self-contained callback으로 수정했다.

현재는 graph stage의 고정 viewport 안에 layout/paint를 제한하는 후보 `ec930160b9e6031e992be1dd81d09dac9bba23a6`를 검증 중이다. 해당 후보의 측정·기능 회귀·배포가 확인되기 전에는 채택 또는 A4 완료로 표시하지 않는다. 고정 budget, A5/A6/M5 범위는 변경하지 않는다.


### Paint containment 후보 기각과 남은 종료 차단

`ec930160b9e6031e992be1dd81d09dac9bba23a6`의 별도 진단 `36315569837`은 pan p95 18ms/max 106ms로 실패했다. 해당 106ms 중 10ms JS timer가 8회 실행되고 7회 pointermove와 pointerup이 처리됐다. 후속 74ms gap에도 timer 6회가 진행됐다. 연속 106ms JS block은 아니지만, WebKit presentation/compositor와 hosted scheduling 중 정확한 원인을 확정한 증거는 아니다. [실패 진단 시료](a4-frame-paint-diagnostic.json). `contain: layout paint; transform: translateZ(0)` 후보는 예산 통과/재현 가능한 개선을 입증하지 못해 제거했다.

A4를 닫지 않는다. 서버 full-route 12-case cold/warm/bytes/object/growth, PG17 authoring query, 10k worker budget과 실제 100k interrupted upload/recovery는 검증됐지만 mobile absolute max 100ms는 반복해서 실패한다. p95 통과, 다른 run의 같은 case 성공, timer-instrumented 결과를 실패의 대체물로 쓰지 않는다. 현재 환경에서 안정적 통과를 달성하지 못했으며 불가능함의 수학적 증명이나 실제 iPhone 전체의 성능 결론은 아니다. 다음은 실패 구간의 WebKit presentation trace 또는 독립 동일-profile 재현으로 browser/host와 제품 paint 비용을 분리하는 작업이다. 기준 변경이 필요하다고 판단하더라도 현재 고정 기준을 조용히 변경하지 않는다. 새 cache protocol 검토와 A5/A6/M5는 시작하지 않는다.


## Slice 26: v5 snapshot과 재방문 보관 분리 — A4-R1 첫 checkpoint

재계획 PR #229(main cf6d72b) 이후 실제 v5 UI loader에 응답 cache를 연결했다. World/Revision/time system/Collection/relation filter마다 loader를 분리한다. viewport key는 범위·배율·화면 크기·선택·artifact class를 포함한다. 최대 8개·직렬화 8MiB이며 JS heap 8MiB 보장은 아니다. 완전 응답만 기존 padding coverage로 재사용하고 부분 응답은 exact query에만 재사용한다. 응답 수신 후 30초가 지나면 다음 조회에서 기존 server current pointer 검사로 돌아간다. hit으로 만료를 연장하지 않으며 idle 중 자동 Revision 갱신은 추가하지 않는다.

v5 endpoint의 응답은 delta가 아닌 bounded snapshot이다. `truncated`여도 과거 방문 사건으로 보충하지 않고 새 응답으로 active 집합을 교체한다. legacy incremental reader의 계약은 유지한다. 이로써 오래된 point가 region/edge 슬롯을 소비하지 않는다. loading/error 때 마지막 성공 snapshot은 유지한다. 중복 exact 요청은 병합하고 새 요청은 이전 요청을 abort한다(최대 1). loader 교체·pagehide에 cache와 pending을 정리한다. 취소된 transport의 늦은 결과는 cache를 채우지 못하며 화면 effect도 무효 응답을 해석 전에 제외한다.

로컬 Vitest 13개 성공: 30개 구간×100 point/1 region/1 edge 후 첫 구간 복귀 시 active 100/1/1 유지, partial flag 유지, LRU evict 후 재조회, exact partial dedup, partial coverage 재사용 금지, 30초 pointer 재조회/409, Revision mismatch, superseded/page exit/late response, 기존 adapter route. 실제 WebKit에서 30개 query 교체·복귀·실패 후 마지막 성공 화면 유지 시험도 추가했다. 이는 synthetic query 교체 correctness 시험이고 R3의 실제 장시간 이동/600 active frame 시험을 대체하지 않는다. CI·모바일·배포 증거는 PR에 후속 기록한다.

아직 A4 미완료: geometry/edge completeness의 별도 계약, 더 작은 active 후보 선정, Composite 원형 재사용, fade 정리, R3 연속·왕복 성능, 기존 fixed gate 재검증이 남는다. 화면의 새 밀도 규칙이나 renderer 교체는 없다.


### Slice 26 배포 checkpoint

PR #230 head 37ac4e8 (동작 코드 38857b5)의 CI 36331858193은 quality/PostgreSQL/build/audit, WebKit 30개, secret scan 성공. 첫 실행의 29개 성공/1개 실패는 새 시험이 내부 오류 문자열을 기대한 오류였다. 실제 한국어 안내 문구로 시험을 수정했으며 runtime은 변경하지 않았다. squash main a355d06d3ae8a3e9bf58e9edf9f7f2a412b78db8의 Railway web/API/worker 배포는 모두 SUCCESS. main CI 36332056026과 post-deploy는 확인 중이다.

동작 코드 38857b5의 scale run 36331601642에서 1k/10k sparse/dense/shared/large 8개 mobile job이 성공했다. dense pan p95/max는 1k 18/98ms, 10k 18/66ms였다. 단일 실행의 통과이며 지속 탐색 해결·A4 exit 주장이 아니다. 최종 head의 재실행과 100k 결과는 후속 확인한다.

## Slice 27: Composite 원형과 화면 후보 계산 분리 — R2 첫 checkpoint

GraphShell에서 세계 좌표의 Composite hull 생성과 viewport별 선택을 분리했다. bounded 현재 응답에 대해 원형과 부모/자식 관계를 준비하고, 화면 이동에서는 역산한 viewport 및 기존 16px point buffer로 필요한 기존 관계 집합만 선택한다. 가로·세로 배율을 각각 역산하며, 화면 밖 자식 support point/polygon도 원형 계산에 보존한다. 기존 convex/concave hull·부모/자식 closure·depth·label/fade 의미는 유지한다. loading/error 상태 변화만으로 원본 배열을 다시 만들지 않고, 동일 cached response의 반복 해석도 마지막 1개 참조 안에서 재사용한다.

로컬 3개 시험: convex/concave에서 화면 밖 support 보존·600회 범위 교체에도 동일 hull 객체 재사용·빈 region의 bounds fallback·9가지 독립 X/Y 배율에서 이전 screen-space point seed 판정과 일치. 기존 렌더링 엔진·사건 밀도 정책은 그대로다. CI/WebKit/규모별 성능 및 배포 확인 전 checkpoint다.

남은 작업: geometry/edge completeness 구분, point/edge/label 화면 후보 계산 제한, fade 퇴장 정리, 실제 지속 조작/왕복 시험과 전체 고정 gate. 원형을 재사용했다는 사실만으로 A4를 닫지 않는다.


### Slice 27 배포와 고정 frame 재검증

PR #231 head 461ac26의 CI 36332336817 및 main 29287ef82e1b51c3f9a765a508a6d24824fbed50의 CI 36332633985 성공. Railway 세 서비스 SUCCESS, post-deploy 36332831401의 readiness/expected SHA·운영 mobile A3·인증 authoring-to-public 성공. Slice 26도 main CI 36332056026/post-deploy 36332258661 성공으로 확인을 마쳤다.

통과 실행만 채택하지 않는다. PR #230 최종 head 37ac4e8 scale 36331858204는 1k dense pan p95/max 18/132ms로 실패했다(나머지 mobile 11개·worker 2개 성공). PR #231 scale 36332336741은 1k sparse와 100k large pan이 각각 18/109ms로 실패했다. 100k worker는 이 기록 시점 진행 중이다. 기존 100ms max 기준은 유지하고 A4를 미완료로 둔다.

## Slice 28: 역산 후보 조회와 항목별 퇴장 시한 — R2 후속 checkpoint

point 원본에 응답 단위 Y 정렬 인덱스를 만들고 화면+기존 16px 여유를 역산해 후보를 조회한다. 화면을 가로지르는 선의 endpoint는 화면 밖이어도 추가한다. 상세 drawer를 연 경우 기존 관계 문맥 전체는 보존한다. 선도 기존 24px 여유의 역산 범위와 교차하는 후보만 화면 변환·label 계산한다. Composite 이름의 각 후보는 label box/path에 실제로 영향을 줄 수 있는 유한한 이웃 범위를 역산해 조회한다. 프레임 안에서 같은 point 좌표는 재사용한다. 기존 이름 위치·이전 위치 유지 규칙은 바꾸지 않는다.

퇴장 시작 RAF를 이동 때마다 취소하지 않고, 각 영역이 opacity 0 전환을 시작한 시각부터 220ms 후 정리한다. 다음 화면 업데이트가 기존 deadline을 연장하지 않는다. 재진입하면 이전 퇴장 시각을 제거한다. 들어옴/나감 전환은 보존한다. 현재 snapshot 내부의 투명 영역 SVG 제외는 기존 CSS label 전환 완료 시각까지 보존해야 하므로 이번 slice에는 포함하지 않았다.

로컬 5개 시험 성공: 9가지 독립 X/Y 배율에서 역산 후보와 기존 screen predicate 일치, 양 endpoint가 화면 밖인 교차선 보존, 1,600개 point의 전체 투영과 이웃 조회 방식이 동일한 label/이전 위치 유지 결과, 600회 연속 갱신에도 퇴장 시한 유지·재진입 reset. label density의 이웃 후보 합은 전체 반복 방식의 1/4 미만이었다. 이 수치는 synthetic logic 검증이며 browser FPS 개선 수치가 아니다. CI/모바일/성능/배포 확인은 후속 기록한다.

A4 잔여: geometry/edge/Composite support의 완전성 구분, 현재 응답 안에서의 추가 region 작업 제한·투명 SVG 정리·안정성 검증, 새로고침 없는 실제 30구간 왕복과 시작/중간/복귀 각각 600 active frame 계측, 전체 fixed gate. 기존 순간 frame 초과가 아직 해결됐다는 주장은 하지 않는다.
