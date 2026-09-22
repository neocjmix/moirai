# IP-008 완료 evidence

2026-09-22, 사용자 명시 승인 범위의 독립 개선. M5는 비활성이다.

## 코드와 배포

- [PR #121](https://github.com/neocjmix/moirai/pull/121), 기능 commit `e2f6f393de0005938d9465d4e5dae4fc4f98ea8b`.
- Railway Atropos, Clotho API, worker 모두 위 SHA로 SUCCESS.
- [main CI](https://github.com/neocjmix/moirai/actions/runs/35690810618) success: unit 270 pass / 2 opt-in skip, PostgreSQL integration 26 pass, 모바일 25 pass / 1 별도 규모 검사 skip, typecheck/lint/format/build/audit/secret scan 통과.
- [100/1k/10k 규모 검사](https://github.com/neocjmix/moirai/actions/runs/35690803064) 모두 success. 기존 annotation fixture는 기본 접힘을 확인한 뒤 펼쳐 읽도록 테스트를 갱신했다.
- [배포 후 smoke](https://github.com/neocjmix/moirai/actions/runs/35690992185)에서 public readiness와 인증된 authoring→Atropos 경로 모두 success.
- 로컬 WebKit은 미설치여서 모바일 검사는 CI에서 수행했다. 로컬 WAN smoke는 짧은 요청 timeout을 겪었으므로 완료 판정은 위 cloud smoke와 live UI/data readback을 사용했다.

## 실제 데이터

World `01995c2a-7b00-7000-8000-000000000101`의 current/target/served Revision이 모두 10, projection ready임을 확인했다.

- Change Set `019f6dd0-0000-7000-8000-000000000010`, Revision 9→10.
- [정정 계획](ip-008-narrative-correction-plan.json)의 51개 작업을 Moirai Live validate/commit으로 적용, errors/warnings 없음.
- 기존 Narrative 48개 정정. 역사 설명인 annotation 11개를 primary로 재분류.
- 날짜·사료 해석의 특정 보조 주석 3개 추가. Narrative 총 51개.
- 반복 문구 `월일은 확정하지 않았다`가 32개에서 0개로 감소.
- Revision 9/10 export 비교: World/Canon/Time System/Event/Relation/membership 동일. 기존 Narrative의 ID·scope·locale·public_references 모두 보존.
- 이전 Revision 9에는 원래 48개 서술과 반복 문구 32개가 그대로 남아 있다.

## 독자 및 신규 작성 경험

[훈민정음 읽기](https://moirai-production-8ed1.up.railway.app/graph/events/01995c2a-7b00-7000-8000-000000000101/019f5b00-0000-7000-8000-000000000112?revision=10)에서 primary 본문, 기본 접힘 주석과 출처, 펼친 뒤 날짜 해석과 출처 링크를 직접 확인했다. 드래그 처리기가 native summary/link 터치를 가로채던 문제도 수정했다.

MCP initialize 안내, 도구의 Narrative 분류 설명, Clotho 작성 가이드, `narrative_editorial_content` 검증 경고를 반영했다. 설치된 Moirai Live를 새로 고침한 뒤 `update narrative`, `narrative_id`, `primary/summary=prose; annotation=note`가 실제 도구 정의에 나타나는 것을 확인했다.

경고는 한국어·영어의 제한된 표현을 찾는 보조 검사다. 역사적 불확실성을 모두 지우거나, 모든 잘못된 분류를 자동으로 막는 기능은 아니다. 문단별 편집 검토를 작성 가이드에 계속 요구한다. 일반 엔티티 수정, 별도 신뢰도 점수 체계, M5 전체 기능은 이번 범위가 아니다.
