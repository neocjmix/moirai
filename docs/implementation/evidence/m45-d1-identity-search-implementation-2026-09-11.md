# M4.5-D1 Identity-aware Entities/Search implementation evidence

Date: 2026-09-11 UTC

## Scope

This slice implements the approved D1 query interaction against a bounded synthetic catalog. Real
Publication composition remains explicitly assigned to M4.5-E.

## Decisions and rationale

- One client `GraphQueryProvider` owns the versioned query, selection and focus. The server parses the
  same `mq` value before rendering, so hydration and no-JavaScript output use the same normalized state.
- Search candidates are keyed by World-level identity. Canon selection intersects memberships into
  `matchedCanonIds`; it never creates a second candidate for the same Event.
- Event and Narrative results are labelled `persisted`; Subject and State are labelled `derived`.
  Composite/Process remains an Event kind rather than a new canonical entity.
- Virtual Time Events are excluded from persisted search candidates even when temporal query handling is
  enabled.
- A source or temporal-frame change clears selection/focus. Preserving a reference after its World,
  Revision or Canon context disappears would create an invalid public URL.
- Public URL parsing validates Revision, selected Canon membership, entity filters, scope and focus and
  fails closed for malformed references.
- Existing result contract metadata is aligned from the stale `v2` schema ID to the already implemented
  and deployed result contract `v3`; TS-006 is aligned to Publication format `3.0.0` and v1/v2 boundary
  adapters.

## Verification before PR

- focused D1 and graph-contract unit tests: 17 passed
- complete unit suite: 26 files; 134 passed before the stale schema expectation was corrected, with the
  sole failure being the old `v2` expected ID
- TypeScript: root and Atropos strict checks passed
- ESLint: changed TypeScript/TSX files passed
- Next.js production build: passed; all routes generated
- server-rendered `/graph` and `/health`: HTTP success; no-JavaScript result text contains shared A/B,
  persisted/derived state and matched/all Canon labels
- mobile WebKit scenario added for combined deduplication, Canon membership matching and focus URL reload

The local container could download the pinned WebKit browser but could not install its system libraries
because apt privilege transitions are blocked. GitHub CI remains the authoritative mobile WebKit gate.

## GitHub and production checkpoint

- PR: #38
- PR CI: `34613884767` success, including mobile WebKit and PostgreSQL integration
- main merge SHA: `5157962a821eba7b021db494f59c14bce5d6104e`
- Railway deployments: Atropos `fb53ba75-6c18-4113-8703-1d97b342182c`, Clotho
  `c8927c6c-f639-445b-9c97-c24c3c4402a3`, worker `ce4702ca-657e-4972-a19f-cc6a07cc608b`; all success
- Clotho production read after deployment: Graph Scope Observatory remained current/target/served
  Revision 4 and `ready`; shared Relation returned once with K1/K2 memberships alongside K1 `causes`
  and K2 `prevents`
