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
