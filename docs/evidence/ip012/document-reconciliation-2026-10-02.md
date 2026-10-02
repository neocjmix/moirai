# 문서 정합성 검토 — 2026-10-02

조사 시작 baseline: main `91cffca` (PR #303). 이 문서는 documentation audit 결과이며 새로운 성능·배포 성공 증거가 아니다. 현재 배포와 후속 구현 결과는 [CURRENT](../../implementation/CURRENT.md)와 각 runtime evidence를 따른다.

## 범위와 판단 방법

AGENTS와 `docs/**/*.md` 전체를 inventory하고 local Markdown link, 현재/계획/역사 상태, 배포 승인·CI 선행 조건, Render cutover/manifest/grid 설명을 검색했다. 활성 authority인 CON-003/CORE-MODEL/BR-003/JRN-004/TS-001/002/006/008, AGENTS/IS-001/CURRENT, IP-011 A4/A5, IP-012와 ADR-012는 관련 본문을 코드·history와 대조했다. 모든 과거 측정을 재실행하거나 모든 역사 문장의 당시 사실을 재검증한 것은 아니다.

| 문서 영역 | 처리 |
| --- | --- |
| AGENTS·IS-001 | 모바일-only·직접 코드리뷰 없음·Codex Cloud 실행·frequent production checkpoint·이번 작업 쓰기/merge/deploy/incident 선승인·자율 지속을 영속화 |
| CURRENT·INDEX | 최신 상태와 실행 이력을 분리하고 활성 모바일 계획·배포 실패·미완료를 명시. 이전 CURRENT 전체 기록은 같은 디렉터리의 archive에 보존하여 기존 상대 링크 유지 |
| IP-011 A4/A5·handoff | 단계 상태는 유지하고 2026-10-02 성능 후속 작업을 연결. 과거 planning-only/다음 세션 문장을 현재 지시로 오인하지 않게 disposition 추가 |
| IP-012·ADR-012 | compiler v4 고정 signed grid·기본 GraphShell Render 데이터·viewport metadata/geometry 2단계 읽기로 정합화. 전체 manifest 선행 다운로드와 shadow-only/cutover 전 설명을 역사 상태로 분리 |
| TS-001·006 | normal Render path와 semantic discovery/detail/rollback을 분리. World/Event/representation identity, pending fetch 중 scene/history 보존, XY/scale buffering과 transition 책임 명시 |
| TS-008 | 개발 checkpoint와 release acceptance 분리. 중복 `TS-008.17` heading의 성능 적용 절을 새 `TS-008.22`로 옮기고 test 전략 절의 ID 유지 |
| Constitution·BR·domain/authoring TS | World 내부 Event identity, membership 0 허용, Event/Collection 각각 단일 Narrative를 재확인. 이번 성능 작업을 이유로 accepted ontology 변경 없음 |
| 초기 IP/M 단계·dated evidence·fixtures | 당시 기록 보존. INDEX의 역사 문서 규칙과 CURRENT archive 링크로 효력을 구분. Canon/구형 pipeline·실패 수치를 일괄 치환하지 않음 |
| Roadmap | 미래 범위로 유지. A6/M5·새 제품 기능 자동 활성화 없음 |

## 해결한 실제 충돌

1. AGENTS/IS-001에는 이미 미완료·CI 실패 checkpoint 허용이 있었지만 “주로 모바일”, 직접 URDR 재복사 기본 규칙과 일반 stop-and-ask가 최신 지시를 충분히 담지 못했다. 사용자 승인 범위에 해당하는 이번 성능 개선·배포/복구는 반복 허가를 요구하지 않게 명확히 했다. 관련 없는 product 의미·공유 자원·불명확한 정책까지 포괄 위임한 것으로 해석하지 않는다.
2. TS-001/006과 IP-012는 기본 GraphShell이 semantic path이고 Render는 preview/shadow라는 오래된 설명을 유지했다. #298/#299/#301의 실제 default Render cutover와 v4 viewport resolver를 반영했다. `?tileData=0`과 explicit tile scene은 별도로 보존한다.
3. IP-012의 bounds-derived/nonnegative grid·global manifest 설명과 ADR-012가 충돌했다. `/2` fixed frame과 compatibility `/1`을 구분하고 global manifest는 운영/무결성 자료로, browser는 bounded metadata/geometry로 표현했다. 개념 TypeScript draft를 실제 wire schema로 오인하지 않게 code authority를 연결했다.
4. CURRENT는 오래된 “다음/미배포/활성 전” 문장을 누적해 긴 실행 로그가 됐다. 이력을 archive로 옮기고 최신 baseline·불변식·backlog만 남겼다. #302의 일부 성공을 #303 CI/post-deploy 실패에 대한 성공으로 재사용하지 않았다.
5. 성능 후속 계획에 UX 목표와 검증 기준을 연결했다. 기존 A4 p95 ≤33.4ms/max ≤100ms를 유지하고 normal/delayed fetch, 양방향 LOD, identity, warm return, 메모리·실기기 한계를 별도 판정한다. Google Maps와의 실제 정량 동등성은 주장하지 않는다.

## 검증

- AGENTS 포함 전체 Markdown 134개의 inventory와 상대 file link 검사에서 누락 0개. 상세 코드·배포 결과는 이번 문서 검사의 범위가 아니다.
- `git diff --check -- AGENTS.md docs` 성공. repository formatter의 AGENTS 검증 성공. `docs/`는 기존 `.prettierignore` 대상이므로 formatter 성공을 문서 전체 formatting 검증으로 주장하지 않는다. accepted product 의미를 바꾸지 않은 scope와 역사 증거 보존을 diff에서 확인했다.
- 문서 변경은 runtime performance gate나 모바일 acceptance 통과 증거로 계산하지 않는다.
