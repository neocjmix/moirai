# M4.6-D — revision-pinned spatial read

The browser seam calls bounded `POST /graph/spatial`; the server reads the selected
immutable Publication manifest, presentation manifest, scope metadata and original
4096-y-band object documents. It never resolves `current` mid-request. Exact raw
manifest bytes and every declared object digest are verified before geometry is used.

Pinned URDR retention and Canon offset helpers are copied with source provenance.
The original selected/neighbor and parent/child **region** closure is preserved;
it does not imply loading every offscreen sibling point. Relation presentation IDs
are used in the byEventId retention map so a segment cannot overwrite its source
Event. Coordinates and layout output do not change.

Limits are eight Worlds, 32 Canons, 256 object reads, 2,500 cells and a serialized
1 MiB response. Partial/missing objects and budget omissions are observable.
Failed immutable reads are removed from cache and retried. Index and lossless full
sidecar are server-only; ordinary viewport reads do not read them.

Nine tests cover band movement/cache reuse, whitespace-sensitive manifest binding,
selection/neighbor/nested-region retention, missing-object retry, source-revision
isolation, poisoned digest rejection, dense selected-first budget, 100k band loading,
request validation/chunked body limits, and browser revision verification. The 100k
fixture uses prebuilt geometry: this verifies spatial loading, not quadratic force
layout production performance. Browser-scale acceptance remains M4.6-F.

The new loader is available for the M4.6-E runtime switch. `/graph` still uses the
baseline fixture until query, inspector and fallback are switched together in E.
No original renderer, gesture or force-layout algorithm is changed in this slice.

Validation and deployment IDs are recorded after CI and production verification.
