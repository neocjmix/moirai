---
id: IP-006
title: Clotho MCP ChangePlan schema repair before M5
status: active
layer: implementation-plan
---

# IP-006 — Clotho MCP ChangePlan schema repair before M5

> IP-011 이후 실행 순서와 목표 domain 계약은 [IP-011](IP-011-architecture-realignment.md)을 따른다. 아래 기록의 Canon·Narrative·membership 전제는 당시 구현 이력이며 현재 목표 의미를 재정의하지 않는다. 완료 이력은 취소하지 않으며 미완료 backlog는 IP-011로 재분류한다.

## 1. Purpose and scope

IP-005 is complete and M5 remains inactive. This is a bounded pre-M5 repair for
the release-blocking Clotho authoring defect recorded as CQA-001 and CQA-013 in
`moirai-clotho-qa-v2-2026-09-15.md`.

The internal ChangePlan contract, historical persistence and read path are not
assumed broken. The observed failure is at the protocol exposure boundary:
create-operation schemas combine a complete object with a sibling
`anyOf(required entity_id | required client_ref)`. The ChatGPT-facing MCP schema
renderer preserves the small requirement branches but drops the sibling entity
discriminator and value payload, leaving core operations opaque.

This plan changes only schema construction and its regression evidence. It does
not activate M5, alter canonical meaning, migrate or delete data, commit a real
World change, or change Publication and Atropos behavior.

## 2. Trace and preserved contract

- [BR-001.3](../business-requirements/BR-001-clotho-authoring.md#br-0013-확장과-수정),
  [BR-001.4](../business-requirements/BR-001-clotho-authoring.md#br-0014-의미-단위-작성) and
  [BR-001.9](../business-requirements/BR-001-clotho-authoring.md#br-0019-구조-은닉)
  require usable natural-language authoring without internal schema knowledge.
- [TS-004.2](../technical-specifications/TS-004-clotho-contract.md)
  requires adapters to expose the shared versioned tool contract; skill text
  must not substitute for the API schema.
- [TS-004.8](../technical-specifications/TS-004-clotho-contract.md)
  and [TS-004.9](../technical-specifications/TS-004-clotho-contract.md)
  define ChangePlan, client references and server-side revalidation.
- Contract versions 2, 3 and 4 remain accepted. A create operation may use an
  `entity_id`, a `client_ref`, or both as existing fixtures already do. Missing
  both remains invalid.
- Lachesis remains authoritative for canonical validation. No raw or
  validation-bypass write path is added.

## 3. Observable outcome

An ordinary MCP `tools/list` client can discover complete World, Canon, Event,
Relation, Narrative, Time System and Canon-Time-System create payloads for every
accepted ChangePlan version. Each exposed create variant includes its `kind`,
`entity_type`, target mode, `origin_refs`, typed `value`, required fields and
closed-object boundary. Membership and withdrawal variants remain unchanged.

## 4. Implementation sequence

1. Reproduce the externally listed MCP schema shape and record semantic
   assertions against `change_commit`.
2. Replace the sibling-composition target requirement with complete object
   alternatives at the operation union level.
3. Preserve ID-only, client-ref-only and dual ID/client-ref validation behavior.
4. Run format, lint, strict typecheck, unit/contract tests, boundary checks and
   production builds relevant to contracts and Clotho.
5. Self-review the diff, scan for secrets, commit and push a focused PR.
6. After merge and deployment, inspect the live MCP tool contract from a fresh
   client and run a no-commit minimal `change_validate` smoke covering core
   authoring families. Real historical enrichment remains a later QA step.

## 5. Exit conditions

- The actual MCP SDK `tools/list` response is tested, not only an internal TypeScript type.
- All seven create entity families expose full payload schemas for v2, v3 and v4.
- No create variant collapses to a top-level `anyOf` containing only target requirements.
- Existing target-mode behavior and server-authoritative rejection remain intact.
- Relevant local and CI gates pass; the deployed contract is rechecked from a fresh client.
- `CURRENT.md` records completion evidence while M5 remains inactive.

## 6. Deferred QA

CQA-002 through CQA-020 are not silently declared fixed. After this repair,
their order remains: minimal typed validation smoke; malformed/stale/client-ref
tests; Danjong progressive enrichment; Publication and Atropos read-after-write;
then bounded-context and scale QA. Any newly found semantic or rendering failure
must be planned separately rather than folded into this protocol repair.
