# A3 Atropos UI restoration

## User correction and baseline

2026-09-25: the user rejected A3's replacement interface and directed a complete UI rollback followed by surgical data adaptation. A4 is paused.

Baseline: pre-A3 `b2dbc64e07f0085ce330caf2ec3c6d6f7e93702d`. The existing URDR port remains the UI source, with its original provenance already recorded in the repository. `src/urdr-port/src/App.tsx`, `app.css`, `app-shell.module.css`, and `components/graph-shell.module.css` are unchanged. GraphShell has only four added lines passing/rendering optional reading links inside its existing drawer. Its geometry rendering, navigation, pan/pinch, drawer stages, and styling are retained.

The separate V5Explorer component, stylesheet and obsolete component test are removed. `/graph`, `/graph/v5`, reloadable screens, and current v5 canonical Event URLs compose the original App and GraphShell.

## Adapter boundaries

| v5 fact | Existing presentation seam |
| --- | --- |
| World layout | One renderer plane; private `canonId` is a World token only |
| Collection membership | Source controls; selected union; all OFF is empty |
| Shared World Event | One Event ID and unchanged coordinates |
| Single Event Narrative | One World-labelled drawer section, notes and references |
| Collection Narrative | Collection-labelled drawer, paged member links |
| World contains/adjacency | Paged child/neighbor links; no Collection-owned relations |
| Visible Event-to-Event relation | Existing line renderer and relation type filter |
| Public Time System | Published definition identity; Gregorian axis only for Gregorian codec |

Requests read the authenticated complete v5 pointer and immutable digest-indexed documents. The adapter does not change canonical records or publish a new revision. Viewport candidates remain spatially selected; no complete World is embedded in HTML. Request bodies are capped at 16 KiB, responses at 1 MiB, viewport traversal at 16 pages. Line enrichment examines at most 64 visible points and 256 relation documents and reports truncation. Event/Collection links retain publication paging. A4 latency/scale qualification remains separate and unclaimed.

## Verification

- Local strict web typecheck and production build passed.
- Adapter regression tests: one shared node, stable coordinates, all OFF, Collection/Event Narrative separation, unplaced detail, Composite child links, valid canonical drawer URL.
- CI `36114138195` on `34d584d`: format, lint, boundaries, typecheck, unit tests, PostgreSQL integration, build, dependency audit, secret scan and mobile WebKit passed.
- Mobile assertions reuse `graph-stage`, `moirai-source-island`, the original Event point targets and `event-drawer-sheet`. They exercise pan, selection, full drawer, Collection members, unplaced Event and Composite child navigation. Screenshots are in `graph-regression-evidence` artifact `10854520615`.
- The first runs caught and corrected a private renderer revision type mismatch and an invalid stable Event URL. Existing mobile regressions continued to pass.
- Final PR head `95359171ce40b4b84c251d81fcda70e57a0ec6c1`: CI `36114960810` passed all three jobs, including the final line adapter and superseded-UI removal. The adapter suite has three passing tests.
- PR #196 merged as `9ff100d37562b6177f2694232570aa02485a81e6`. Railway web deployment `f8bc544c-b2ad-419f-a854-51d04171cf89`, API `29ac6e23-cee9-46f4-914c-db2c764f94b5`, and worker `c20c40a3-7962-4bf6-a59d-77a25b5ff33a` succeeded on that SHA.
- Public `/__status` confirmed SHA `9ff100d`, contract 5 and v5 publication format. Post-deploy smoke `36115276269` / job `108007796100` passed public readiness, live mobile Collection/unplaced/Composite navigation and authenticated authoring-to-Atropos checks.
- Browser observation at `/graph`: original floating source island, Gregorian graph, original bottom navigation and the 황산대첩 point / 건국 과정 region. Selecting 황산대첩 opened the original drawer with its World Narrative, chronology, public references and related Event link. The old three-column explorer is absent.
- UI recovery is complete on the operational World at Revision 32. A4 remains paused; no scale/latency gate is claimed.
