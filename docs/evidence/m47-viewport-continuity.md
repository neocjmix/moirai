# M4.7 — viewport 연속성과 탐색 경계

사용자가 복귀 버튼을 제외한 탐색 개선과 구현·배포를 승인했다. M5는 비활성이다.
정본, Gregorian 시간 의미, URDR renderer/layout/spatial 알고리즘은 변경하지 않았다.

## 구현

- A (PR #72): 성공한 viewport geometry를 loading/error 중 유지한다. 전체 artifact class를
  한 번에 요청하고, 부분 응답은 ID 병합하며 완전한 응답만 이전 요소를 제거한다.
- loader별 최대 8개/8 MiB LRU, padded coverage 재사용, 같은 요청 중복 제거,
  동시 2개 제한과 오래된 요청 취소를 적용한다. query/source/revision/frame에 격리하고
  Canon 순서, 선택, 배율, 화면 크기, artifact class를 구분한다.
  부분/stale 응답은 성공 cache로 보관하지 않아 다시 읽을 수 있다.
- B (PR #73): 선택 Canon 전체 metadata bounds와 기존 수평 offset으로 탐색 경계를 만든다.
  부족한 metadata에는 제한을 강제하지 않는다. 현재 viewport 결과로 경계를 줄이지 않는다.
- 바깥 drag에는 최대 화면 18%의 저항 영역을 주고 release 후 180ms 복원한다.
  reduced-motion은 즉시 복원한다. 각 축 최소 배율과 단일 사건 최소 span을 별도로 적용한다.
  먼 URL은 focus 또는 전체 데이터 범위로 복원한다. 복귀 버튼은 추가하지 않았다.
- C (PR #74): pointerup의 오래된 render closure가 마지막 pinch move를 덮어쓰는
  회귀를 수정했다. 기존 functional pointer 제거 후 committed 상태에서만 복원한다.
  복원 애니메이션 중 spatial read도 gesture debounce를 사용한다.
- PR #75: 복원 검사를 임의 좌표 상한에서 실제 사건의 화면 교차 검사로 수정했다.

## 검증 과정과 한계

- A checkpoint CI `34732684328`: 기존 mobile 13개 통과. 새 오류 문구 예상값 불일치를 수정했다.
- B checkpoint CI `34733191140`: build/unit/integration/security 통과, pinch 회귀 발견.
- C runtime `d228aec3115ca704eca39abaa80c40e5168ce430`, CI `34733467892`:
  build/unit/integration/security 통과, mobile 16개 통과. 나머지 복원 검사는 fixture의
  유효한 중심 좌표에 잘못된 상한을 가정하여 PR #75에서 수정했다.
- 새 단위 검사: cache 재사용/순서/선택 격리/LRU/부분 응답 재시도/취소/부분 병합,
  전체 Canon 경계 합성/불완전 metadata/저항/독립 배율/단일 사건/focus 복원/pinch 중심.
- 실제 production `d228aec`의 `/__status` SHA 확인. 먼 URL에서 32개 조선사 point가
  표시되고, 두 번의 외곽 drag 모두 최종 center `0,193200.134157`로 복원됐다.
  드래그 중과 복원 후 point 32개가 유지됐다. Gregorian 축과 Composite 형상도 확인했다.
- production fixture는 조선 전기 World revision 1이다. 이 작업은 정본에 쓰지 않았다.
- 모바일 검사는 iPhone 14 크기의 WebKit 자동화이며 물리 iPhone 검증은 아니다.
  WebKit pinch는 native mouse capture와 native touch에 이동 이벤트를 결합한다.

## 최종 종료 검증

- 완료 checkpoint: `7f1da7c7cc86590d65eac401fe9824f1d3ba7f50` (PR #75).
  runtime 소스는 `d228aec`와 같다.
- [CI 34733627018](https://github.com/neocjmix/moirai/actions/runs/34733627018): success.
  44개 unit 파일/219개 test, PostgreSQL integration 5개 파일/25개 test,
  strict typecheck/format/lint/boundaries/production build/audit/secret scan 통과.
- Mobile WebKit 17개 모두 통과: 느린/실패 응답 중 그림 유지, 먼 URL의 실제 visible geometry,
  반복 외곽 drag 경계, 가로 단독 pinch, 기존 독립 pinch, 100k bounded read,
  선택/필터/검색/URL/뒤로가기 회귀 포함.
- [Post-deploy smoke 34733714577](https://github.com/neocjmix/moirai/actions/runs/34733714577): success.
  공개 readiness 및 authenticated Clotho authoring→Atropos 검증 통과.
- Railway Atropos/Clotho/worker 세 서비스가 모두 동일 `7f1da7c`로 SUCCESS.
  공개 `/__status`에서도 exact SHA 확인했다.
- A~C 종료. M4.7 완료, M5 비활성. 다음 단계는 조선사 데이터로 사용자 도그푸딩이다.
