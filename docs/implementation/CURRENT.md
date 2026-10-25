# 현재 구현 상태

2026-10-25 UTC (2026-10-26 KST). **활성 실행 기준은 [IP-018 Layout Lab v2](IP-018-layout-lab-v2.md)다.** 사용자는 Layout Lab v1 전체를 실패로 종료했다. Force 튜닝·global-incidence·TSTL A/B/C·Bubble Sets·Ribbon·Lanes/Aligned/Anchored·Organic Surface의 미완료 연구·검증·승격은 **cancelled / superseded**이며 다시 시작하지 않는다. 당시 완료·실패·미검증 결과는 [이전 CURRENT](CURRENT-HISTORY-THROUGH-LAB-V1.md)와 날짜별 evidence에 보존한다.

## 현재 작업

P0는 PR #366 / `595830221bb250321f0c1d72d7070062480109a9`로 v1 실행 코드·selector를 제거하고 기존 Force X + 시간 고정 Y + Y-sweep 기준선을 선택적으로 복구·배포했다. 전체 저장소 reset은 하지 않는다. 기준 커밋은 `4c726661c913de5920b9866344f2ca76e80a388d` (#323): 최초 v1 구현 `b28c05b`, main 도입 `290cbbe` (#324) 직전이며 당시 공개 배포와 원본 force parity가 기록되어 있다. [재조사 증거](../evidence/ip018-baseline-audit-2026-10-25.md)가 계보·보존 범위·불확실성을 구분한다.

공개 Atropos는 개발·검수 환경이며 일시적 장애를 허용한다. 이번 기준선 복구에 필요한 Render 재컴파일·immutable backup·pointer 전환은 승인되어 있다. **역사 정본, Event identity, World revision, authored 시간과 인증 경계는 변경하지 않는다.** v2의 기본 알고리즘 승격은 사용자 시각 승인 전 금지한다.

P0 공개 기준선 검증 뒤 P1의 새 독립 X-only Force Simulation을 실행한다. Iteration은 관찰 변수이며 tick N은 최종 목표 횟수와 무관하게 동일해야 한다. 기존 legacy force의 total-iteration cooling·heuristic을 v2에 복사하지 않는다. P2 의미 어댑터, P3 전체 A/B·재현 UI, P4 실제 역사 검수는 후속 단계이며 완료로 간주하지 않는다.

## 배포·검증

P0 공개 SHA는 `595830221bb250321f0c1d72d7070062480109a9`이며 세 서비스 Railway SUCCESS 및 공개 readiness smoke를 확인했다. 두 World의 정본 pointer는 byte-identical, r56/r62·source root를 유지하며 `v5-world-layout/2`로 Render 재발행 2건 성공·실패 0건이다. `/2`는 500 초과 World의 기존 bounded Force 버전이며 새 Lab v2가 아니다. 이전 generation은 immutable backup readback 뒤 보존됐고 one-shot 변수는 비웠다. [실행 증거](../evidence/ip018-execution-2026-10-25.md)와 [발행 로그](../evidence/ip018/rollback-log-2026-10-25.json)를 따른다. P1은 구현 중이다.

- [공개 역사 Graph](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc)
- [공개 배포 상태](https://moirai-production-8ed1.up.railway.app/status-public)
- [새 세션 인계](IP-018-codex-handoff.md)

## 보존·보류

IP-015 camera/scene·custom WebGL2 renderer, World 선택·Event 탐색, HUD·drawer·Collection 의미, OAuth/World 인가 및 GitHub 단기 OIDC smoke, 원자적 Render 발행·복구를 보존한다. #337 renderer 문서 PR은 여전히 open이며 이 작업에서 닫지 않는다. 기존 IP-012 모바일 성능 종료 결정과 미달 수치는 유지하고 튜닝을 자동 재개하지 않는다. 실제 iPhone 17 Safari/PWA 검증과 사용자 시각 승인은 에뮬레이션·자동 테스트로 대체하지 않는다.
