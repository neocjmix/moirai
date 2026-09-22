> IP-011 이후 실행 순서와 목표 domain 계약은 [IP-011](IP-011-architecture-realignment.md)을 따른다. 아래 기록의 Canon·Narrative·membership 전제는 당시 구현 이력이며 현재 목표 의미를 재정의하지 않는다. 완료 이력은 취소하지 않으며 미완료 backlog는 IP-011로 재분류한다.

# IP-010 — 일본사 chronology 복구

사용자의 명시적 E2E 교정 지시로 활성화한다. TS-010 시간 관계, TS-005/006 graph coordinate, CON-003/BR-004 관계 의미를 보존한다. M5 전체 편집 기능이나 달력 변환기를 새로 구현하지 않는다.

관측 가능한 결과: 일본사 Canon은 1573 → 1575 → 1582 → 1588 → 1598 → 1600 순서를 실제 Gregorian bounds로 배치한다. 관계 topology는 달력 좌표를 대신하지 않는다. 기존 임진왜란 Event와 사료·시간 사실은 보존된다.

1. r28 Live export와 control Canon, temporal publication, graph query, semantic layout, URDR 축 표시를 연결해 원인을 입증한다.
2. 16 atomic 날짜·35 Relation·3 Composite를 전수 감사한다. 일본 구력은 한국 변환기에 넣지 않는다. 확인되지 않은 월일은 연도 bucket으로 표현한다.
3. Gregorian/custom temporal frame에서 relative rank fallback을 제거한다. 명시적 structural-order-display frame은 보존한다. 감사 가능한 Event attributes-only update와 authoring 경고를 추가한다.
4. 회귀 fixture와 전체 test/build/CI, PostgreSQL historical replay를 검증하고 GitHub → Railway 세 서비스를 배포한다.
5. 94/30 operation의 두 ChangePlan을 Live validate/commit한다. 새 Event는 생성하지 않는다. Publication 완료 후 동일 revision의 query/spatial/실제 Graph와 control 데이터를 확인한다.

종료 조건: chronology invariant, 기존 identity/사실 보존, CI·배포 SHA·current/target/served 일치, 실제 Graph 확인. 상세 근거는 `docs/evidence/ip010/`에 남긴다.
