# 텍스트 가시성과 Composite 축소 단계 — 2026-10-05

시작 main/운영은 `620ca615273a519ddaee2f3c0143394df1dee90a`(#328)이다. 사용자의 여섯 가지 레이아웃 개선 요청에 따라 운영 GraphShell의 화면 표현과 독립 Layout Lab의 기본 표현을 조정한다. 관련 계약은 CON-003.7, BR-003.14, TS-006.4/6과 IP-013 R이다. Publication 좌표·시간·contains·Collection membership과 역사 정본은 변경하지 않는다.

## 동작

- 이름표가 화면 경계를 넘더라도 문구를 줄이거나 전체를 숨기지 않는다. 화면과 겹치는 부분을 그대로 그리며 화면 밖 그림은 viewport에서 자연스럽게 잘린다.
- 이름표의 밀도와 충돌 여백을 조금 완화하고 영역 이름표의 기본 진하기를 0.45에서 0.58로 높인다.
- Composite 제목은 확대율·Hull 크기·변의 길이와 무관하게 전체 문구를 유지한다. 짧은 변에서는 글씨 경로를 연장한다.
- Composite의 영역·보통 점·작은 점은 같은 색상을 사용한다.
- 화면상 최대 가로/세로 길이 기준으로 점 진입을 32px에서 20px로, 복귀 경계를 48px에서 28px로 낮춘다. 영역과 점은 20–28px에서 부드럽게 전환한다.
- 테두리는 48–36px에서 먼저 사라진다. 28–36px 구간에서는 영역의 채움과 이름표를 유지하며 테두리만 없는 단계를 거친다.

Layout Lab에는 같은 기본 표현과 별도 테두리 전환 조절을 제공한다. 이전 저장 파일의 명시 설정과 카메라·snapshot을 보존한다. 운영 화면에 실험 조절 UI나 runtime 배치 계산을 추가하지 않는다.

## 검증·배포 근거

로컬 전체 unit700개 통과/기존2개 생략 후, 마지막 화면 밖 후보·글꼴 보완의 집중58개 검사를 통과했다. format·lint·strict typecheck·dependency boundaries·workspace production build·high 이상 dependency audit·redacted secret scan을 통과했다. 빌드와 병행 중 한 번 시간 초과한 기존 1k 공간 배치 검사는 단독 재실행과 이후 전체 실행에서 통과했다.

관련 모바일 WebKit20개는 새6개 제목/표현 검사, Lab8개, 점 밀도·선택·fade·Canvas/WebGL pan 연속성을 포함한다. 처음 Canvas idle 검사가 초기 웹 글꼴 완성에 따른 정상 commit1회를 포착했다. `document.fonts.ready` 이후 측정하도록 고쳐 idle0/기존50회 pan·동일성 assertion을 유지했고 두 painter 재실행을 통과했다. 최종 CI와 운영 read-only smoke 결과는 이 변경 PR의 검증 기록을 따른다. 실제 iPhone 17 Safari/PWA 수동 검사는 자동화 결과에 포함하지 않는다.

기존 r26 기록은 당시 고정 evidence다. 작업 시작 시 실제 역사 World `01a107fb-4018-7fcb-8390-836a40fa91cc`는 source/served46으로 전진해 있었다. read-only snapshot은 Event490·Composite99·Collection6이며 input digest는 `452ddf8a3d9f0cdc7613d07dbbe59902014f1389a567aca087f35a11f815c82e`다. 실제 제목 사례는 ‘한산도·안골포 작전: 합동훈련에서 두 해전까지’(`01a107ff-8b3c-7f88-bac7-a721ce10410a`)와 ‘사로병진작전, 육지 세 길과 바다 한 길의 총공세’(`01a1082b-c2a2-74f8-84bc-2f1897d4cf4a`)다. 검증을 위해 정본이나 served pointer를 변경하지 않는다.

최종 merge SHA, Railway terminal SUCCESS와 공개 `/health`·`/__status`에서 확인한 deployed SHA는 PR에 기록한다. 사용자 확인 URL은 [운영 그래프](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc)와 [현재 역사 자료의 Layout Lab](https://moirai-production-8ed1.up.railway.app/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc)이다.
