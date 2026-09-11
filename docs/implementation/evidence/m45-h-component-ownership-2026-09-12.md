# M4.5-H component ownership

Date: 2026-09-12

## Ownership

| Concern | Single owner | Boundary |
| --- | --- | --- |
| Sources / Query island | `GraphSourceIsland` | Rendered once by `AtroposAppShell`; it edits only `MoiraiGraphUrlState` through `GraphQueryProvider`. |
| Viewport renderer | `MoiraiGraphCanvas` | Consumes `MoiraiGraphQueryResult` v3 directly through context. It does not import URDR contracts or the G adapter. |
| Inspector / detail surface | `MoiraiGraphCanvas` inspector | Selection is a World-level Event or virtual Time Event reference; Canon is displayed only as membership context. |
| Bottom dock | `AtroposAppShell` | Owns top-level screen navigation and preserves the graph query string across screen changes. |
| URL state | `GraphQueryProvider` | Parses, serializes and restores the versioned `mq` query and focus. Viewport gestures are presentation state and never rewrite canonical/query meaning. |
| Query result | Server `/graph` route → `AtroposGraphRoot` → `GraphQueryProvider` | The server composes immutable Publication artifacts at a World-specific Revision vector. The provider supplies the exact v3 result to the island, viewport and inspector. |

## Invariants

- `GraphSourceIsland` has exactly one render site in the production shell.
- Event and Relation keys are `(world_id, id)` and are never multiplied by Canon membership.
- Canon membership is N:M context, never ownership, authority, default scope or a truth branch.
- virtual Time Events remain non-persisted nodes and retain their tagged reference.
- Layout coordinates are presentation-only. Exact/bounded/relative-only/mixed/unplaced modes remain visibly distinct.
- The browser receives at most 2,500 rendered nodes. Omitted endpoints, truncation, incompatibility and unresolved placement remain visible diagnostics.
- The old `MoiraiLegacyViewportAdapter` and URDR graph contracts do not occur in the production graph dependency path.

M5 remains inactive.
