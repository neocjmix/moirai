# 현재 구현 상태

세션과 에이전트 사이의 짧은 상태판이다. 다음 milestone은 사용자 지시 없이 활성화하지 않는다.

| 항목                       | 현재 값                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 기준 계획                  | [IP-001 — 첫 제품 구현 계획](IP-001-first-product-plan.md)                                                                    |
| 실행 상태                  | `active` — M4-B 완료; 다음 M4 slice 미착수                                                                                     |
| 활성 milestone             | M4 — 파생 모델·비교·그래프                                                                                                   |
| 현재 slice                 | 없음 — 다음 slice는 사용자 지시 후 선택                                                                                        |
| 업로드·배포 승인           | 2026-09-02 KST 사용자가 공개 `neocjmix/moirai` main 업로드·기존 Railway 배포를 명시 승인; 현재 synthetic World 검증 범위 유지 |
| 완료 milestone             | M0 전달·관측·보안 기반; M1 최초 vertical slice; M2 세계 확장; M3 Clotho 최소 작성; M3-R 책임 분리·배포; M3-C 실제 연결       |
| M4-A 검증 application SHA  | `0bbabae947761b0cc380951a56677bd7e443db09`                                                                                    |
| public integration URL     | <https://moirai-production-8ed1.up.railway.app/>                                                                              |
| Clotho synthetic World     | <https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101>                                   |
| Clotho 인증 API            | <https://desirable-vitality-production-eb95.up.railway.app>                                                                   |
| M4-A 구현 CI               | [33861480738](https://github.com/neocjmix/moirai/actions/runs/33861480738) `success`                                          |
| M4-A 배포 smoke            | [33861786238](https://github.com/neocjmix/moirai/actions/runs/33861786238) `success`; Clotho synthetic revision 21            |
| M4-B 검증 application SHA  | `a396a3a5c4e7dd64374813e56fd9e1d597a292e9`                                                                                    |
| M4-B 구현 CI               | [33879616711](https://github.com/neocjmix/moirai/actions/runs/33879616711) `success`                                          |
| M4-B 배포 smoke            | [33879771900](https://github.com/neocjmix/moirai/actions/runs/33879771900) `success`; Clotho synthetic revision 23            |
| 최근 bearer smoke          | [33787516972](https://github.com/neocjmix/moirai/actions/runs/33787516972) `success`; 실제 OAuth 검증과 별도 근거             |
| 실제 OAuth 검증            | [M3-C 검증 기록](M3-C-VERIFICATION.md), [재현 가능한 synthetic plan](evidence/m3-c-oauth-recovery-plan.json)                  |
| 현재 배포 SHA·마지막 smoke | 공개 `/__status`와 최신 `Post-deploy smoke` workflow 참조                                                                   |

## M3-C 검증 상태

2026-09-02~03 실제 ChatGPT OAuth로 작업했다. 전달받은 revision 14 대신 작업 전 15를 재조회했다. validate 후 revision 15와 신규 Event 부재를 확인하고, 한 Change Set으로 Event·Relation·Narrative를 commit해 revision 16을 만들었다. 동일 요청은 replay되며, 같은 ID의 다른 내용은 거절됐다. Atropos의 current/target/served 16, manifest와 Event digest, 공개 Narrative·Relation을 확인했다.

허용 World 밖의 검증용 ID 조회는 실제 OAuth 호출에서 `forbidden`으로 차단됐다. scope 축소·권한 미승격·토큰 유효성·최종 인가·OIDC 미설정 거절은 OIDC/MCP/Lachesis 15개 자동 테스트로 확인했다. 별도 Auth0 read-only 토큰을 발급하는 live 검증은 하지 않았다.

세션 시작 시 Clotho OIDC 설정이 제거된 상태였다. 기존 설정을 복원한 배포 `a89a8b70-eee9-4aed-94fe-874dfc13aff3` 이후 MCP가 정상화됐다. 긴급 차단 배포 후 metadata 503을 확인했지만 MCP 호출은 인증 처리에서 완료되지 않고 중단됐다. 기발급된 유효 Auth0 토큰의 live 거부는 미완료로 남긴다. 원본 OIDC 설정 복원 배포 `c4eb2a7f-f60b-40e6-80a4-6c9a4e1d4790`의 Active, metadata 200, readiness 200·동일 SHA를 확인했다. 첫 복원 후 MCP 재조회는 시간 초과였지만, 후속 실제 OAuth 재조회는 성공했다. CI bearer smoke 이후 current/target/served revision 17·ready를 재확인했다. 후속 시험 앱과 [동일 토큰 검증 도구·운영자 실행 가이드](M3-C-OIDC-DRILL.md)를 준비했다. 긴급 차단 자체는 자동 테스트와 metadata fail-closed로 확인했고, 동일한 기발급 토큰의 live HTTP 401 증거만 운영자 후속 검증으로 보류한다. 이는 M3-C 마감을 막지 않되 완료한 것으로 과장하지 않는다. 이 준비 과정에서 Clotho OIDC 설정을 다시 변경하지 않았다.

## 유지하는 운영 경계

- Auth0 운영자 한 명·synthetic World 하나·read/write 교집합 제한을 유지한다. provider 식별자·subject·token·설정 JSON은 공개 문서에 넣지 않는다.
- Clotho가 외부 HTTP/MCP·인증·작성 맥락을, Lachesis가 내부 최종 인가·정본 질의·commit을 소유한다. Atropos는 공개, worker·DB·Lachesis application은 내부 경계를 유지한다.
- 원본 Lantern fixture revision 2를 유지한다. 신규 검증 콘텐츠는 Clotho synthetic World에만 기록한다.
- M3-R 구현 `edfc16ee74afe06ef2ae6152472dcd66b370c3ad`의 [CI 33543491177](https://github.com/neocjmix/moirai/actions/runs/33543491177)·[smoke 33543795041](https://github.com/neocjmix/moirai/actions/runs/33543795041) 성공 이력을 유지한다. [M3-R 경계](M3-BOUNDARY.md), [연결·복원 절차](M3-CONNECTION.md)를 따른다.
- 실제 iPhone 기기 시험과 application version rollback 실연은 하지 않았다. OIDC 설정 차단·복원과 application version rollback은 다른 검증이다.
- M3-C의 동일 토큰 긴급 차단 live drill은 [운영자 가이드](M3-C-OIDC-DRILL.md)에 따라 별도 수행한다. M4 작업이 이를 완료한 것으로 바꾸지 않는다.

## M4-A 완료

[M4 파생 모델 구현 기록](M4-DERIVED-MODELS.md)에 따라 기존 Canon·Event·시간 배치·`precedes` 관계만 읽는 결정적 Timeline projection, Revision별 immutable graph artifact와 Atropos의 접근 가능한 텍스트 탐색을 배포했다. `0bbabae947761b0cc380951a56677bd7e443db09`의 CI와 배포 smoke가 성공했다. smoke는 정확한 Clotho 배포 SHA 확인 후 승인된 synthetic World 하나에 원자적 Change Plan을 commit·재실행하고 revision 21의 Timeline artifact와 Canon SSR 공개를 확인했다.

M4-B Subject handle reconciliation과 공개 Subject 경로까지 완료했다. Process·State·Duration, JointJS 상호작용, 100k scope·LOD와 Canon 비교는 아직 시작하지 않았다.

## M4-B 완료

[M4 파생 모델 구현 기록](M4-DERIVED-MODELS.md)의 Slice B에 따라 Canon별 identity equivalence component와 lineage를 결정적으로 계산한다. `subject_handles` 운영 식별 표면은 분리 시 anchor component에 유지되고 병합 시 오래된 handle을 대표로 두며 나머지는 redirect한다. Revision별 Subject artifact, Canon 진입점, stable Subject URL과 검색을 공개했다.

`a396a3a5c4e7dd64374813e56fd9e1d597a292e9`의 전체 CI와 Railway 3개 서비스 배포가 성공했다. 배포 smoke는 정확한 배포 SHA를 확인하고 승인된 synthetic World 하나에 identity Relation을 포함한 Change Plan을 commit·재실행한 뒤 revision 23의 Subject artifact·semantic digest·immutable cache header, Canon SSR과 stable Subject page를 검증했다.

Process·State·Duration, JointJS canvas·subject lane 배치, 100k scope·LOD와 Canon 비교는 이번 slice에 포함하지 않는다.
