# Dependency audit checkpoint

Date: 2026-10-01. Separate from the ADR-012 rendering implementation.

## Scope and exposure assessment

The unchanged baseline lockfile returned 21 advisory findings: one critical,
10 high and 10 moderate. The user approved sending dependency metadata to the
npm registry for this audit. No source code or credentials were sent.

The critical Next.js advisory applies to the Node `next/og` `ImageResponse` path
when attacker-controlled values enter generated SVG content, attributes or styles.
A source search across `apps/` and `packages/` found no `next/og`, `ImageResponse`,
`opengraph-image` or `twitter-image` usage. This is a limited static exposure check,
not an exploit test or proof that all framework code is unreachable.

Primary advisory: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j

## Narrow update

- Next.js: 16.3.3 to 16.3.6
- Fastify: 5.12.1 to 5.12.5, within the existing major release line
- Affected fast-uri 3.x: 3.1.7
- Affected fast-uri 4.x: 4.1.4
- Affected brace-expansion 5.x: 5.0.11

The three transitive overrides target only their vulnerable release ranges.
No feature dependency, new provider or infrastructure was introduced.

Additional advisories include:

- https://github.com/advisories/GHSA-hwr6-493r-vm6h
- https://github.com/advisories/GHSA-qw65-cvwx-89v3
- https://github.com/advisories/GHSA-58mr-gqgx-xq4g

## Verification

`pnpm audit --audit-level high` now exits successfully: zero critical/high findings,
with nine moderate findings still reported. This is an advisory-database result,
not independent security-fix verification.

The updated dependency tree passes 527 unit tests (two explicitly skipped), lint
and the Atropos strict typecheck. True v4 Publication browser verification in
mobile WebKit covers authored Composite rendering, actual Event narrative loading,
and drawer close under both default HUD and legacy modes, with no page errors.
All workspace production builds also pass, including the Next.js application.

The first rendering checkpoint exposed a separate asynchronous empty-scene update
loop and React StrictMode client-lifetime bug. They are corrected in a separate
source commit; the dependency update is not presented as their fix.
