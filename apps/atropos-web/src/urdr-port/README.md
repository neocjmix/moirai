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
4. The API/static-projection reader is replaced by the explicitly marked MOCK
   loader in `src/graph-read-loader.ts`.

No Moirai domain compatibility is attempted in this port.

## M4.6 characterization

`src/spatial-read.ts` and `src/spatial-composition.ts` extract pure functions from
the pinned original loader and `shared/domain/src/static-viewport-bake.ts`.
They are not production-wired in M4.6-A. Spatial and gesture tests fix existing
behavior; `docs/implementation/evidence/m46-a-provenance.md` records the full
producer/reader/renderer boundary and known input preconditions.
