# Raw WebGL Gaussian follow-up (IP-015)

IP-015 keeps geometry feather for this checkpoint. Camera separation and bounded working-set preparation take priority. Three.js is removed; preserve only its technique, not its runtime.

Immutable reference: `1d804beb5d19833a1e252e69922545b329d35546`, `apps/atropos-web/src/components/geographic-renderer/three-backend.ts:100–130, 550–587` (repository history).

Port pigment accumulation → horizontal Gaussian → vertical Gaussian with pigment resolve → composite. Use bounded RGBA16F linear-filtered targets, at most 300,000 pixels, with CSS-space 0.75px steps adjusted to the target resolution. The five-fetch normalized kernel uses center 0.227027027; paired offsets ±1.384615385 with weight 0.316216216, ±3.230769231 with weight 0.070270270. Blur density before resolving, not resolved RGB. Keep raw WebGL's six-band spectral pigment model and account for both accumulation attachments. Handle unsupported half-float filtering/blending through the existing fallback.

Validate mixed colors, independent X/Y camera scale, clipped boundaries, point-only restoration, context loss and iPhone Safari/PWA appearance before removing Clipper inset generation, serialized feather paths, triangulation, feather buffers and extra pigment draws. Cloud llvmpipe is functional evidence only.
