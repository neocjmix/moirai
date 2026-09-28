# 현재 구현 상태

2026-09-28 23:25 KST 사용자 지시 기준. **현재 범위는 최적화 착수 전 상태 정합화·기준점 고정만이다.** A5 신규 기능, 최적화 구현·설계는 중지한다. 과거 실행 승인이나 S0–S7 순서를 근거로 자동 재개하지 않는다. 새 지시 전 데이터·인프라 변경도 수행하지 않는다.

## 기준점

- 원격 main 및 확인한 운영 Atropos SHA: `bf8701e043d3dfa67a04cb25bd70e088e4396349` (#256). 배포 시각: 2026-09-28T12:39:21.511Z.
- 해당 SHA의 [CI](https://github.com/neocjmix/moirai/actions/runs/36423087955), [공개 모바일](https://github.com/neocjmix/moirai/actions/runs/36423087941), [배포 후 smoke](https://github.com/neocjmix/moirai/actions/runs/36423498717)는 성공. 성능·완전성 전체 통과는 아니다.
- 이번 커밋은 문서만 변경하며 runtime 기준 SHA와 문서 SHA를 구분한다.
- 마지막 확인 콘텐츠: World `01995c2a-7b00-7000-8000-000000000101`, Revision 56, 30 Collection / 679 Event. 역사 6개와 합성 24개 Collection을 포함한다. 이번 정합화에서 canonical 데이터는 재조회·변경하지 않았다.
- [상세 기준점·미해결](../evidence/ip011/a5-stabilization-baseline.md). 이전 CURRENT의 실행 이력은 [보존본](../evidence/ip011/current-before-optimization-freeze.md)으로 이동했다.

## 단계 상태

- A1–A3 완료. Clotho v5 계약 복구(#242)와 인증 smoke 분리(#246)는 main에 통합됐다.
- A4는 잔여 백로그를 남기고 종료. sustained frame p95 50/56/62ms는 목표 33.4ms 미달. [종료·백로그](IP-011-A4-closeout-backlog.md)의 기준과 실패 기록을 보존한다.
- A5 부분 구현 후 중지. S0/S1 checkpoint, Island flag OFF, World/Composite HUD와 fade 독립 상대 ranking은 운영 반영됐다.
- S2 Semantic/Geographic 입력 분리·통합 label 예산·keyboard·모바일 label 보정 반영. 200% text 등 전체 exit는 미완료.
- S3 사용자 선택 8개 제한 제거·내부 batch 재사용·shell continuation 누락 수정 반영. capacity·성능 exit는 미완료. 16개 활성은 달성값이나 제품 상한이 아니다.
- S4–S7 미완료. 지속 pin·자동 relevance 등 후속 기능은 완료되지 않았다.
- A6/M5·대량 역사 입력·canonical migration·새 유료 서비스 비활성.

## 남아 있는 문제

- 30개 선택 시 빈 화면이라는 사용자 보고. 조사에서는 결국 표시됐지만 shell 이어읽기 완료까지 43.8초가 관측됐다. 모든 빈 화면 원인을 확정한 것은 아니다.
- client는 continuation 완료 후 snapshot을 반영한다. 여러 응답 사이 관계선과 일부 Composite 자식/hull support 완전성은 미달이다.
- selection 변경 시 loader/cache 교체, 초기 catalog 128개 제한, UI 지속 frame 미달이 남는다.
- 전송량·서버 I/O·CPU·브라우저 계산/paint의 기여도를 분리 측정하지 않았다. 지배적 병목은 미확정이다.
- Redis/Elasticsearch·타일·LOD·hull 사전 발행·점진 렌더링은 논의만 했으며 채택·설계·구현되지 않았다.

[A5 계획](IP-011-A5-collection-discovery-plan.md)은 제품 방향·단계 이력으로 보존하며 현재 실행 지시가 아니다. 다음 세션은 [인계](IP-011-A5-handoff.md)와 이 문서부터 읽는다.

- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
