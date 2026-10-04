# IP-012 모바일 성능·연속성 작업 종료

2026-10-04 UTC. **사용자 체감 수용에 따른 종료 — 수치 gate 전체 통과 아님.**

## 결정

사용자는 iPhone 17 Safari/PWA로 운영을 사용한 뒤 “현재 운영에서 사용해본 경험으론 상당히 원활해”, “성능개선 작업은 마무리하자”라고 명시했다. 추가 성능 탐색을 종료하고 이미 병합한 변경의 검증, 잔여 코드·버그 정리와 안정화까지만 마친다. 이 결정은 모바일 연속성 계획과 AGENTS의 목표 달성까지 자율 튜닝하라는 이전 실행 지시를 대체한다.

기존 p95 ≤33.4ms/max ≤100ms 기준, 실패 기록과 회귀 assertion은 그대로 둔다. 미달을 통과로 바꾸거나 출시 준비 완료로 표현하지 않는다. 이후 세션은 새로운 사용자 요청이나 구체적인 기능·체감 회귀 없이 숫자 미달만을 이유로 이 튜닝을 자동 재개하지 않는다. A5 제품 기능과 IP-012 publication 잔여 작업은 별도 backlog이며 이번 종료가 전체 milestone 완료나 그 잔여 기능의 자동 착수를 뜻하지 않는다.

## 확정 구현

- 기본 WebGL2 배경 hull/point와 native SVG label·relation·touch/keyboard targets. 미지원·context loss 시 SVG 복귀; Canvas/SVG 비교 경로 유지.
- 전체 화면 gesture image cache 제거. 이전 frame의 CSS 크기와 새 camera/backing buffer를 원자적으로 반영해 resize 직전 비율 왜곡을 방지.
- 지연 fetch와 XY/scale coverage 전환에서도 authored identity·기존 paint를 유지. hull/point/label fade·반전·prune, Collection·camera 복원과 drawer 동작 보존.
- bounded publication·geometry·label contour cache. 같은 응답의 불필요한 loading/commit 제거; native 글자 경로를 유지하며 pan만 평행 이동.
- World 단위 Event identity, 공유 membership, contains/Composite 의미와 기존 UI 문법 유지. 새 infrastructure나 canonical 데이터 변경 없음.

## 종료 검증 기준선

마지막 runtime 변경은 [PR #320](https://github.com/neocjmix/moirai/pull/320), `d3e79d7fdd92e6977cf68af0cb8f9a9a85a99521`이다. Railway `5e869ff6-f3ff-4363-8e17-2f8eff4e8b25` SUCCESS와 exact-SHA smoke를 확인했다. main CI `37212609953`, branch CI `37212514229`, A5 `37212610010`, IP-004 `37212514173`도 성공했다. 이후 정리 commit은 이 runtime을 보존한다. 상세 CI·배포 판정은 [CURRENT](CURRENT.md)와 [evidence](../evidence/ip012/mobile-continuity-2026-10-02.md)에 기록한다.

- full mobile40개 통과, 기존 조건부1개 skip. 실제 compiler/4 11개 통과:0/250/750ms 읽기, identity, glyph touch, camera/Collection 반전, resize, fallback.
- native text는 path `d`와 DOM identity를 유지하고2px pan에 글자 크기 변화·수직 drift 없이2px 이동. 기존1008-placement digest와 geometry8개 통과.
- 직전 runtime 전체 unit609개 통과/기존2개 skip. 동일 응답 수정 후50개 camera batch에서50 commits,11/18회 reads 완료. 기존78-commit CI 제한과 assertion 유지.
- #319 정상30회 탐색/시작·중간·복귀602frame: p95 **48/48/47ms**, max **62/60/61ms**, 준비2579.9ms, cold4/전체62요청, 오류0. cache/DOM 증가 폭은 bounded working set 안에 머묾.
- #320 마지막 정상 short0회/시작·복귀602frame: p95 **49/48ms**, max64/60ms, 준비1718.5ms, cold4/전체11요청, 오류0. 작은 변동이며 개선율·30회 통과 주장에 쓰지 않음.
- Cloud native driver는 Mesa llvmpipe software. iPhone17 GPU frame/heap 측정이 아님. 사용자 피드백은 실제 사용의 질적 수용이며 exact device build SHA·장시간 heap trace를 수집했다는 뜻이 아님.

## 버그·잔여 코드 처리

| 항목 | 처리 |
| --- | --- |
| 전체 화면 cache의 번쩍임·비율 왜곡 | 구현 제거; 재도입 방지 browser assertion 유지 |
| resize 전 old frame stretch | 재현 후 수정·운영 배포; 크기 원자성 regression 통과 |
| 동일 응답의 과도한 commit | 수정·운영 배포, main/branch CI 회복 |
| contour rounding·fractional pan | 기존0.001px 규칙과 half-grid fallback, 기존 결과 회귀 통과 |
| 사용하지 않는 gesture cache 계측 | profile script에서 제거; 과거 JSON evidence와 제거 확인 테스트는 보존 |
| Canvas/SVG diagnostic 경로 | 지원되는 비교·복구 경로이므로 삭제하지 않음 |
| 작업 범위의 TODO·미구현 stub | renderer/contour/GraphShell 점검에서 추가 발견 없음. 모든 제품 backlog 완료를 의미하지 않음 |

## 이관 backlog와 재개 조건

| 항목 | 종료 후 상태 |
| --- | --- |
| A4-B01 지속 frame 수치 | 미달·이관. 새로운 성능 작업/출시 판단 또는 실제 회귀 때 명시적으로 선택 |
| A4-B02 추가 region/closure 계산 | 일부 개선·나머지 이관. contour CPU6.7–6.9→4.0–4.3ms/회 증거 보존; 추가 최적화 자동 착수 안 함 |
| A4-B03 실기기 장시간·heap | 체감 수용 확인; instrumented device/GPU/heap 증거는 미수집으로 이관 |
| A5 capacity·200% text·접근성·pin/context/catalog | 별도 제품 backlog. 이번 안정화 범위의 미완성 runtime 코드로 혼동하지 않음 |
| IP-012 incremental publication/invalidation·재시작 scheduling | 별도 architecture backlog. full compile을 증분 완료로 표시하지 않음 |
| A6/M5·대량 역사 입력 | 이 종료 당시 비활성. 후속 [IP-013](IP-013-real-history-development-plan.md)이 A6 순서를 W/C 수용 후 제한 pilot으로 대체. 현재 입력 미착수·pilot 검토 전 자율 대량 확장 보류, M5 비활성 |

[Atropos 운영](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01995c2a-7b00-7000-8000-000000000101). 새로운 버그는 구체적인 trigger·재현·수정·회귀 검증으로 처리하며, 이 종료 결정은 통상적인 bug fix를 막지 않는다.
