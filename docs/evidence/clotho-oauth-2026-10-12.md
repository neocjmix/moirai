# Clotho OAuth persistence and CI recovery — 2026-10-12

The user explicitly requested investigation and repair of repeated ChatGPT/Clotho authentication and the currently failing CI. This activates authentication/CI recovery, without reopening the deferred mobile performance work or authorizing canonical history edits. Contracts: CON-002/004, BR-001.8, TS-004/008 and the existing M3 connection and credential provisioning boundaries.

## Observed failures

Baseline main and public deployment: `cb03fbdd5ca43bd95766debc1b1fc8aea662884b`.

| Surface | Evidence | Interpretation |
| --- | --- | --- |
| ChatGPT Moirai Live | Actual `world.list` returned `UNAUTHORIZED` / connection requires reauthentication. | The connection is unusable; this alone does not identify refresh issuance, expiry, rotation or client storage as the cause. |
| Clotho discovery | Production protected-resource metadata already advertises `world:read`, `world:write`, `offline_access`; provider discovery supports refresh tokens and dynamic client registration. | Repeating the old protected-resource scope fix is insufficient. Discovery does not prove the particular client obtained a refresh token. |
| v5 tool registration | All v5 tool descriptors omitted `securitySchemes` and `_meta.securitySchemes`; scope errors omitted the tool OAuth challenge. Legacy transport had these fields. | Confirmed implementation regression at the v5 migration. The tool-level linking path could omit the persistent scope or fail to offer scope recovery. |
| v5 World admission | `/mcp` rejected a valid principal unless its grant list included the fixed synthetic World, before application authorization. | An authenticated client with a different permitted World could receive an incorrect HTTP 401 and OAuth challenge. |
| Main CI | [38063623509](https://github.com/neocjmix/moirai/actions/runs/38063623509) failed only dependency audit: Next.js 16.3.6, high SSRF advisory GHSA-cjq9-62q9-8jv4. | Separate dependency failure; other quality, PostgreSQL, build, mobile and secret checks passed. |
| Post-deploy smoke | [38063957148](https://github.com/neocjmix/moirai/actions/runs/38063957148) passed readiness, public mobile and CLI build, then failed authenticated policy read. Railway HTTP logs show HTTP 401 for that exact request. | CI bearer credential rejection, independent of ChatGPT OAuth. The configured credential contract has a 30-day lifetime; actual expiry/hash must be checked before identifying which one failed. |

PR #114 previously repaired `oauth_refresh_token_missing` by adding the persistent scope to protected-resource discovery and the HTTP challenge. That historical cause is not proof of the present provider/client failure.

## Implementation repair

- Every v5 tool advertises its existing read/write scope and `offline_access` in both OAuth descriptor locations. Lifecycle and both change methods require `world:write`; other methods require `world:read`.
- Supplied invalid/expired tokens retain HTTP 401 and a sanitized `invalid_token` challenge. A valid token lacking a method scope gets a tool-result `insufficient_scope` challenge.
- Every authenticated principal reaches the existing application/Lachesis authorization checks. Out-of-grant World access remains forbidden and receives no OAuth relinking challenge.
- Authenticated smoke identifies CI bearer 401 separately from World/scope 403 and never emits provider response bodies or credentials. Deployed smoke also checks the tool OAuth descriptors.
- Next.js and matching lockfile entries advance only to the patched 16.3.8 release.

JWT signature/issuer/resource audience/operator mapping, one-hour maximum access-token lifetime, credential expiry, World grants and final authorization remain enforced.

## Provider and client verification

Auth0 administrator login and ChatGPT reconnection were requested after the actual connection failure. Before attributing the remaining reconnect problem to Auth0 or ChatGPT registration, inspect the actual client used by this connection:

1. API offline access enabled, RS256 and access-token lifetime at most 3600 seconds.
2. Client permits authorization code and refresh-token grants, with its actual callback and token-endpoint authentication method. Do not fix a stale secret/callback by adding unrelated clients or broad default audiences.
3. Authorization request includes `offline_access` and the exact `/mcp` resource/audience. Client metadata alone does not establish what the request sent.
4. Authorization-code and refresh logs (`seacft`, `srt`, `frrt`/`ferrt`) and the configured refresh expiration/rotation policy. Use sanitized event type/time/outcome; no subjects, tokens, headers, secrets or full log payloads in public evidence.
5. One successful reconnection, repeated reads and a read after access-token expiration. Immediate repeat reads do not prove refresh works. Distinguish Moirai Live and Moirai Live Refresh Check as separate client registrations/connections.

No provider configuration or live refresh success is claimed until observed. The existing short access-token lifetime must not be extended to conceal refresh failure.

## Provider choice

Keep Auth0 while repairing its integration. Direct GitHub OAuth returns GitHub API tokens/scopes rather than Clotho's signed `/mcp` JWT and `world:*` authorization contract. Google ID tokens target the OAuth client ID and its access tokens authorize Google APIs. Both direct replacements require an authorization broker or a different token-validation design. Auth0 social login may simplify the login screen, but still uses the same Auth0 refresh flow and requires preserving the allowed operator identity.

References: [OpenAI tool authentication](https://developers.openai.com/plugins/build/auth), [Auth0 refresh issuance](https://auth0.com/docs/secure/tokens/refresh-tokens/get-refresh-tokens), [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).

## CI credential recovery

The GitHub integration can write code/actions but returns HTTP 403 for Actions secret access. Railway's connected OAuth tool returns variable names only, including the existing credential configuration. Neither observation means the variables are absent. An additional GitHub administrator device login was requested to rotate the actual secret securely.

Restore the existing CI actor, `world:read`/`world:write` and synthetic World grant only. Generate a fresh random token in memory, put its raw value only into GitHub Actions `CLOTHO_TOKEN`, and put only its SHA-256 hash and a new 30-day expiry into the existing Clotho service configuration. Remove the superseded CI hash while preserving other credentials. Verify both stores, redeploy the API and rerun authenticated smoke. Never copy the token into chat, command arguments, repository files or public artifacts.

## Verification and rollout status

Focused OAuth regression, OIDC, transport parity and legacy MCP checks pass. Clotho lint/typecheck and dependency boundary checks pass. Next 16.3.8 production build and high-threshold audit pass. Full remote CI, credential rotation, deployed descriptor verification and actual ChatGPT refresh are pending at this checkpoint.

Historical A4 failures include stale fixed viewport coordinates after the approved global-incidence layout change. The benchmark repair derives the same bounded viewport from the fixture's published point and retains all budgets/assertions. Historical dense/sustained frame failures remain deferred under IP-012; this task does not relax those gates or resume renderer tuning.

## Plugin-first recovery checkpoint — 2026-10-12 03:24 UTC

PR #347 merged as `f52b8d9f8bfec20fad5e966ed5ce72cf8f3ba032`. [Main CI 38187256932](https://github.com/neocjmix/moirai/actions/runs/38187256932) and [A5 mobile 38187256954](https://github.com/neocjmix/moirai/actions/runs/38187256954) passed. Railway web/API/worker reached SUCCESS at that SHA, public readiness smoke passed and all 17 deployed tools expose both OAuth descriptor locations. [Authenticated smoke 38187579503](https://github.com/neocjmix/moirai/actions/runs/38187579503) passed public readiness/mobile/build, then explicitly reported the existing CI bearer HTTP 401.

The user requested using the installed GitHub, Railway and Auth0 plugins before asking for additional logins. GitHub supports code, CI logs and reruns but has no Actions secret-write operation. Its injected credential also returns HTTP 403 from the Secrets API. Railway supports configuration writes, but its connected OAuth operation deliberately returns variable names only. The installed Auth0 guidance is available; no Auth0 Management MCP operation is callable in this session. Its CLI has no authenticated tenant. Those are capability limits, not evidence that configured credentials are missing.

Moirai Live Refresh Check still successfully read World revision 62 at 03:24 UTC, over three hours after the earlier authenticated reads, while Moirai Live still returned connection-level UNAUTHORIZED. A single global Auth0/API failure cannot explain that difference. The failed Live connection was asked to reconnect once after the descriptor repair. Auth0 administrator access is deferred unless the renewed connection still fails; the two client registrations' refresh settings have not been compared.

### CI workload identity repair

Use GitHub Actions' signed five-minute workload JWT for the exact production smoke job, replacing its dependency on the expired/mismatched static secret. This removes the need to read operator secrets or write a new GitHub secret. Auth0 remains the human MCP provider; this is not a GitHub human-login migration or a new authorization server.

The optional `CLOTHO_CI_OIDC_JSON` contains only public trust settings and a separate internal CI actor. Its parser pins the existing repository/owner IDs and the `/mcp` audience. The actual repository OIDC configuration reports `use_default: true`, `use_immutable_subject: true`, prefix `repo:neocjmix@4980032/moirai@1349494474`. Verification pins:

- GitHub Actions' issuer, fixed JWKS and RS256 signature;
- exact string audience, immutable subject, repository and immutable repository/owner IDs;
- `refs/heads/main`, branch ref type, the exact `post-deploy-smoke.yml` workflow ref, and `workflow_run` or `workflow_dispatch`;
- required issue/expiry/not-before claims, token age and lifetime at most 300 seconds.

The resulting actor has only the existing `01995c2a-7b00-7000-8000-000000000101` World and `world:read`/`world:write`. It receives no all-World/admin grant, and token-supplied grants do not expand access. Auth0/operator credential settings are preserved. v5 REST and MCP use the verified CI principal; Lachesis still checks scope, World and expiry.

Minting occurs after deployment readiness, which can take ten minutes, so the five-minute token is fresh for the authenticated smoke. Token acquisition uses only the HTTPS GitHub runner endpoint, blocks redirects, applies a timeout and emits sanitized errors. JWTs remain in memory and, when needed, the CLI child environment; no token is written to logs, files, public artifacts or persistent secret stores. The existing workflow's exact-main/upstream repository/SHA checks remain intact.

GitHub's `id-token: write` permission is scoped to this job, not the whole workflow. Earlier trusted steps can technically mint too; the final smoke script is the only minting code. This remains the existing trusted-main-job boundary: its build code could already modify the final script before that script receives a static credential. No additional repository, World or write authority is granted.

Provisioning uses Railway's connected write tool to set only `CLOTHO_CI_OIDC_JSON`; no administrator login or operator-secret read is needed. Setting it to an empty string disables the CI trust path. A runtime rollback to v4 requires the corresponding old bearer smoke workflow; v4 REST has not gained a new authentication path.

Focused CI identity/config/OIDC/transport tests and mint/request diagnostics pass; independent review found no blocking issue. Remote CI, live signed GitHub token acceptance and authenticated smoke remain pending until this checkpoint is deployed. Existing static credentials for other manually invoked workflows are not silently renewed or replaced.
