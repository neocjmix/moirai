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

Moirai Live Refresh Check still successfully read World revision 62 at 03:24 UTC, over three hours after the earlier authenticated reads, while Moirai Live still returned connection-level UNAUTHORIZED. This distinguishes the two connections, but their actual registration/authentication modes and refresh settings have not been compared. The successful read alone does not prove the failed Live client obtained or stored a refresh token, or rule out its Auth0 configuration. The failed Live connection was asked to reconnect once after the descriptor repair. Auth0 administrator access is deferred unless the renewed connection still fails.

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

## Deployed verification — 2026-10-12 04:02 UTC

PR #348 merged as `8eea15979fa05ace5514d000af419b7fba02a125`. Railway API, web and worker deployments all reached SUCCESS at that exact SHA; the public API readiness response independently reports it. The earlier static-secret rotation proposal is superseded for post-deploy smoke by the deployed GitHub Actions identity path. No GitHub/Railway administrator login, secret read or static secret rotation was performed.

- [Main CI 38201677816](https://github.com/neocjmix/moirai/actions/runs/38201677816) passed all quality/build/audit, PostgreSQL, mobile/continuity and secret-scan jobs. The preceding PR CI also passed.
- [Post-deploy smoke 38201752174](https://github.com/neocjmix/moirai/actions/runs/38201752174) passed public readiness, live mobile A3 navigation, CLI build and authenticated authoring. The authenticated step was executed, not skipped: the real GitHub runner minted a signed workload JWT, Clotho accepted it, and the existing policy/schema/MCP/validation smoke completed. This proves the new CI authentication flow against the exact deployed build rather than only mocked verifier tests.
- [Automatic post-deploy smoke 38201976709](https://github.com/neocjmix/moirai/actions/runs/38201976709) passed the same stages after main CI completed. Both `workflow_dispatch` and the normal `workflow_run` event authenticate successfully; all four live mobile tests passed.
- The validation smoke retains its rollback/no-canonical-write behavior. Read-only Refresh Check still reports the actual-history World at revision 62 after deployment.
- The remaining Moirai Live call returns connection-level UNAUTHORIZED. A controlled 03:55 UTC comparison with Railway HTTP logs showed the failed Live call stopped before reaching the API, while the following successful Refresh Check requests reached `/mcp`. This locates the currently observable failure at the app connection stage, without identifying which provider/client setting produced that stored state.

The user-facing handoff asks only for one Moirai Live reconnection in ChatGPT after the deployed descriptor repair. The session has no operation for renewing that app's saved OAuth state and no callable Auth0 Management API tool. A fresh Live connection, its repeated reads and an actual access-token-expiry/refresh cycle remain unverified. If it still fails after reconnection, obtain Auth0 tenant access for the client/refresh-log comparison above. Do not attribute the remaining issue to Auth0 or ChatGPT registration before that evidence, and do not replace human Auth0 with direct GitHub/Google OAuth merely on the strength of successful CI workload authentication.

This evidence-only follow-up records the verified runtime SHA above; it adds no runtime or provider configuration change. The deferred A4 frame-budget failures remain separate from the recovered CI and authenticated smoke.

## Provider verification and conversation-state closeout — 2026-10-12 05:18 UTC

The user completed the requested app reconnection. The existing conversation still immediately returned connection-level UNAUTHORIZED, with no matching API request. Auth0 Management tools are not available through the installed plugin, so the user completed the CLI's device login. All subsequent tenant operations were read-only; no provider setting, client, grant, access-token lifetime or refresh rotation was changed.

The actual API has offline access enabled, RS256 and 3600-second access-token lifetimes. The reconnected client permits authorization code and refresh grants with the ChatGPT callback and public-client token authentication. Its refresh tokens rotate, expire after 30 days, have a 15-day idle lifetime and zero reuse leeway. These settings were inspected, not inferred from discovery.

Allowlisted provider evidence:

| UTC time | Event | Verified result |
| --- | --- | --- |
| 00:09:18 and 03:25:30 | `sertft` | Successful refresh exchanges, more than one access-token lifetime apart. |
| 05:03:03 | `seacft` | The user's reconnection exchanged its authorization code successfully. |
| 05:03:08 | `sertft` | Refresh exchange succeeded after reconnection. |

All inspected successful refresh events target the exact Clotho `/mcp` audience and carry `world:read`, `world:write` and `offline_access`. The retained event set contains no exchange/refresh error. Client IDs, subjects, token families, credentials and complete provider log payloads are omitted. Historical refresh events establish that this client's refresh path works; they do not identify the exact saved ChatGPT connection or token family used by every call.

After the [OpenAI connection troubleshooting](https://help.openai.com/en/articles/20001497-troubleshooting-plugins-apps-in-chatgpt) and [metadata refresh procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata), the user selected Moirai Live in a new conversation and confirmed the World lookup works. Railway recorded the new ChatGPT requests to `/mcp` at 05:17:17 with HTTP 200. The old conversation continued returning immediate UNAUTHORIZED at 05:17:51 without reaching the API. The remaining observed failure is therefore confined to the old conversation's retained connection state; the evidence does not claim a particular internal ChatGPT cache defect.

Operational disposition: keep Auth0 for human authentication and the deployed GitHub Actions identity for CI. After tool/auth metadata changes, Refresh the app's metadata and verify in a new conversation; repeatedly reconnecting the same stale conversation is not a useful diagnostic. The successful new-conversation result is user-confirmed and corroborated by HTTP logs, rather than a tool result captured in the old conversation. A future expiry cycle of that exact new conversation was not separately observed. Existing provider refresh successes, the user acceptance and healthy deployed checks close this incident without lengthening tokens or migrating the human provider.

The verified runtime remains `ab4b1d5689cc0dc7d46f52bdd528b53b928e5de5`: [main CI 38202258179](https://github.com/neocjmix/moirai/actions/runs/38202258179) and [automatic authenticated smoke 38202533675](https://github.com/neocjmix/moirai/actions/runs/38202533675) passed, including four live mobile checks. This closeout changes documentation only and preserves the deferred A4 performance disposition and canonical history.
