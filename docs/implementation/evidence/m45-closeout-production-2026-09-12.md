# M4.5 production closeout

Date: 2026-09-12

## Decision baseline

- `main` was intentionally force-rolled back to
  `0f5554926587bbd01193b57496d82e9c5f2743e3` (`M4.5-E: connect Publication results to explorer (#44)`).
- The discarded concurrent and recovery history in PRs #45–#48 was not restored or cherry-picked.
- No stash was applied or dropped. No database row, Publication artifact, World or Revision was changed.

## Legacy temporal Relation compatibility

- PR: [#49](https://github.com/neocjmix/moirai/pull/49)
- merge and production SHA: `e81f4eafd91046346e239d8883a18ff6ad53c3c3`
- PR CI: [34632604083](https://github.com/neocjmix/moirai/actions/runs/34632604083)
- main CI: [34632865707](https://github.com/neocjmix/moirai/actions/runs/34632865707)
- post-deploy smoke: [34633086111](https://github.com/neocjmix/moirai/actions/runs/34633086111)
- Railway deployments: Atropos `a2044313-e712-4939-982f-600e1ee96a87`, Clotho
  `343f09f3-86a4-4dd4-9f3e-73fc82e338d2`, worker
  `791e544d-e683-4a02-b918-f29e93f2ef53`; all `SUCCESS` at the exact SHA.

The patch accepts `PublicRelation | LegacyPublicRelation` only at
`readRelationalTime`, applies the existing `normalizePublicRelation` read boundary and adds an
immutable v1 legacy `canon_id` regression. It does not rewrite or republish the source artifact.

## M4.5-H native graph surface

- ownership record: [M4.5-H component ownership](m45-h-component-ownership-2026-09-12.md)
- PR: [#50](https://github.com/neocjmix/moirai/pull/50)
- merge and production SHA: `8d1fa038dee1d595607edfd0cfc2d52b6b0ac8d3`
- final PR CI: [34637230394](https://github.com/neocjmix/moirai/actions/runs/34637230394) —
  format, lint, architecture, strict typecheck, 154 unit tests, PostgreSQL integration,
  production build, audit, secret scan and 9 mobile Safari E2E passed.
- main CI: [34637461448](https://github.com/neocjmix/moirai/actions/runs/34637461448)
- post-deploy smoke: [34637694551](https://github.com/neocjmix/moirai/actions/runs/34637694551)
- Railway deployments: Atropos `e78cc4c8-4fe5-4506-b9dc-a4cc3841c3bf`, Clotho
  `c2a5abd6-c452-4b4f-8626-506427ec3509`, worker
  `f7bdee2c-1ca5-4c26-af54-3802831b43d4`; all `SUCCESS` at the exact SHA.

The production shell has one `GraphSourceIsland` render owner, one native graph stage, one bottom
dock and no legacy graph stage. The native renderer directly consumes `MoiraiGraphQueryResult v3`.
Automated fixtures hold shared World Event and Relation identity to one `(world_id, id)` instance,
preserve full and matched Canon membership, show all five temporal placement kinds plus virtual Time
Events, and cap a 100,000-Event fixture at 2,500 visible nodes. Selection, mobile sheet, semantic
neighborhood zoom and the versioned focus URL survive reload.

## Production acceptance

- `/__status` and `/status-public` reported commit
  `8d1fa038dee1d595607edfd0cfc2d52b6b0ac8d3`, contract `4`, schema `1.0.0`, Publication format
  `3.0.0` and all surfaces `ok`.
- Three consecutive default `GET /graph` checks returned `200` in 12.86–13.24 seconds.
- The official post-deploy query smoke returned R1 World Revision 4 with Event A and B once each and
  shared `influences` Relation once with matched K1/K2 membership. The authenticated Clotho smoke
  also passed.
- Production browser QA observed one query/source island, one native stage, no legacy stage, one
  bottom dock, the multi-World/Canon Revision legend, selection inspector, neighborhood scope and
  inspector restoration after reload. CI covered the same flow at an iPhone 14 viewport.
- One transient `graph_publication_source_timeout` occurred during a focused browser reload; the
  retry succeeded and the subsequent three default `/graph` requests were all `200`. It was not the
  legacy `canon_memberships.filter` failure and no canonical or Publication data changed.

The existing IP-003 R1 production fixture remains at World
`01995c2a-7b00-7000-8000-000000000101`, Revision 4. Existing Event/Relation orphan,
cross-World membership and duplicate-membership evidence remains zero.

M4.5 is closed. M5 remains inactive and was not started.
