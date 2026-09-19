# IP-005 Graph reader consolidation evidence

검증일은 2026-09-19 UTC다. 사용자의 “IP-005를 실행하기에 충분하고 안정적인 조건인지 확인하고 구현을 진행하라”는 지시로 문서 전용 제한을 대체하고 단계 2~7을 실행했다. M5는 활성화하지 않았다.

## 변경과 병합

- 기준선: main `e6eee45980ef0b79fc1c0ffa6abd29210583cab9`, IP-005 문서 PR #97 병합 상태.
- 구현: [PR #98](https://github.com/neocjmix/moirai/pull/98), main `6c30c7bbe8825957d4ad85b685137946d129df87`.
- `/` → `/graph`; canonical full Event URL과 SSR Graph drawer 추가.
- peek/full/closed 선택과 history를 동일 drawer에 통합하고 path를 full 상태의 권위로 사용.
- 구형 World/Canon/Event/Search UI route 및 전용 component/style 제거. `current.json`, immutable revision artifact route, Graph API와 health/status는 유지.
- Canon 생략 Event는 첫 Canon을 읽기 default로 숨기지 않고 Canon별 Narrative·시간 evidence를 구분해 표시.
- Publication projection bytes는 변경하지 않았다. 새 UI href는 runtime navigation 경계에서만 생성한다.

## 자동 검증

| 검사 | 결과 |
| --- | --- |
| PR CI | run `35454851889` success: format, lint, boundary, strict typecheck, 256 unit/contract tests(2 skipped), migration integration, production build, dependency audit, secret scan |
| Mobile WebKit | 같은 CI run success: 25개 Atropos 흐름과 Graph regression. direct full, collapse, back/forward, close 복원 포함 |
| Scale reader | run `35454851892` success: 100 / 1,000 / 10,000 Event의 실제 Next server + mobile WebKit |
| Frozen compatibility | IP-004 projection/query/spatial SHA 검사와 기존 100k bounded spatial reader 통과 |
| 로컬 route smoke | `/` 307, canonical Event 200 및 SSR `data-stage="full"`, 구형 World/Event UI 404, `current.json` 200 |
| Production route set | Next build에 `/graph/events/[worldId]/[eventId]` 존재. 구형 UI page는 없고 `current.json`·revision artifact route는 존재 |

첫 원격 WebKit 실행은 닫기 직후 back 복원과 구형 scale assertion의 실제 회귀를 검출했다. 선택 request가 일치할 때만 복원 단계를 확정하고 canonical Event path가 항상 full을 지배하도록 수정했다. 뒤의 CI·scale run은 수정 후 새 commit에서 모두 성공했다.

## 배포와 공개 QA

Railway production은 main `6c30c7b`를 세 application service에 배포했다.

| service / deployment | 결과 |
| --- | --- |
| Atropos `moirai` / `6b07ac2c-f775-40ca-baa5-2e7d0cd02587` | SUCCESS |
| Clotho `desirable-vitality` / `58e65401-64cf-487f-9aa7-6c5bdac070a8` | SUCCESS |
| worker `easygoing-recreation` / `13c783e9-11eb-41b2-bf69-dc919dd20cfa` | SUCCESS |

공개 [Atropos Graph](https://moirai-production-8ed1.up.railway.app/graph)에서 다음을 확인했다.

- `/`는 307 후 `/graph` 200으로 열렸다. Railway HTTP log에서도 같은 상태를 확인했다.
- Revision 6 `훈민정음 반포` 직접 URL은 200, `data-stage="full"`, Event/Narrative와 서로 구분된 `2 Canon contexts`를 렌더링했다.
- full → peek는 같은 Event와 Revision 6 query/viewport를 유지했다. browser back은 full, forward는 peek를 복원했다.
- 구형 `/worlds/{world}/events/{event}?revision=6` UI는 공개 환경에서 `404 This page could not be found`였다.
- 배포 HTTP log에서 `/health` 200과 `current.json` 200을 확인했다. container는 Next.js 16.3.3으로 92ms에 ready가 됐다.

canonical PostgreSQL write, migration, Publication Store 정리, credential 변경은 수행하지 않았다. IP-004 evidence는 소급 수정하지 않았고 M5는 inactive다.
