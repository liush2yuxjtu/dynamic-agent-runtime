# Cloud sandbox fallback

## Scope

The application keeps the Next.js service and CPA on `macmini.tail6a877d.ts.net`. Cloud sandboxes provide only isolated files, commands, processes, and bridge ports. They do not host the application or CPA. The Vercel project exists only as a Sandbox billing and identity scope; its Git integration is disconnected, so pushes cannot create Vercel deployments.

**NEVER deploy this application on the MacBook.** The MacBook may run bounded development and smoke tests.

## Selection order

Each Harness session selects one sandbox before the first turn:

1. Vercel Sandbox when Vercel credentials exist.
2. E2B when `E2B_API_KEY` exists.
3. `just-bash` for the current host-driven Pi and Cline runtimes.

The selected sandbox remains fixed for the session. A command, tool, stream, or file failure never replays work on another provider.

Fallback occurs only when cloud provisioning fails because of a timeout, capacity issue, rate limit, network outage, or service error. Authentication errors, invalid configuration, and bootstrap errors fail closed. The selector runs bootstrap after provisioning and destroys the selected sandbox if bootstrap fails. This safety boundary disables provider snapshot reuse for bootstrap work.

Bridge-backed runtimes must disable the local fallback. `just-bash` cannot expose a bridge port.

## Provider status

- Vercel uses the official `@ai-sdk/sandbox-vercel` provider. Local file, command, process, HTTP port, and destroy probes pass.
- E2B uses the official experimental `@e2b/ai-sdk-sandbox` provider. The provider implements the AI SDK network sandbox contract. Live verification waits for an `E2B_API_KEY`.
- Modal has no approved Harness provider in this project.
- CodeSandbox has no approved Harness provider in this project.
- Daytona has no approved Harness provider in this project.
- Runloop has no approved Harness provider in this project.

The last four entries remain capability records. They do not contain executable factories and cannot become accidental production fallbacks.

## Credentials

Vercel accepts either:

- `VERCEL_OIDC_TOKEN`; or
- `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` together.

E2B accepts `E2B_API_KEY`.

The Mac mini startup script reads optional credentials from these mode-protected files:

```text
~/.config/dynamic-agent-runtime/vercel-token
~/.config/dynamic-agent-runtime/e2b-api-key
```

Each file must use mode `0600` or `0400`. The startup script refuses a broader mode. Cloud control credentials and CPA credentials never enter the sandbox environment.

Vercel OIDC authenticates only Vercel Sandbox. Pi and Cline receive explicit CPA authentication settings, so `VERCEL_OIDC_TOKEN` cannot redirect model traffic to AI Gateway.

## Verification

Run the provider contract smoke test:

```bash
npm run smoke:sandboxes
```

Require specific providers in CI or deployment verification:

```bash
REQUIRE_SANDBOXES=vercel npm run smoke:sandboxes
REQUIRE_SANDBOXES=vercel,e2b npm run smoke:sandboxes
```

The smoke test writes and reads a file, runs a command, starts a long-running HTTP process, reaches its exposed port, kills the process, and destroys the sandbox.

Run the fallback tests:

```bash
npm test
```

The tests prove credential skipping, ordered selection, retryable provisioning fallback, fail-closed authentication, local fallback control, and no mid-session switching.

## Free-tier limits

- Vercel Hobby resets monthly. It allows 10 concurrent sandboxes and a 45-minute provider maximum. This application configures a 30-minute timeout, which stops the sandbox. Explicit session cleanup can destroy it sooner.
- E2B Hobby provides a one-time USD 100 credit. It allows 20 concurrent sandboxes and a one-hour maximum session.
- Modal Starter provides monthly credits, but this project does not enable Modal without an approved provider and a live contract test.
- CodeSandbox Free provides monthly VM credits, but this project does not enable CodeSandbox without an approved provider and a live contract test.
- Daytona and Runloop provide one-time trial credits. Neither becomes executable until an approved provider and credentials pass the same smoke test.
