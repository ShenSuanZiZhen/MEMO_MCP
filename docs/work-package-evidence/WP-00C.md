---
work_package: WP-00C
status: PASS
completed_at: 2026-09-16T06:30:21Z
gate: architecture
depends_on:
  - WP-00A
---

# WP-00C Evidence

## Scope Delivered

- Added `.github/workflows/ci.yml` with a single blocking `quality-gate` job.
- Added local CI reproduction through `pnpm ci:local`.
- Added deterministic dependency policy scanning through `pnpm dependency:scan`.
- Added repository secret scanning through `pnpm secret:scan`.
- Added lockfile cache-key proof helper through `pnpm ci:cache-key`.
- Updated `AGENTS.md` with repository boundaries, required commands, scan exception policy, and stop conditions.
- Updated `README.md` with CI order, cache behavior, scan commands, and fixture exception rules.

No product code, production release flow, production credentials, or external write operations were added.

## CI Job

- Workflow: `.github/workflows/ci.yml`
- Job: `quality-gate`
- Dependency install: `pnpm install --frozen-lockfile`
- Cache basis: `pnpm-lock.yaml` through `actions/setup-node` pnpm cache configuration
- Blocking behavior: no `continue-on-error` steps

CI and local reproduction run the same ordered gate:

1. `pnpm format`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test:unit`
5. `pnpm test:contract`
6. `pnpm build`
7. `pnpm dependency:scan`
8. `pnpm secret:scan`

## Blocking Rules

- Formatting, linting, type checking, unit tests, contract checks, builds, dependency scan, and secret scan are all blocking.
- Dependency installation uses the frozen lockfile.
- Dependency policy requires exact, `workspace:`, or `file:` dependency specifiers.
- The pnpm build-script allowlist remains reviewed and narrow.
- Secret scanning is repository-wide for text files and does not use broad fixture-directory ignores.
- Fake fixture secrets are only allowed by exact path, scanner pattern, and SHA-256 of the synthetic value.

## Scan Exceptions

The only secret-scan exception added by WP-00C is:

- id: `synthetic-openai-key-fixture`
- path: `scripts/fixtures/secret-scan/allowed.env`
- pattern: `openai-api-key`
- SHA-256: `d5b58e37bad98fdfbc1f26065aad7d84e620cc842fdf22ddb28712492da63e10`
- reason: synthetic fixture value used to prove exact allowlisting

No broad scanner pattern disablement or directory-wide exception was added.

## Validation

| Check                      | Result | Evidence                                                                                                                                                                                                                                                           |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Readiness                  | PASS   | `./scripts/check-work-package-ready.sh WP-00C` reported dependency `WP-00A` PASS and `READY WP-00C`.                                                                                                                                                               |
| Dependency scan            | PASS   | `pnpm dependency:scan` reported pinned dependency policy passed.                                                                                                                                                                                                   |
| Secret scan allowlist path | PASS   | `pnpm secret:scan` passed with the synthetic fixture allowlisted by hash.                                                                                                                                                                                          |
| Secret scan negative test  | PASS   | Temporary unallowlisted fixture failed `pnpm secret:scan` with `aws-access-key-id`, then was removed.                                                                                                                                                              |
| Secret scan after cleanup  | PASS   | `pnpm secret:scan` passed after removing the temporary unallowlisted fixture.                                                                                                                                                                                      |
| Lockfile cache key changes | PASS   | Original `pnpm-lock.yaml` key was `pnpm-pnpm-lock.yaml-4dec5f72a99052714e2f2438f1bb8ec4e115270de8cb759f3fb6357eb4010d87`; modified same-name `/tmp/pnpm-lock.yaml` key was `pnpm-pnpm-lock.yaml-d7d03fe25a3a149edca4ab88d337e92320d4bbec72b53dfb12862325476c4274`. |
| Local CI reproduction      | PASS   | `pnpm ci:local` passed all eight ordered gates.                                                                                                                                                                                                                    |
| Full verification          | PASS   | `pnpm verify` passed and delegates to `pnpm ci:local`.                                                                                                                                                                                                             |

## Downstream Commands

- Focused local reproduction: `pnpm ci:local`
- Root verification: `pnpm verify`
- Dependency policy scan: `pnpm dependency:scan`
- Secret scan: `pnpm secret:scan`
- Cache-key proof helper: `pnpm ci:cache-key`

## Stop Conditions and Review Gate

WP-00C did not require organization tokens, production access, product-code edits, or weakening a security gate.

The required architecture review completed successfully. The implementation and recorded residual risks were accepted, so this evidence is promoted to `PASS`.

## Architecture Review

- Decision: `PASS`
- Blocking findings: none
- Residual-risk decision: accept the deterministic dependency-policy gate for WP-00C; live advisory-database vulnerability scanning remains follow-up scope.
- Repository-control decision: GitHub branch protection must require the actual check name emitted by the `quality-gate` job after the workflow is available remotely.

## Residual Risk

- `pnpm dependency:scan` is a deterministic local policy gate, not a live advisory-database vulnerability audit.
- CI is configured for GitHub Actions; repository branch protection must separately require the `quality-gate` job.
