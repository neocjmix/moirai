---
id: TS-002
title: 정본 데이터 모델
status: accepted
layer: technical-specifications
---

# TS-002 — 정본 데이터 모델

## TS-002.1 효력

[CON-003](../constitution/CON-003-world-truth.md)와 [CORE-MODEL](../business-requirements/entities/CORE-MODEL.md)을 구현하는 목표 계약이다. 2026-09-22 배포는 아직 v4 Canon 모델이다. 목표를 이미 구현됐다고 간주하지 않는다. 이행 순서·실제 차이는 [IP-011](../implementation/IP-011-architecture-realignment.md)과 [조사](../evidence/ip011/reconstruction.md)에 둔다.

## TS-002.2 식별과 생명주기

지속 레코드는 immutable opaque UUIDv7, created/updated/withdrawn Revision을 유지한다. World가 transaction·Revision·인가·export 경계다. active/withdrawn만 사용하고 unpublished draft를 추가하지 않는다. 철회는 물리 삭제가 아니다. slug/title은 identity가 아니며 이름 변경이 ID를 바꾸지 않는다. virtual Time Event는 기존 TS-010의 결정적 reference이며 저장 Event가 아니다.

## TS-002.3 최소 논리 모델

| 항목             | ownership / cardinality                          | 변경                                                 |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------- |
| World            | reality 경계, Event/Relation/Collection 각각 1:N | ID 보존, 역사 World metadata 정정                    |
| Collection       | 정확히 한 World                                  | 기존 canons 행과 ID 재사용; 이름·의미 전환           |
| Event            | 정확히 한 World, Collection 0..N                 | 기존 world_id 유지, kind의 정본 의미 제거            |
| Event membership | same-World Collection/Event unique pair          | 기존 N:M 저장·Revision 이력 재사용                   |
| Relation         | 정확히 한 World, tagged EventReference endpoints | Canon membership을 assertion 적용 조건으로 쓰지 않음 |
| Narrative        | 정확히 한 Event 또는 Collection owner            | owner당 한 active Narrative; Event canon_id 제거     |
| Time System      | 한 World의 정의, compatible definitions 허용     | 기존 adapter와 lossless coordinate 유지              |

Collection에 order·importance·recommended_with·truth rank를 추가하지 않는다. 기존 N:M membership은 새 의미를 이미 표현하므로 별도 generic grouping ontology로 교체하지 않는다.

## TS-002.4 World

현재 worlds의 id/slug/title/description/current_revision/publication_target_revision을 유지한다. 실제 역사 World의 title 목표는 `실제 세계사`, description은 관측 coverage임을 명시한다. 기존 ID와 early-joseon slug는 이번 migration에서 유지할 수 있다. slug가 reality 정의는 아니다. geography/era/theme을 World identity에 포함하지 않는다.

## TS-002.5 Collection

기존 canons의 id/world_id/slug/title/description과 unique(world,slug)를 재사용한다. 외부 v5 계약·UI·MCP·export는 collection 용어로 통일한다. 물리 table rename은 versioned migration으로 묶되 두 저장소·dual-write·장기 alias를 만들지 않는다. Collection 철회는 membership 정리와 Collection Narrative 철회만 수행하며 Event/Relation을 cascade 철회하지 않는다.

## TS-002.6 Time System

TS-010의 definition version, lossless canonical string, adapter capability, virtual Time Event를 그대로 따른다. 기존 Collection-TimeSystem 연결은 표시 가능한 시간 체계 선택 정보로 재사용하며 사실의 유효성을 제한하지 않는다. 해당 Collection에 연결이 없다는 이유로 Event의 World 시간 제약을 버리지 않는다. capability가 없으면 unresolved다. 제거된 temporal placement table/필드를 되살리지 않는다.

## TS-002.7 Event와 Composite

Event id/world_id/title/summary/roles/attributes의 기존 저장 능력을 유지한다. `kind=atomic|composite`는 목표 canonical write에서 제거한다. Composite 여부는 World Revision의 active `contains` outgoing edge 존재로 파생한다. 부분 viewport에서 자식이 안 보여도 Composite를 atomic으로 오인하지 않도록 projection에 전체 child count/partial을 제공한다. 이 정보는 재생성 가능하다.

contains는 same-World persisted Event 사이의 비순환 관계다. 여러 parent를 허용한다. membership은 contains를 생성하지 않는다. 기간이 있거나 UI container가 필요하다는 이유로 contains를 발명하지 않는다. `process` role은 기존 설명용 역할로 남길 수 있으나 별도 entity/type을 만들지 않는다.

## TS-002.8 Relation

