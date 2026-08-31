# Deployment policy

## Hard rule

- **NEVER deploy this application on the current MacBook.**
- The only persistent deployment target is the Tailscale node whose MagicDNS name is `macmini.tail6a877d.ts.net`.
- `npm start` must retain its runtime guard and refuse every other host.
- Local `npm run dev`, type-check, build, and bounded smoke tests are allowed only for development verification. Stop their processes after each check.
- Do not bind a production service to the MacBook, install a local LaunchAgent, or expose a MacBook port through Tailscale Serve/Funnel.
- Public GitHub is source distribution only. The running app stays private to the tailnet through Tailscale Serve, never Funnel.

Deployment authority and recovery details: `docs/deployment.md`.
