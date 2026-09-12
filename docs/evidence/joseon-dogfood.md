# 조선 전기 도그푸딩 데이터

2026-09-12 사용자가 기존 production 샘플 전체 삭제와 조선 건국 과정부터 세조
치세까지의 역사 데이터 작성을 승인했다. M5는 활성화하지 않는다.

## 범위와 입력

- World 하나, Canon 하나, Gregorian-compatible Time System 하나.
- 황산대첩(1380)부터 세조 양위(1468)까지 주요 사건 32개.
- 건국 과정과 태조·정종·태종·세종·문종·단종·세조 치세를 묶은 Composite 8개.
- 각 사건에는 공개 자료에 근거한 짧은 설명과 출처 링크가 있다.
- 사건은 해당 서력 연도의 시작 이상, 다음 해 시작 미만이라는 시간 관계로
  표현한다. 연도 범위는 사건의 지속시간이 아니며 정확한 월일도 아니다.
  음력 월일을 양력으로 잘못 표기하거나 임의의 정확한 날짜를 넣지 않는다.
- 같은 해 안의 순서 5건은 문헌에 드러나는 순서만 입력한다. 원인 관계는 추정하지 않는다.
- Composite의 선별과 묶음은 편집이다. 정확한 재위 일수는 주장하지 않는다.

생성기: `scripts/prepare-joseon-dogfood.ts`.
입력 원본: `docs/implementation/fixtures/joseon-dogfood.change-plan.json`.
자동 seed 또는 startup hook이 아니며 실행 자체는 파일 생성과 로컬 검증만 한다.

`scripts/post-deploy-smoke.ts`의 production 읽기 검증도 새 Canon revision 1과
Gregorian frame으로 전환한다. Event 40·Relation 124, Canon membership, 황산대첩과
건국 사건 및 연도 하한 Relation을 확인한다. 이전 겹치는 Canon 사례는 격리된 CI
테스트에 유지하며 삭제된 production 샘플을 다시 만들지 않는다.

## 삭제 대상

| World | ID | 이전 revision | 발행 object 수 |
| --- | --- | --- | --- |
| Graph Scope Observatory | 01995c2a-7b00-7000-8000-000000000101 | 4 | 78 |
| Temporal Expressiveness Observatory | 019f3b00-0000-7000-8000-000000000001 | 2 | 35 |
| Temporal Expressiveness import | 019f3b00-0000-7000-8000-000000000401 | 1 | 30 |

전체 inventory에 다른 World나 orphan prefix는 없었다. 기존 Clotho 작업 World ID는
작성 접근권한을 유지하기 위해 재사용한다. Canon·Event·Relation·Time System은 모두
새 ID다. 삭제 후 이전 World revision URL은 보존하지 않는다.

삭제는 inventory/Revision 재확인, 발행 작업 부재 확인, content table lock 후 단일
transaction으로 진행한다. 스키마·migration·인증 설정은 유지한다. 발행 파일도 확인한
세 World prefix의 실제 key만 삭제한다. 자동 smoke는 read/auth 검증만 하며 샘플을
재생성하지 않는다. 저장소의 격리된 테스트 fixture는 production 데이터와 별개다.

## 검증 상태

- 생성기의 domain candidate 검증 통과.
- 기존 World revision 4에서 새 내용만 live Clotho validate: valid, warnings 0.
- TypeScript strict typecheck와 생성기 lint 통과.
- Production reset: 3 World content 및 143 object 삭제, 잔여 object 0.
  Railway reset deployment `215c4633-3fec-4a98-ac97-9903994d6c54`.
- 빈 World revision 0에서 Clotho validate 통과 후 364 operations를 단일 commit.
  Change Set `019f5b00-0000-7000-8000-000000000001`, warnings 0.
- Read-back: Event 40, Relation 124, Narrative 32, `truncated=false`.
  전체 Event ID가 입력과 일치한다. `current/target/served=1/1/1`, `ready`.
- `/graph`에서 새 World 1·Canon 1, 황산대첩·건국 과정 렌더와 사건 선택을 확인했다.
  inspector의 시간 근거는 `1380-01-01` 이상, `1381-01-01` 미만이며
  `1380년 범위`로 표시된다.
- stable Event 페이지에서 한국어 설명·연도 범위·우리역사넷 출처 링크를 확인했다.

## 임시 운영 작업 정리

임시 Railway function `b4a63154-c859-4ad6-811f-61fc7f3bf0fd`는
`restartPolicyType=NEVER`, 공개 domain 없음이다. 서비스 설정의 start command는
`bun -e 'console.log("sample reset disabled")'`로 변경했다. 다만 Railway `redeploy`는
기존 deployment snapshot을 재사용하여 이전 reset 코드가 빈 DB에서 한 번 더
실행된 것을 확인했다. 이는 새 Clotho commit 이전이며 삭제할 object도 0개였다.
이전 reset 코드는 새 World slug/revision이 존재하면 inventory guard에서 거절한다.

임시 service 삭제를 별도 patch로 stage했으나 Railway가 dashboard 2FA를 요구하여
API commit이 차단됐다. 이후 사용자가 대시보드에서 삭제 완료를 확인했다. 다른 자원
삭제나 인증 변경으로 우회하지 않았다.

## 데이터 교체 당시의 UI 결함 (후속 수정 완료)

후속 [도그푸딩 백로그 수정](dogfood-backlog.md)에서 아래 두 결함을 수정하고 배포했다.

좌측 축이 비어 있는 원인은 Moirai workspace bootstrap에서 `chronologyBoard`를
전달하지 않는 것이다. Gregorian-compatible 데이터를 넣는 것만으로 해결되지 않는다.
이번 데이터 교체는 이 renderer 연결 결함을 수정한 것으로 보고하지 않는다.

한국어 Narrative는 정본에 32개 존재하지만 graph inspector의 황산대첩 응답에서
`narratives=[]`가 관찰됐다. 발행 read 연결을 도그푸딩 backlog로 남겼다. 후속 조사에서 locale 문제가 아니라
Canon 문서에서 Event Narrative를 찾던 조회 경로 문제로 확인하여 수정했다.
