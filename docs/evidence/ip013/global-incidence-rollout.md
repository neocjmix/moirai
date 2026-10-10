# 전역 incidence 운영 승격과 전체 Render 발행

2026-10-10. 사용자 지시: GitHub Pages의 “전역 incidence · 데이터 기반 중심”을 먼저 프로덕션에 배포하고 전체 퍼블리싱한다. 이전 Lab-only 범위는 이 후보와 이 발행 작업에 한해 대체됐다. CON-003·TS-005·TS-006·TS-010·IP-012의 identity/시간/발행 불변식은 유지한다.

## 승격할 결과

`global-incidence/1`, iterations 90, 관계 시간 척도 24 display-years, spacing 32 world X, membership cohesion 0.7, authored relation cohesion 0.35. 국가명·고정 레인·Event 복제가 없다. 이전 좌표 prior를 사용하지 않는 검토한 cold solve와 동일하다. 시간 국소 후보는 이번 운영 선택이 아니다.

공유 pure incidence 구현을 graph-presentation으로 옮겼으며 실험 adapter도 그 구현을 사용한다. Lab 파일을 제품 엔진에서 import하지 않는다. 입력의 `incidence: collection-incidence/1`은 World-wide membership·contains·Event 관계를 명시하며 snapshot digest에 포함된다. 기존 immutable Lab preset은 legacy 후보로 재생할 수 있다. membership 변경이 X를 바꿀 수 있지만 viewer Collection toggle은 발행 좌표를 다시 계산하지 않는다. 정확한 authored contains support와 모든 temporal Y·미배치 identity를 유지한다.

실제 공개 역사 r56의 539개 배치 결과는 검토 당시 Pages release `4c3723c`에서 전역 후보를 실행해 독립 캡처했다. shapes JSON SHA-256은 `6032f46d8b340c9e5d610e4388e12e35940f92d57432e77dfb992f7bca33d545`이며 승격 구현과 exact 일치한다. 과거 legacy /1·/2 golden JSON bytes 회귀도 명시적 legacy selection으로 유지한다.

## 전체 발행 경계

worker의 명시적 one-shot `IP013_RENDER_BACKFILL_ALL=1`, `IP013_RENDER_BACKFILL_RUN_ID=<고유 실행 ID>`는 active 공개 v5 World를 각각 현재 served Revision에 pin하고 모든 Time System·전체 World를 컴파일한다. 기존 advisory lock 12012로 deferred renderer와 병렬 실행을 막는다. 완전한 coverage proof와 immutable upload/readback 이후 source-pinned CAS로 render-current만 교체한다. World별 이전 pointer는 `worlds/<id>/render-rollbacks/<run-id>.json`에 immutable backup한다. 한 World 실패는 다른 World와 ordinary worker를 멈추지 않으며 partial 결과를 로그로 남긴다. 실행 완료 후 one-shot 변수는 비운다.

canonical `current.json`·Revision·정본 데이터·기존 immutable spatial tree는 바꾸지 않는다. 모든 새 글의 future publication은 선택한 shared engine을 사용한다. 이 rollout은 전체 Render 재발행이며 과거 canonical root를 덮어쓰는 작업이 아니다. 명시적 `tileData=0` semantic rollback은 기존 좌표를 사용한다. 기본 Render 화면의 camera navigation bounds는 현재 generation의 summary bounds를 사용하여 old spatial tree와 새 X 범위가 충돌하지 않게 한다. compiler는 좌표 계산 알고리즘과 별개이므로 v4를 유지하며 manifest와 bounded summary에 `layoutAlgorithmVersion`을 기록한다.

## 검증과 알려진 위험

전역 후보는 이전 실험에서 국소 후보보다 분리는 강하지만 공유 Event 접근성과 시간 국소성이 나빴다. 이번 요청은 운영 관찰을 위한 후보 선택이며 국소성 해결 완료가 아니다. 새 사건/소속의 cold recompute는 기존 X를 움직일 수 있다. 100k 계산 측정은 연구 보고서 참조이며 actual 모바일 FPS 또는 publication SLA가 아니다.

고정 카메라 렌더러/gesture 회귀 fixture는 명시적 legacy 배치를 유지한다. 처음 전체 fixture를 전역으로 바꿨을 때 위치·클릭 대상·camera 범위의 전제가 달라져 11개 중 3개가 실패했다. 이를 전역 후보의 성공으로 기록하지 않는다. 공유 ID·시간·reviewed geometry·실제 whole-publication proof는 별도 검증하고 공개 배포를 다시 관찰한다. Chromium mobile emulation은 실제 iPhone 17 Safari/PWA가 아니다.

최종 자동 검증·배포 SHA·전체 재발행 count·공개 smoke 결과는 아래 실행 결과에서 기록한다. 의존성 manifest/lockfile 변경 없음. 기존 Next Image Optimization high advisory와 관련 moderate/low advisory 때문에 dependency audit는 실패한다; 이번 범위에서 업그레이드하거나 gate를 약화하지 않는다.

## 복구

일반 실패는 기존 generation pointer를 유지한다. 관찰 결과 전역 후보를 철회할 경우 canonical selection을 legacy-force로 되돌리는 별도 attributable commit을 배포하고, `IP013_RENDER_BACKFILL_LAYOUT=legacy-force`, 새 run ID, ALL=1로 전체 재발행한다. 이 경로는 in-memory publication test에서 실제 실행해 canonical root 유지·이전 pointer immutable 보관·반복 실행·backup conflict rejection을 검증한다. 저장된 이전 generation/backup과 immutable assets는 삭제하지 않는다. pointer를 직접 복원한다면 World/revision/source digest와 현재 generation의 일치를 검사하고 CAS 해야 하며, 새 canonical Revision을 예전 것으로 되돌려서는 안 된다.

## 실행 결과

배포·공개 검증 후 갱신한다.
