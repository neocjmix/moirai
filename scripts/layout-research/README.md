# Collection layout research v2

This standalone Pages experiment is isolated from production. It imports the real pure layout engine, Lab snapshot validation, Lab hull geometry, and Lab pointer/camera math. It does not register an algorithm, publish a World, or change served pointers. No new UI framework or dependency is introduced.

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm exec vitest run scripts/layout-research/engine.test.ts
pnpm exec tsx scripts/layout-research/measure.ts
pnpm exec tsx scripts/layout-research/build.ts
python -m http.server 8765 --directory .artifacts/layout-pages
```

In another terminal (agent verification, not a user prerequisite):

```sh
pnpm exec tsx scripts/layout-research/smoke.ts http://127.0.0.1:8765/
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec eslint scripts/layout-research/*.ts
```

The smoke runner needs an installed Playwright Chromium. The same runner accepts the public Pages URL. Outputs and screenshots go to `.artifacts/layout-smoke` unless a third argument supplies another directory.

`data/history-r56.json` is the previously inspected immutable anonymous-public Lab snapshot: 539 Events, 7 Collections, 651 event-to-event relations. Its payload digest is checked during build and browser loading; World authoring is never used. Its source revision is deliberately not silently refreshed.

`fixtures.ts` uses the existing canonical temporal projection and layout-input adapter. Synthetic facts carry no historical claim. Three named modes and seed 13013 are reproducible; the runner also measures seeds 23013 and 33013. `scale-fixture.ts` constructs prepared scale inputs with 20 contexts and 10% Composite: it is a computation stress fixture, not a replacement for the canonical-to-temporal pipeline or perceptual evaluation.

`measurements.json` contains raw repetitions, assumptions, fixed-window diagnostics, seed sensitivity, incremental displacement and a membership-only counterfactual. Metric calculations are intentionally confined to small perceptual fixtures; they contain quadratic reference computations and must not be put on the interactive production path.

Publish only the built directory to the isolated `gh-pages` branch. Preserve the previous page under `legacy/`. Do not merge `gh-pages` into `main`. Rollback is a normal revert of the Pages deployment commit; production code and canonical history are untouched.

See [the Korean review](../../docs/evidence/ip013/collection-layout-experiment-v2.md) for architectural evidence, the objective, alternatives, calibration, numerical results and remaining risks.