기존 World-owned id/type/source_ref/target_ref/direction/attributes와 vocabulary를 유지한다. 모든 persisted endpoint와 Time System은 같은 World에 속한다. Event membership을 Relation의 무결성 조건으로 요구하지 않는다. 기본 그래프는 selected Event의 induced graph와 bounded neighborhood다. World-level temporal·contains closure는 사전 projection과 인덱스가 제공한다.

기존 relation_canon_membership 477개는 migration provenance로 보존한 뒤 current fact applicability에서 제거한다. 단순 collection_relation_membership으로 rename하여 독립 현실을 유지하지 않는다. 같은 assertion의 여러 ID는 endpoint/type/attributes/출처를 비교한 별도 검토 대상이며 무조건 병합하지 않는다. World 전체 제약을 합쳤을 때 생기는 temporal/contains 충돌은 cutover blocker다. 출처 충돌을 나타내려면 확정 제약을 완화·정정하고 공개 주석/운영 유래를 보존한다. 새 Claim type은 만들지 않는다.

## TS-002.9 Narrative

owner discriminator는 `event|collection`, owner ID와 world_id를 갖는다. owner당 정확히 하나의 active Narrative를 강제한다. 본문, 선택적 summary, 주석과 공개 reference는 같은 Narrative의 구성 내용이다. 최소 변경으로 기존 body/locale/public_references를 재사용하고 annotation은 독립 Narrative가 아닌 같은 owner의 보조 내용으로 이관한다. 별도 annotation ontology나 generic content tree는 만들지 않는다.

현재 1개 locale(ko) 자료를 보존한다. 향후 번역은 동일 Narrative identity의 언어 표현이며 Collection별 variant가 아니다. locale마다 별도 Narrative identity를 만들지 않는다. 현재 cutover에서는 multiple locale가 발견되면 보존 변환을 구체화하기 전 중단한다.

새 Event/Collection 생성과 Narrative 생성은 같은 atomic Change Set으로 수행한다. Event의 summary는 목록용 짧은 설명이며 두 번째 Narrative가 아니다. Narrative만 철회해 active owner가 본문을 잃게 하는 write는 거절한다. 역사적 불확실성은 본문에 남길 수 있다. 특정 자료·날짜 주석은 접어서 읽고, 작성 과정은 intent/origins에 둔다.

## TS-002.10 correspondence

기존 correspondence·member 기록은 export/history 보존 대상이다. 현재 신규 작성·비교 기능은 deferred이며 BCR-008을 따른다. Collection 재사용에 correspondence를 요구하지 않는다.

## TS-002.11 Subject handle

Subject는 World의 identity Relation에서 파생한다. stable handle과 anchor/reconciliation 원칙을 유지하되 Collection별 partition은 제거한다. 기존 handle은 영향 감사 후 mapping/redirect 또는 unresolved로 보존한다. title 일치로 병합하지 않는다. 이번 historical export는 correspondence/handle 목록을 포함하지 않으므로 별도 owner-full audit가 cutover 선행조건이다.

## TS-002.12 운영 유래

source_materials/change_origins/Change Set 이력과 public reference 분리를 유지한다. source_explicit/human_instruction/llm_inference는 추적 근거이며 hidden reasoning은 저장하지 않는다. policy version/digest는 Change Set 운영 이력에 기록하며 Event attributes에 넣지 않는다.

## TS-002.13 불변식

same-World FK, unique membership, immutable identity, owner당 단일 Narrative, endpoint 유효성, contains DAG, TS-010 temporal consistency, 인증·Revision·idempotency를 final candidate state에서 검사한다. membership 0은 유효하다. Event 철회는 관련 endpoint·Narrative·membership을 명시적으로 처리한다. Collection 철회와 Event 철회를 혼동하지 않는다.

## TS-002.14 export와 이행

논리 format을 새 major version으로 전환하고 TS-007의 digest·경로 안전성·owner-full/private 분리·round-trip을 유지한다. 이전 Revision의 원문과 의미는 바꾸지 않는다. legacy reader는 역사 재현·명시적 import 변환에만 한정하며 live write 호환으로 사용하지 않는다. mapping·병합된 서술의 근거·철회 이력을 검증한 뒤 새 Publication을 생성한다.

이전 세부 조항은 기준 commit `05ebf3b27794e60d734a885cc428a30104118896`의 Git 이력에 보존한다. 같은 문서 ID의 이번 개정 본문이 현재 목표 계약이며 삭제된 Canon-specific 조항은 실행 요구가 아니다. 변경하지 않은 보안·transaction·portability 규칙은 TS-001/003/007/008을 참조한다.
