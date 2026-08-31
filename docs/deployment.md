# Mac mini deployment

## Immutable target rule

**NEVER deploy this application on the MacBook.** The only persistent target is the authenticated Tailscale node:

```text
MagicDNS: macmini.tail6a877d.ts.net
App host: 127.0.0.1:4312 on macmini
Tailnet URL: https://macmini.tail6a877d.ts.net:3012
```

The MacBook may run short-lived development, build, and smoke commands. It must not run `npm start`, own a production LaunchAgent, or publish this service with Tailscale Serve/Funnel. `scripts/assert-macmini` and `scripts/start-macmini` enforce this rule.

## Architecture

```text
MacBook browser
  -> encrypted Tailscale connection
  -> Tailscale Serve HTTPS :3012 on macmini
  -> Next.js 127.0.0.1:4312
  -> HarnessAgent + selectable Pi/Cline + just-bash sandbox
  -> macmini CPA 127.0.0.1:8317/v1
```

Tailscale Serve is tailnet-private. Do not replace it with Funnel. The API derives each session-store key from Tailscale's authenticated `Tailscale-User-Login` header; direct requests are accepted only from loopback for operator smoke tests. This app reaches CPA through `127.0.0.1` and does not publish CPA through Tailscale Serve. Its API key is resolved by the existing mode-protected helper; no credential belongs in Git.

## Persistent service

- Source checkout: `~/Applications/dynamic-agent-runtime`
- Immutable releases: `~/.local/share/dynamic-agent-runtime/releases/<commit>`
- LaunchAgent label: `com.liushiyu.dynamic-agent-runtime`
- LaunchAgent file: `~/Library/LaunchAgents/com.liushiyu.dynamic-agent-runtime.plist`
- State and logs: `~/.local/state/dynamic-agent-runtime/`
- Internal port: `4312`
- Tailnet HTTPS port: `3012`

`scripts/deploy-macmini` owns immutable release creation, install, type-check, build, atomic LaunchAgent replacement, rollback, health checks, and the non-destructive Tailscale Serve rule addition. It refuses hosts other than `macmini.tail6a877d.ts.net`, refuses deployment below 10 GiB free disk, and refuses an unmanaged listener or unrelated Tailscale handler on the reserved port.

Port `3012` is exclusively reserved for this app. The deployment guard allows it only when unused or already mapped to this app's `127.0.0.1:4312` backend. Recovery may therefore remove the whole `3012` listener without affecting unrelated Serve routes.

## Operator workflow

Pi owns these steps; the user need not remember commands:

1. Verify local and remote Tailscale identity and `tailscale ping macmini`.
2. Verify GitHub source is public and merged on `main`.
3. Clone or fast-forward `~/Applications/dynamic-agent-runtime` on macmini.
4. Run `./scripts/deploy-macmini` remotely. Its smoke gate tests both Pi and Cline against CPA.
5. Verify LaunchAgent, loopback health, Tailscale Serve status, and the tailnet HTTPS URL from the MacBook.
6. Open the tailnet URL only from the MacBook; do not start a MacBook copy.

## Recovery

```bash
# Read service state and logs on macmini
launchctl print "gui/$(id -u)/com.liushiyu.dynamic-agent-runtime"
tail -100 ~/.local/state/dynamic-agent-runtime/app.log

# Remove this app's exclusively reserved Tailscale Serve listener
# Verify exact current syntax first with: tailscale serve --help
tailscale serve --yes --https=3012 off

# Stop only this app's LaunchAgent
launchctl bootout "gui/$(id -u)/com.liushiyu.dynamic-agent-runtime"
```

Never use `tailscale serve reset`; macmini already carries unrelated Serve routes. Never stop an unknown listener to reclaim ports. Failed releases automatically restore the previous LaunchAgent plist and immutable release.
