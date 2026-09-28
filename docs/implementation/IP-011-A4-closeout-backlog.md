# IP-011 A4 종료 결정과 후속 백로그

2026-09-28 KST. 사용자 지시: “남은 작업을 백로그로 전환하고 A4를 종료하고 문서정합성을 맞추자”.

## 결정과 효력

A4는 **사용자 승인으로 잔여 작업을 이관하여 종료(closed with deferred backlog)**한다. 원래 고정 성능 exit를 모두 통과한 완료가 아니다. 숫자 예산·fixture·assertion·실패 기록은 유지한다. A4를 재개하는 대신 아래 항목을 명시적으로 선택해 실행한다. A5의 선행 단계로서 A4 종료는 충족됐지만 A5 구현은 후속 2026-09-28 사용자 지시로 활성화됐다. A6/M5·대량 역사 입력도 자동 활성화하지 않는다.

이 결정은 기존 IP-011/reader-performance-plan/TS-006의 “모든 gate 통과 전 A4 종료 불가”라는 실행 종료 조건을 명시적으로 대체한다. World/Event/Narrative 의미, A3 UI 보존, 읽기 무결성, 기존 수치 기준과 출시 품질 요구는 완화하지 않는다. 백로그가 열린 상태를 성능 검증 완료나 production release readiness로 표현하지 않는다.

## 종료 기준선과 증거

- 코드·배포 기준: PR [#235](https://github.com/neocjmix/moirai/pull/235), main `035cc069b00c0cc722c17f8b976b36c8738335ad`.
- main [CI 36357907586](https://github.com/neocjmix/moirai/actions/runs/36357907586), [post-deploy 36358106084](https://github.com/neocjmix/moirai/actions/runs/36358106084) 성공. smoke는 공개 readiness, 운영 모바일 A3 탐색, 인증 authoring→공개 읽기를 포함한다.
- PR 최종 head `d4a56c4350279a409a84e09fdd0c44d266253a8c`의 [scale 36357642646](https://github.com/neocjmix/moirai/actions/runs/36357642646): 기존 1k/10k/100k × sparse/dense/shared/large 모바일 12개와 worker 10k/100k 성공; 추가 sustained 1개 실패. PR merge ref에서 측정한 결과이며 main 재측정으로 표시하지 않는다.
- [sustained job 108728432034](https://github.com/neocjmix/moirai/actions/runs/36357642646/job/108728432034): 30 visits/30 returns, 각 602 연속 frame. start/middle/return p95 **50/56/62ms**, max **100/84/92ms**. 전체 interaction p95 **50/56/63ms**. 기준 p95 ≤33.4ms/max ≤100ms 중 p95 미충족.
- 동일 복귀 화면의 IDs/geometry, DOM 229, source 247 entities/9 regions 유지. cache 최대 8항목/700360 직렬화 bytes, pending 0, overdue exit 0. cache bytes는 heap이 아니다. 최신 실패 목록은 세 checkpoint의 frame/whole-frame뿐이며 이전 실행의 Collection 입력 실패를 최신 실패로 중복 기재하지 않는다.
- 이미 검증된 범위: bounded snapshot/cache·취소·geometry 재사용·완전성 분리·투명 paint 정리, 서버 full-route 12-case cold/warm/bytes/object/growth, PostgreSQL authoring query, worker build/recovery. 상세 수치와 이전 실패는 [A4 실행](../evidence/ip011/a4-execution.md), [full-route 원시 시료](../evidence/ip011/a4-full-route-final.json), [A1 예산](../evidence/ip011/a1-execution.md)에 보존한다.

## 후속 백로그

아래 우선순위는 제안된 작업 순서이며 자동 실행 지시가 아니다. 실행 책임은 후속 reader 성능 작업 담당자에게 있고 활성 상태는 CURRENT가 소유한다.

| ID / 상태 | 우선순위·수행 시점 | 남은 작업·위험 | 완료 조건 |
| --- | --- | --- | --- |
| A4-B01 / open | P1; 다음 성능 작업, A5 채택 성능 판정 전 해결 또는 명시적 재결정 | 지속 조작 p95 초과와 시작→복귀 악화 원인 분리. React/geometry/label/SVG paint, WebKit presentation 및 시험 입력·host 영향을 구분. 관측만으로 누수나 해결 불가능을 단정하지 않음 | 동일 고정 profile에서 기존 12개·R3 시작/중간/복귀 각각 active 600+ frame 및 whole interval p95 ≤33.4ms/max ≤100ms. raw samples·원인·수정·CI·배포 smoke 기록. 환경/기준 변경이 필요하면 별도 근거와 명시적 결정으로 기록하고 원래 실패 보존 |
| A4-B02 / open | P2; B01 profile이 병목을 확인할 때, A5 표현/공급 실험과 조율 | 현재 응답 안의 region 변환·parent/child closure 등 잔여 반복 작업 축소. 원형/선/부분 support를 보존해야 함. DOM 상한만으로 계산량 상한을 증명하지 않음 | 동일 Revision/화면/선택의 IDs·geometry·label·교차선·partial 의미 보존, 30구간 복귀 후 후보/계산량/퇴장 객체가 과거 방문량에 따라 누적되지 않음. 프로파일상 유효 병목이 아니면 측정 근거와 함께 불필요 판정 가능; frame 효과는 B01에서 별도 검증 |
| A4-B03 / open | P2; 후속 성능 검증, 사용자 체감 해결 주장 전 | 실기기 장시간 체감과 메모리 증거 부족. CI iPhone 14 WebKit emulation 및 hybrid RAF 입력을 실제 iPhone과 동일시하지 않음 | 실제 touch 장시간 탐색·복귀·zoom/toggle의 단말/브라우저/시간 조건과 결과 기록. WebKit heap 측정 불가 시 한계를 유지하고 가능한 보조 관측을 구분. 다른 브라우저 heap이나 직렬화 bytes로 WebKit heap 통과를 주장하지 않음 |

A5의 최신 순서는 [Graph 중심 Collection Discovery 계획](IP-011-A5-collection-discovery-plan.md)의 S0~S7이 소유한다. 이전 reader-performance-plan의 E1~E3는 대체됐고 tile/cluster는 조건부다. A5 구현 활성이고 A6/M5는 비활성이다. B01의 실패를 숨기는 수단으로 간주하지 않는다. A5 채택 시 이 기준선과 동일 fixture에서 표현 품질과 비용을 비교하고 열린 성능 항목의 disposition을 보고한다. A6/M5 실행·출시 판단 시에도 열린 항목을 명시적으로 재검토한다.

## 정합성 및 이력 규칙

CURRENT는 A4 종료와 A5 구현 활성을 표시한다. IP-011은 단계 의존성과 종료 예외를, TS-006은 수치 요구와 이번 실행 종료의 차이를 표시한다. A4 handoff와 R1–R3는 종료 전 계획/측정 기준으로 보존한다. A1/A4 실행 로그의 당시 “미완료/미배포” 문장은 역사적 기록이며 최신 판정은 이 문서와 CURRENT를 따른다. 일반 CI·smoke 성공을 성능 suite 전체 성공으로 바꾸지 않는다.
