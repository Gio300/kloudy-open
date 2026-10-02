# Ask for Kloudy

One CLI, one MCP, tools appear when needed. CLI, MCP and the Node.js SDK use the same scoped Blackbox session. This repository contains the public client adapters and local HTTPK wrapper, not the private router, vault or account service.

## Install and run

Node.js 20 or newer is required. The tested package is available directly from Kloudy; it has not been published to the npm or MCP registries.

```sh
npm install -g https://kloudy.ai/downloads/kloudy-open-0.2.0.tgz
kloudy help
```

From a source checkout: `npm ci`, `npm test`, `npm link` (or `node bin/kloudy.mjs help`). There is no install-time script that edits your IDE.

Ask for Kloudy and register with email plus short 2FA; the intended account service then supplies a session cookie, tag or OAuth connection. **That Core registration endpoint is not delivered yet.** `kloudy login` reports this clearly, collects no email/code and exits 3. This package does not create fake accounts or mint production credentials.

An existing scoped Blackbox connection can be supplied through a private connection file created by the native host/operator. It contains the engine origin and access token; do not put it in Git, a prompt or public page. `KLOUDY_CONNECTION` can refer to its path so you do not repeat `--connection`.

```sh
kloudy ask "Build an app to create private notes" --connection /private/connection.json --candidates discovery-cards.json
kloudy call bbe_notes_create --connection /private/connection.json --inputs note-inputs.json
kloudy status --connection /private/connection.json
kloudy cancel --connection /private/connection.json
```

`ask` accepts up to 16 supplied KLDY/FHIR metadata candidates. Blackbox ranks them and supplies at most one authorized definition. No client-side scoring or whole-server catalog download substitutes for the engine. With no candidates, the client asks the existing destination route for an information card and returns an empty Toolbox; automatic catalog/web discovery needs the engine feed. No match, expired grants and missing registration remain explicit. Only `call` submits the chosen tool inputs, and the engine retains exact approval authority.

## One MCP in the IDE

```sh
kloudy install --project /your/project --connection /private/connection.json
# Or select a supported host explicitly:
kloudy install --project /your/project --ide cursor --connection /private/connection.json
kloudy mcp --connection /private/connection.json
```

The installer detects existing Cursor, Claude Code and VS Code project folders. It adds one `kloudy` MCP entry, preserves other entries, backs up a changed configuration, and leaves a conflicting existing Kloudy entry untouched. Cursor and Claude receive `/kloudy` command text. VS Code uses its MCP tools interface. JSONC/non-JSON files are left unchanged. Other MCP-compatible IDEs can configure the `kloudy mcp` stdio command directly. Host approval/trust policies remain in force.

The MCP tool list initially has one `kloudy` entry. An `ask` operation adds only the selected tool as `selected_<engine-name>`. Selecting a new task replaces it; running it clears the selection. Status/cancellation use the Kloudy entry and the same engine request. Model-visible outputs never contain the bearer.

## SDK

```js
import {withConnection} from '@kloudy/open/session';
const result = await withConnection('/private/connection.json', client =>
  client.ask('Find a tool for this task', {candidates, lane: 'non_medical'})
);
console.log(result.toolbox); // zero or one engine-selected definition
```

`KloudyClient` and `httpTransport` are also exported for trusted Node/native hosts with their own credential storage. Never embed a provider token in browser code. Voice, text, exchange, listing and hosting tool packs use this same ask/call boundary as their capabilities are registered; this client does not claim those providers are all live.

The connection adapter stores only session/selection/request references in a private local checkpoint. CLI, MCP and SDK using the same connection file share that checkpoint. A lock prevents simultaneous mutation; no blind mutation retry is performed. If a process is forcibly killed, first verify it is stopped, then remove the empty `kloudy-open-session.json.lock` directory next to its connection file. Do not remove a lock held by a live client. Backend expiry, reauthorization, cross-device delegation and HTTPK token refresh remain engine/Core operations.

## Local HTTPK wrapper

`kloudy wrap --config /private/wrap.json` runs an operator-configured stdio MCP behind an authenticated, stateless Streamable HTTP endpoint. The config supplies `command`, `args` and `tools` (the exact selected tool names). An optional `env` contains only the deliberately passed upstream environment. Supply the wrapper bearer through `KLOUDY_WRAP_TOKEN`, obtained from the owning host/grant service. The token is never printed.

The listener binds loopback. It rejects browser Origin requests, non-loopback Host headers, invalid/missing bearer, oversized bodies and tools outside its allowlist. Upstream stderr is not forwarded. Upstream crashes return 502 and timeouts return 504. Maximum two simultaneous upstream processes; each closes after its request. Local-file tools stay local. Public HTTPS hosting, Core identity, VaultKeeper token validation/rotation and managed reconnect need their owning edge services; this package does not expose a local bearer endpoint publicly or create permanent grants.

MCP transport compatibility is pinned to the official SDK 1.31.0 and its 2025-11-25 handshake. Newer transport revisions require a tested upgrade; this is not an unversioned protocol claim.

## Verification

`npm test` covers real HTTP/stdio round trips, selected-tool isolation, auth/origin rejection, crash handling, shared SDK behavior, explicit approval and safe IDE installation.

The real-engine acceptance script uses a separately provisioned local Blackbox instance and synthetic public metadata, never a mock engine. It exercises CLI → MCP → SDK → autonomous completed Notes result, with no extra approval call. It intentionally requires an explicit test flag:

```sh
node scripts/prove.mjs --connection /private/test-connection.json --candidates /path/to/test-cards.json --approve-synthetic
```

The proof writes `.cache/live-engine-proof.json` without credentials. A completed synthetic Notes result is not a claim of hosted registration, live provider discovery or unrelated integrations.

Protocol references: [MCP SDK](https://ts.sdk.modelcontextprotocol.io/), [Cursor project MCP](https://prod.cursor.com/help/customization/mcp), [Claude project MCP](https://support.claude.com/en/articles/14554922-claude-code-user-faq), [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers). Private coordination source: Gio300/kloudy-shared session-routing and passive-narrowing contracts.

## Approval defaults (0.2.0)

CLI and IDE MCP are autonomous: the host permission policy and scoped engine grant govern execution. There is no CLI approve command or confirm option. The SDK accepts `mode: 'autonomous'` (default) or `mode: 'confirm'`; for example `withConnection(file, work, {mode: 'confirm'})` for a trusted confirm-mode embed. Do not use CLI-issued credentials for a browser embed. The engine binds the surface to the grant; clients cannot mint or relabel credentials.

The client verifies engine mode acknowledgment before routing. An older engine that still returns `awaiting_approval` in autonomous mode produces `engine_autonomy_not_supported`; it never fabricates a tap or calls approval automatically. Upgrade the engine or cancel that request. Hosted OAuth, credential refresh and public MCP deployment remain owned engine/Core capabilities.
