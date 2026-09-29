# IP-012 운영 백필·UI·연속 수정 확인 (2026-09-29 UTC)

## 범위와 결과

- 운영 World `01995c2a-7b00-7000-8000-000000000101`, 최초 served Revision 56. 일회성 worker 백필은 generation `df9cf3c2f682d176c6ce22111db511f6b5eafeb96e05541a0496ce804bbf9489`를 발행했다. 163 documents, 1,972,926 bytes, 78 tiles, 83 external geometry references. 같은 Revision의 재실행은 동일 generation SHA와 크기를 냈다. 운영자 백필 환경 설정을 비우고 worker의 `LACHESIS_RENDER_PUBLICATION`을 `deferred`로 배포했다.
- 실제 [Render preview](https://moirai-production-8ed1.up.railway.app/graph/v5/render-preview)에서 Revision 56의 154개 표현을 확인했다. 확대 시 관계선 묶음과 촘촘한 레이블이 보였다. Revision 62에서도 브라우저를 다시 열어 `154 representations · Level 0.00 · 5 cached assets / 502 KiB` 표시와 장면을 육안 확인했다. 이 디버그 preview는 사용자용 GraphShell 교체나 모바일 성능 통과 근거가 아니다.
- authoring policy `v5/1`을 읽고 합성 Event `019f9280-a500-7000-8000-0000000003e8`의 제목만 두 차례 연속 수정했다. 원본 `[A5 실험 01] 항구의 교역 — 모임 1`은 두 묶음의 마지막 변경으로 각각 복원했다. 다른 이벤트나 실제 역사 기록은 변경하지 않았다.

| 묶음 | 정본 Revision | Render 발행 | 관찰 |
| --- | --- | --- | --- |
| 첫 3회, 수정 전 scheduler | 57→58→59 | 58 `32b46…`, 59 `b5ae…` | 정본 57·58·59 발행에 각각 수십 초가 걸려, 59가 아직 정본 served/target에 알려지기 전에 중간 58을 렌더링했다. |
| 두 번째 3회, target guard 배포 후 | 60→61→62 | 62 `c38c1b796a13e117e1e4db1af2806e616dfba3e8feea0dad18a5009c3fd16aa9` 한 번 | 60·61의 정본은 발행됐지만 Render 생성은 보류됐다. 62의 `render_coalesced` 로그는 `coalesced_revisions:3`, `bytes:1972926`이었다. |

PR #291은 이미 더 높은 Revision이 서비스 중인 오래된 정본 outbox를 배수해 pointer 역행을 막는다. PR #292는 알려진 `publication_target_revision`이 served보다 높은 동안 Render 생성을 기다리게 한다. 두 변경의 PostgreSQL 통합 테스트와 CI 형식·lint·타입·단위·빌드·모바일·secret scan은 통과했다. 기존 dependency audit는 high 4건으로 실패한다. 두 번째 배포 이후 worker/API/web 서비스가 SUCCESS였고, 운영 World `current=target=served=62`, 원래 합성 Event 제목 복원을 확인했다.

## 경계와 후속

이번 실험은 빠른 작성 burst 3회를 정본 worker가 순차 발행할 때 최종 Render generation 하나로 합치는 것을 입증한다. 무한 연속 쓰기, worker 재시작/lease 경쟁, 빌드 중 새 revision 도착, CPU·메모리 포화, 타일 단위 재사용과 실제 GraphShell UX는 검증하지 않았다. 특히 `render-compiler/2`는 매번 점유 World bounds를 기준으로 전체 그리드를 다시 잡고 전체 레이아웃을 컴파일한다. 원점·셀 크기가 고정된 새 그리드 계약과 semantic LOD 분리는 [IP-012 계획](../../implementation/IP-012-render-publication-plan.md)에 적었다. 적용 전에는 외곽 이벤트 하나가 모든 기존 셀의 경계를 이동시킬 수 있다.
