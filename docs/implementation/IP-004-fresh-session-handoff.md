> IP-011 이후 실행 순서와 목표 domain 계약은 [IP-011](IP-011-architecture-realignment.md)을 따른다. 아래 기록의 Canon·Narrative·membership 전제는 당시 구현 이력이며 현재 목표 의미를 재정의하지 않는다. 완료 이력은 취소하지 않으며 미완료 backlog는 IP-011로 재분류한다.

# IP-004 — independent-session acceptance handoff

The independent-session acceptance was executed: live Clotho discovery followed
by an additive refinement reached Revision 6. See the
[separate evidence](../evidence/ip-004-prb3-fresh-session.md) and
[current gate status](CURRENT.md). The original instructions below are retained
for provenance; they are not an instruction to repeat the canonical write.

This is the remaining PR-B session-independence check required by
[IP-004](IP-004-production-readiness-gate.md). It must run in a genuinely new LLM
session. Continuing or compacting the implementation conversation is not evidence
of that property. No canonical writes are needed merely to prepare this handoff.

Start with the repository rules and the World ID below. Do not preload the earlier
change-plan fixtures or copy their Event/Relation/Narrative IDs into a proposal.
Discover the actual existing knowledge through the connected Clotho read tools.
Record the discovery before consulting earlier evidence for comparison.

Repository: `https://github.com/neocjmix/moirai`

World ID: `01995c2a-7b00-7000-8000-000000000101`

Natural-language task:

> 이 World에 있는 훈민정음 관련 지식을 찾아라. 문자 창제와 해설서 완성,
> 각 Canon의 해석과 기존 사건 identity를 먼저 이해하라. 공개 사료로 확인한
> 유용한 세부 정보 한 가지를 추가하되, 기존 지식에 이미 있으면 중복 생성하지
> 말고 적절한 refinement를 선택하라. 실제 Clotho로 검증·commit하고 Publication이
> 따라온 뒤 Atropos Island, Graph Event drawer, Event reading page에서 확인하라.

Execution requirements:

- Read AGENTS.md and the active plan/document chain. IP-004 remains active and
  M5 remains inactive. Preserve accepted canonical semantics and Graph behavior.
- Use the actual Clotho interface for bounded discovery, planning, validation and
  commit. Use only public or synthetic source material. Do not write directly to
  PostgreSQL or manufacture tool transcripts.
- Explain why the proposal reuses/refines existing identities or why any new
  entity represents a genuinely distinct abstraction. Preserve Event/Canon N:M
  membership and the appropriate Relation/Narrative attachment scope.
- Handle a revision conflict by rediscovering current context and replanning.
  Verify canonical identity/membership/meaning and reader navigation, not only
  HTTP status or row existence. Record actual revisions and deployed SHA.
- Keep this new-session evidence separate from the implementation conversation's
  prior multi-step authoring evidence and synthetic replay tests.
- Recheck Product/Scale evidence and current deployment before closing the whole
  gate. Only after all three axes have evidence may CURRENT mark IP-004 complete.
  Even then leave M5 inactive and request the user's separate M5 entry decision.

The user already authorized routine implementation, verification, PR, merge and
deployment work within IP-004. The need for a new session is an acceptance
condition, not a request to repeat that authorization.
