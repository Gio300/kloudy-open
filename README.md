# kloudy-open — public protocol

Open SDK, session/action schemas, CLI/npm/slash docs for outsiders.

## Ownership (binding — kloudy-shared/contracts/ownership.md)

- **kloudy-open** owns: public protocol, SDK, CLI install docs, npm package docs, slash-command docs, MCP Registry publish.
- Does NOT own: product UIs, secrets, engine internals, browser chrome.

## MCP Registry

The registry is a **catalog** — metadata, names, endpoints. It is NOT an API to every MCP.
Kloudy still connects each MCP through its own auth (vault + temporary tokens).

Publish flow: `mcp-publisher init` → authenticate (GitHub OAuth, `io.github.Gio300/*` namespace) → `server.json` → publish npm package → `mcp-publisher publish`.

## CLI / npm / slash

- `npm install -g kloudy` → binary on PATH + slash-command files dropped into IDE commands folders.
- `/kloudy` in Cursor/Claude Code/etc. triggers `kloudy install` (vault login, MCP entry written).
- Docs for outsiders: one command, zero config.

## Edge cases

- No secrets in public docs.
- No product UI claims.
- Registry listing is the GEO credibility signal — usage is the citation engine.
