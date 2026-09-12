# 도그푸딩 백로그 수정

사용자가 세 백로그 진행을 승인했다. M5는 비활성이다.
관련 기준: CON-002, CON-006, BR-003.3/6/8, TS-006.12/23.

## 시간축과 사건 설명

- Moirai bootstrap에 명시적인 Gregorian 축을 연결한다. 원본 URDR의 축·눈금·줌 선택은 유지한다.
- 현재 producer는 0000-01-01부터 365.2425일 단위 경과 시간을 좌표로 사용한다.
  축의 날짜 변환도 이 좌표에 맞춘다. 기존 fractional-year 방식과 혼동하지 않는다.
  structural/custom frame에는 Gregorian 날짜를 표시하지 않는다.
- 사건 Narrative는 Canon 문서가 아니라 revision-pinned Event 문서에서 필요할 때 읽는다.
  manifest digest, 사건 ID, Revision을 검증하고 선택 Canon의 설명·출처만 표시한다.
  한국어 데이터가 누락된 원인은 locale 필터가 아니었다.
- 원본 참고: URDR 0267c8fd081ca9a3cd556f8f7319c600248c3760,
  apps/web/src/components/graph-shell.tsx. 기존 SVG, gesture, band read는 유지한다.
- 자동 검사: Gregorian 좌표 왕복·윤일, structural 축 차단, revision 고정 및 Canon 설명 격리.

## 시간 cluster (#57)

앞선 사용자 응답의 '복합 사건 형상'이라는 설명을 정정한다. 실제 이슈는 cluster를
균등 분산하면서 개별 시간 범위를 무시하는 결함이다. 개별 bounds와 strict/non-strict/
equality를 함께 검증하고 해결 불가능하면 진단해야 한다. independent clamp는 사용하지 않는다.


수정 결과: 원본 cluster 분산은 선호 좌표로 유지하고 X force/region 계산 직전에
모든 point의 bounds와 시간 관계를 함께 해결한다. zero-gap cycle을 같은 좌표로
묶고 successor upper bound를 먼저 역전파한 뒤 정방향으로 좌표를 선택한다.
불가능한 connected group만 unplaced로 남기고 다른 group은 보존한다.
고정 display gap을 표현할 공간이 부족한 경우에도 날짜를 발명하지 않고 진단한다.
이는 canonical solver의 유효성 판정이나 시간 정밀도를 변경하지 않는다.

- 기존 정상 URDR golden snapshot, force 상수, spatial 100k 검사 통과.
- #57 재현은 [2004,2006] 범위와 A PRECEDES B를 모두 만족한다.
- nested/overlap/disjoint/one-sided interval, strict/non-strict/equality,
  infeasible isolation, 입력 순서 결정성 및 10k chain 검증 통과.
- 조선사 입력 원본으로 재생성한 40 Event가 모두 배치되고 시간 관계를 만족한다.
- algorithm `/2`, immutable presentation path `urdr-0267c8f-moirai-v2`로 올렸다.
  worker의 기존 backfill이 현재 served revision을 새 경로에 재생성한다.
  이전 v1 문서와 정본/Publication revision은 덮어쓰지 않는다.
- PR #69 (`855367b`) production: 좌측 1377~1383 눈금, 황산대첩의 한국어 본문과
  우리역사넷 링크를 실제 브라우저에서 확인했다.


## 완료 증거

- Runtime PR #70: `91f223015224eddc8d512f0ee5678376756a78d8`.
- [CI 34726121209](https://github.com/neocjmix/moirai/actions/runs/34726121209):
  typecheck/unit/PostgreSQL/build/audit, secret scan, mobile WebKit 모두 success.
- [Post-deploy smoke 34726218992](https://github.com/neocjmix/moirai/actions/runs/34726218992): success.
- Railway Atropos/Clotho/worker가 같은 runtime을 배포했다.
  worker deployment `4fe67ffb-0270-46cb-9169-95ee91cfd593`에서
  조선사 World revision 1의 `spatial_backfill: served`를 확인했다.
- 공개 `/__status` SHA가 위 runtime과 일치한다. 새 v2 graph에서 축, 황산대첩 선택,
  한국어 본문·출처 및 Revision 1 유지 확인.
- 세 backlog 완료. M5는 활성화하지 않았다. 임시 삭제 service는 사용자 삭제 완료.
- Rollback은 이전 application commit으로 가능하며 v1 표시 파일은 보존돼 있다.
