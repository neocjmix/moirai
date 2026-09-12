# M4.6-E — real Publication in the preserved viewport

`/graph` uses the D revision-pinned spatial reader. Original renderer, solver,
geometry, band rules, pan/wheel/pinch and detail-sheet presentation remain intact.
The host passes an initial center from spatial metadata and bridges presentation
selection to stable Moirai focus. The same GraphShell instance survives focus
updates. Local/URL viewport restoration still takes precedence for matching scopes.

The catalog includes Worlds without a registered Time System using an explicitly
non-persisted relative-order display selector. URL revision vectors select immutable
query inputs before normalization, so a newly published revision cannot silently
replace a selected older revision. Spatial filtering uses the shared query composer
on server-only full inputs, without restricting distant viewport reads to the first
initial query-budget page. Missing revisions retain their requested selector and
source diagnostics without substituting another revision.

Search, source filters, viewport and text fallback share the same query and source
vector. The viewport is a geometric window into that semantic query; unsupported
geometry stays available through search, Relations and detail. Text results expose
query-budget truncation, while spatial responses expose viewport-budget truncation.
The fallback now includes Relations and the revision vector.

Original sheet notes carry stable identity, full Canon membership, lossless temporal
projection/evidence, attributes, relevant Relations, Composite, Narrative and Subject
context. Stable Event links pin the served revision and carry the query back to
`/graph`. The MOCK fixture and all baseline assertions remain at `/graph/demo`, which
returns 404 unless a local Publication fixture directory is explicitly configured.

## Existing behavior retained or deferred

- URDR temporal cluster bounds defect: backlog #57; original output plus diagnostic.
- A Composite with unplaced children can be non-drawable under the original region
  fallback. Do not invent child dates or claim missing geometry is missing knowledge.
- The existing shared query composer does not apply all direction/Subject filter
  combinations to Event/Relation rows. Broader semantic-filter correction remains
  backlog; this slice uses that same composer across its surfaces, not a competing
  viewport-only interpretation.
- The 100k spatial fixture is not a claim of 100k quadratic force-layout performance.

## Validation

Unit fixtures pin revision 4 while current is 5, verify relative-order selectors do
not become Time Systems, ensure spatial exploration is not capped to initial query
rows, and keep unplaced identity/membership/lossless attributes in the original
sheet payload. WebKit adds real-geometry selection, bounded response and stable
page/graph round-trip evidence while preserving the original mock baseline tests.
Final CI and deployed evidence will be recorded after the runtime gate passes.
