# Ask for Kloudy

One CLI, one MCP, tools appear when needed. CLI, MCP and the Node.js SDK use the same scoped Blackbox session. This repository contains the public client adapters and local HTTPK wrapper, not the private router, vault or account service.

## Install and run

Node.js 20 or newer is required. The tested package is available directly from Kloudy; the source package is distributed by Kloudy, and the hosted door has an MCP Registry listing. It is not an npm registry publication.

```sh
npm install -g https://kloudy.ai/downloads/kloudy-open-0.3.1.tgz
kloudy
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
kloudy                         # introduce Kloudy and this project; ask once to install
kloudy introduce --decision no # stay chat-only
kloudy install --ide codex     # explicit consent; user-level installation
kloudy install --ide cursor --connection /private/connection.json
# Once a hosted MCP endpoint and scoped user grant are provisioned:
kloudy install --ide codex --url https://kloudy.ai/mcp --token-env KLOUDY_MCP_TOKEN
```

One user installation covers projects. Cursor, Claude Code, VS Code and Codex receive their own supported **user-level** MCP config, without modifying project files. The installer preserves other entries, backs up changes, and leaves conflicting Kloudy entries untouched. Codex TOML comments are preserved. JSONC/non-JSON configs are left unchanged. Cursor and Claude receive a user slash command; every MCP host receives a `kloudy` prompt and default introduction operation. Host approval/trust policies remain in force. The local installation record is not an account or permission grant.

Bare `kloudy`, `Kloudy`, `/kloudy`, and `ask Kloudy` in this CLI return a project-aware introduction before opening an engine session. The MCP tool does the same for `introduce` or an exact attach intent. It classifies known manifest names/dependencies, looks up at most three relevant public catalog names, and asks one install/connect question. Catalog candidates are explicitly non-executable until granted. It never reads `.env`, source contents or another project's checkpoint. With an HTTPK connection, the introduction comes from the real engine's `bbe.attach.v1` intent payload. Without a reachable account/session, the client provides a clearly marked deterministic public-catalog fallback. An unconfigured IDE cannot discover a CLI just from an ordinary chat word: install the MCP adapter first, then invoke the tool or `/kloudy` prompt.

The remote option stores only a bearer **environment-variable reference**. `https://kloudy.ai/mcp` now serves authenticated MCP alongside its human guide. The current hosted engine is a Notes-only development tenant with expiring operator-issued grants; it is not open customer registration. The default local stdio adapter works without hosting. With no explicit connection path, all three clients use `~/.kloudy/connection.json`, the same user session across projects.

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

Protocol references: [MCP SDK](https://ts.sdk.modelcontextprotocol.io/), [Cursor MCP](https://prod.cursor.com/help/customization/mcp), [Claude MCP](https://code.claude.com/docs/en/mcp), [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers). Private coordination source: Gio300/kloudy-shared session-routing and passive-narrowing contracts.

## Approval defaults

CLI and IDE MCP are autonomous: the host permission policy and scoped engine grant govern execution. There is no CLI approve command or confirm option. The SDK accepts `mode: 'autonomous'` (default) or `mode: 'confirm'`; for example `withConnection(file, work, {mode: 'confirm'})` for a trusted confirm-mode embed. Do not use CLI-issued credentials for a browser embed. The engine binds the surface to the grant; clients cannot mint or relabel credentials.

The client verifies engine mode acknowledgment before routing. An older engine that still returns `awaiting_approval` in autonomous mode produces `engine_autonomy_not_supported`; it never fabricates a tap or calls approval automatically. Upgrade the engine or cancel that request. Hosted OAuth, credential refresh and public MCP deployment remain owned engine/Core capabilities.

## Hosted HTTPK (0.3.0)

A private connection may contain `endpoint: "https://kloudy.ai/mcp"`, `access_token` and `expires_at`, obtained through the owning grant service. The same CLI/MCP/SDK adapter then uses the deployed engine's HTTPK protocol. No user key belongs in this README, an install command or a prompt. The hosted development engine currently understands Notes actions such as `save note: ...` and `read note ID`; external discovery candidates are explicitly rejected on this limited transport.

A standard remote MCP host sees one `kloudy` tool. `introduce` gets the engine greeting; `ask` returns the selected singular tool and exact arguments; `call` carries that selection; `status`/`cancel` use its receipt. The adapter forwards authority to Blackbox and never invents approvals, risk classifications, model retries or provider access. The hosted protocol is MCP 2025-06-18; the pinned official SDK negotiates it.

`node scripts/prove-hosted.mjs` uses an in-memory, expiring test grant and a temporary user config to prove the real public MCP handshake, engine greeting, one selected tool, completed Notes receipt, idempotent replay and SDK readback. It does not claim a visual IDE session or the provider-model failure ladder was tested. Those remaining checks are recorded in Shared.

## Selected Toolboxes — 0.3.1

With a scoped HTTPK connection, each ask returns its engine selection_id. Collect 1–16 distinct IDs from that same session. Assembly is passive: no model, action or approval runs.

```sh
kloudy ask "read note NOTE_ID" --connection /private/httpk.json
kloudy ask "save note: proposed draft" --connection /private/httpk.json
# Put only the returned selection IDs into selections.json as a JSON array.
kloudy assemble --selections selections.json --connection /private/httpk.json
kloudy call TOOL_NAME --selection SELECTION_ID --inputs exact-inputs.json --connection /private/httpk.json
```

SDK: client.assemble(ids), then client.call(name, exactArguments, {selectionId}). Local MCP and the public hosted MCP keep one kloudy gateway with operation assemble and selection_ids; operation call uses the exact selection_id, name and arguments. Assembly returns deduplicated tools and exact per-selection metadata, so two selections of one tool retain their distinct arguments. The engine validates ownership, grant scope and per-action authorization. No bulk execution or blind retry is added. Legacy local-engine connections retain their previous single-selection interface and explicitly reject HTTPK-only assembly.

This consumes deployed BBE 0.3.36. Executable sources are registered Notes today, not arbitrary external MCP/SDK wrappers. Permanent grants and dormant-connection lifecycle still follow the owning GlassBreak/provider services.
