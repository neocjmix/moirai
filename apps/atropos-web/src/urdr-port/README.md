# URDR graph UI port

- Source repository: `neocjmix/urdr`
- Source commit: `0267c8fd081ca9a3cd556f8f7319c600248c3760`
- Source UI root: `urdr/apps/web/src`
- Target route: `/graph`

The UI component, CSS module, shell, geometry, label, viewport, and share-state
sources are copied from that commit. Deliberate host adaptations are limited to:

1. Next.js client/SSR guards and route wrappers.
2. `@urdr/contracts` and `@urdr/domain` local import bridges.
3. `@ts-nocheck` headers on copied files because Moirai enables stricter
   TypeScript options than the source repository.
4. The API/static-projection reader uses revision-pinned Moirai artifacts through
   `src/moirai-graph-read-loader.ts`. The original MOCK loader is isolated behind
   the local-fixture-only `/graph/demo` route.

Moirai identity, membership, temporal evidence and attributes stay outside the
renderer in Publication query results and the lossless detail payload. The shell
accepts initial data focus and stable selection callbacks; its gesture and shape
algorithms are unchanged. The Next.js host retains the same GraphShell component
instance when query focus changes.

## M4.6 characterization

`src/spatial-read.ts` and `src/spatial-composition.ts` extract pure functions from
the pinned original loader and `shared/domain/src/static-viewport-bake.ts`.
They are not production-wired in M4.6-A. Spatial and gesture tests fix existing
behavior; `docs/implementation/evidence/m46-a-provenance.md` records the full
producer/reader/renderer boundary and known input preconditions.
