# 실험실 진입 안내와 단계별 가시성 — 2026-10-05

시작 main/운영은 `6b5c39f`(#327)이다. IP-013 R/L의 독립 `/labs/layout` 범위만 수정한다. 운영 Atropos, layout engine, Publication·served pointer와 역사 데이터는 변경하지 않는다.

사용자가 실험실 주소가 열리지 않는다고 보고했으나 확인 중 기다린 뒤 정상 진입했다고 정정했다. 공개 서버·HTTPS는 정상이며 실제 역사 페이지의 첫 바이트가 26.44초 뒤 도착했다. 기존 서버 페이지는 완전한 read-only snapshot을 읽은 뒤 첫 화면을 보내고 있었다. Lab route 전용 Next loading boundary를 추가해 기다리는 동안 한국어 안내와 연습 자료 링크를 즉시 스트리밍한다. 자료 읽기 자체의 비용을 없앴다는 주장은 아니다.

‘B의 컴포짓·사건·이름표 가시성 조절’을 영역, 보통 점, 작은 점, 숨김, 구성 사건·연결선·전환의 5묶음으로 나눴다. 영역·보통 점·작은 점 각각에 그림 진하기와 이름표 진하기를 독립 추가했다. 0은 숨김, 1은 최대 진하기다. 작은 점의 이름표도 시험적으로 켤 수 있다. 숨김 단계는 점과 이름표가 함께 사라지며, 기존 밀집 순위·전환 경계·fade·hysteresis·child reveal을 함께 시험한다. 이름의 충돌·화면 밖 억제는 유지한다.

새 표현 설정 `lab-representation/2`의 기본값은 기존 그림 가중치1/1/1, 이름표0.45/1/0과 같다. v1 preset을 읽을 때 추가된 6개 고정값만 보충하고 기존 필수값·revision·digest·카메라·history는 검증한다. 새 설정의 저장·복원·JSON export는 기존 immutable snapshot preset 경로를 사용한다. 설정 조절은 브라우저에서 수행하며 추가 network/backfill0, A/B camera와 input은 동일하다.

검증: unit689 통과/기존2생략, lint·strict typecheck·dependency boundaries·workspace build 통과. 모바일 WebKit Lab7/7 통과: 기존 핀치·스크롤 격리·A/B·save/load6개와 단계별 그림/이름 opacity 및 작은 점 이름표 저장복원1개. 순수 정책 검사는 기본 production blend 동등성, nested·overlap·offscreen·dense fixture, 각 schema control의 정확한1회 배치, 단계별 가중치와 사실 불변, v1 migration 및 새 preset replay를 확인한다. 실제 iPhone17 수동 검사는 포함하지 않는다.

최종 merge SHA·배포 결과·공개 자료 revision/digest·공개 smoke는 이 수정 PR의 최종 배포 기록을 따른다. canonical 설정 승격/backfill은 수행하지 않는다.
