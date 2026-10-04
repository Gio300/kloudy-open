# Ask for Kloudy

One CLI, one MCP, tools appear when needed. CLI, MCP and the Node.js SDK use the same scoped Blackbox session. This repository contains the public client adapters and local HTTPK wrapper, not the private router, vault or account service.

## Build a first app without an account

```sh
npm install -g https://kloudy.ai/downloads/kloudy-open-0.3.14.tgz
kloudy init my-kloudy-app
cd my-kloudy-app
npm install
npm start
npm run card -- /world
```

`init` creates a new folder and refuses to overwrite an existing one. `kloudy read https://example.com` and `kloudy card /world` also work directly. These are real public reads, with no model or account call; shared rate limits and website restrictions apply. The public Node exports are `readPublicPage` and `readCard` from `@kloudy/open/public`. Source HTML stays data, never executable UI. The starter’s separate toolbox example requires an existing private connection and selects definitions without executing them.

Developer guide and availability: https://kloudy.ai/build. Customer self-registration is separate from these working public examples.

## Install and run

Node.js 20.19 or newer is required. The tested package is available directly from Kloudy; the source package is distributed by Kloudy, and the hosted door has an MCP Registry listing. It is not an npm registry publication.

```sh
npm install -g https://kloudy.ai/downloads/kloudy-open-0.3.14.tgz
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

The remote option stores only a bearer **environment-variable reference**. `https://kloudy.ai/mcp` now serves authenticated MCP alongside its human guide. The current hosted engine is a finite development service with separately scoped Notes and bounded Base chain-head read clients; it is not open customer registration. The default local stdio adapter works without hosting. With no explicit connection path, all three clients use `~/.kloudy/connection.json`, the same user session across projects.

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

The connection adapter stores only session/selection/request references in a private local checkpoint. CLI, MCP and SDK using the same connection file share that checkpoint. A lock prevents simultaneous mutation; no blind mutation retry is performed. If a process is forcibly killed, first verify it is stopped, then remove the empty `kloudy-open-session-<connection-hash>.json.lock` directory next to its connection file. Do not remove a lock held by a live client. Backend expiry, reauthorization, cross-device delegation and HTTPK token refresh remain engine/Core operations.

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

This consumes deployed BBE 0.3.46. Executable sources are registered Notes today, not arbitrary external MCP/SDK wrappers. Permanent grants and dormant-connection lifecycle still follow the owning GlassBreak/provider services.

## Explicit confirmation for embedded browser hosts

Open 0.3.4 adds `HttpkClient.confirm({selectionId, token, decision: 'approve', source: 'tap'})` for an existing confirm-mode connection. Pass the exact pending `approval.token`, or its integer `revision` instead, never both. Preserve the actual approval source (`tap`, `typed`, `os-voice`); do not label model text or external content as a user's approval. The engine still enforces risk, source, expiry and request binding. Autonomous IDE/CLI behavior is unchanged.

The same public MCP gateway accepts `operation: 'confirm'`, `selection_id`, `decision: 'approve'`, `source`, and exactly one of `token` or `revision`. Missing binding/source fails closed. `scripts/prove-confirmation.mjs` verifies a real bounded Base read, wrong-token denial, zero execution before approval and receipt replay using an existing finite grant from memory. No provider key is distributed.

## IDE experience — 0.3.4

An already attached MCP host receives a welcome and current-project guidance, not another install question. Kloudy or /kloudy explicitly addresses the service; the IDE may use the same tools for relevant tasks without a prefix. The current task selects a small toolbox; a persistent account connection does not load its tools into every project.

The host guidance describes natural keep/cleanup requests and the authoritative lifecycle boundary. It does not pretend that saved mixed-tool workflows, dormant pruning, permanent grants, OAuth signup or user-key transfer have already shipped. Those require the existing engine/Core/GlassBreak interfaces. No synthetic authorization button or password/code collection is added. Kloudy.ai is the use/research surface; building remains in the user's IDE or Bot Boozle.
# SDF yield layer

`kloudy convert https://example.com` extracts a public page through Kloudy's bounded reader without a model call. Add `--resolution standard` for more detail; compact cards default to at most 8,192 UTF-8 JSON bytes. Try the same converter at [kloudy.ai/build](https://kloudy.ai/build#convert).

```js
import {convertPage, convertPages} from '@kloudy/open/public';
import {validateSDF} from '@kloudy/open/sdf';

const card = await convertPage('https://example.com');
console.log(validateSDF(card), card.summary.brief);
const list = await convertPages(['https://example.com', 'https://example.com/missing']);
console.log(list.cards, list.reports); // Each unreadable source is reported.
```

MCP's single `kloudy` door also accepts `operation: "convert", url` or `operation: "yield_list", urls` (1–8). No account is needed for these public reads. The engine owns KLDY query matching and ranking. This client returns content and per-source conversion reports, never a ranked recommendation or permission to execute tools.

Cards validate against the unmodified SDF v0.2 root schema pinned to `sdfprotocol/sdf@e4619ad0b951ced8542692c6b624cb86794cb863` and the additional Kloudy webpage profile. This upstream machine-readable schema differs from its website examples: it uses `sdf:<sha256>`, `summary.brief`, `source.fetched_at`, and section `title`/`summary`. Schemas and upstream MIT notice ship in `schemas/` and at [kloudy.ai/schemas/sdf-webpage-v1.schema.json](https://kloudy.ai/schemas/sdf-webpage-v1.schema.json). `article.x-kloudy-webpage` is our explicit extractive subtype, not a claim that an arbitrary page is a news article. Empty entities mean no semantic entity extraction was performed.

The `extensions["x-kloudy"]` object declares informational-only behavior, no capabilities, resolution, truncation, and unverified ownership/publication. Validation proves structure, not factual accuracy or source ownership. Source content remains untrusted. The reader does not sign in, run page scripts, bypass access controls, or guarantee extraction of text hidden behind JavaScript. Errors are reported instead. Compact output can exceed the size of an already-tiny source; no universal savings percentage is claimed.

Unknown protocol/profile versions are rejected. Breaking card changes require a new profile major version; optional compatible additions keep the version. Card identity binds source URL and raw source hash. Retrieval timestamps can change without changing identity. Existing browser support for the older documented `sdf_`/`one_line` display format remains available.

## Saved mixed strings

The private local `~/.kloudy/sources.json` maps trusted aliases to existing HTTPK connection files. `kind` describes the registered provider adapter; this does not create a missing SDK/CLI/MCP adapter or grant credentials.

```json
{"notes":{"kind":"mcp","connection":"notes-connection.json"},"catalog":{"kind":"sdk","connection":"catalog-connection.json"},"build":{"kind":"cli","connection":"build-connection.json"}}
```

Save a selection file containing only references and goals, for example `[{"source":"notes","kind":"mcp","goal":"Read my notes"},{"source":"catalog","kind":"sdk","goal":"Find this resource"}]`.

```sh
kloudy strings save workspace --selections choices.json
kloudy strings use workspace
kloudy strings call workspace --tool s0_bbe_notes_read --inputs inputs.json
kloudy strings keep workspace
kloudy strings list
kloudy strings prune
kloudy strings remove workspace
```

`use` reselects through each source and returns up to eight distinct tools with source-bound call routes. It never automatically executes the tools. The engine validates exact owned selections at call time; a changed session requires reselection. Strings are project-scoped and stored privately, with no provider credentials or schema dumps. An explicit `prune` removes non-kept choices idle for 30 days. Normal reuse never silently deletes a saved configuration. Authoritative production-phase dormancy events are a separate Core/engine integration. This removes local saved choices, not shared provider keys. `keep` preserves reuse intent; it does **not** mint a permanent grant. GlassBreak service wiring remains an external dependency.

SDK: `StringStore`/`localStrings` from `@kloudy/open/strings`. MCP operations: `strings_save`, `strings_list`, `strings_use`, `strings_call`, `strings_keep`, `strings_remove`, `strings_prune` with `string_name`, `choices`, and, for calls, `name` and `arguments`. Mixed-adapter composition is covered by fixtures; production execution still requires each source's registered adapter and current grant.

## Inline action approval

The stdio MCP server negotiates MCP Apps support. Supported hosts receive a resource with the engine's exact summary, risk and expiry, plus Approve/Cancel buttons. App-only tickets bind an exact engine selection; the engine approval token stays out of model-visible content. Expired, reused and missing tickets fail closed. Approval dispatch is not silently retried after an ambiguous failure. Restarting the server invalidates its ephemeral tickets; fetch the current engine state again.

This is action consent, not customer OAuth. Unsupported hosts do not gain an inline button by returning Markdown. The host must support MCP Apps and its app-only tool visibility rules. CLI autonomous behavior remains unchanged. Tests cover the protocol exchange and exact confirmation binding; acceptance in every third-party IDE and the hosted remote MCP surface is separate work.


## Yield and query boundary

`kloudy convert URL` and `convertPage` return SDF content; `kloudy query "need"` and `HttpkClient.query` ask Blackbox for ranked card references. Search grants no permission. The SDK `sdfIndex(cards, {discoveredVia: 'geo'})` from `@kloudy/open/query` prepares bounded metadata for the existing operator-only engine import; it does not upload, register a tool, or grant access. Supply the actual SEO/GEO provenance, never guess it. `content_sha256` is the raw source body hash. Empty capability IDs deliberately avoid inferring tool access from prose.

Compact cards fit **750 cl100k_base tokens**, measured over compact JSON including attribution and metadata, and at most 8 KiB UTF-8. The tokenizer runs locally with bundled ranks; no model or tokenizer service is called. Token counts vary across model families. Standard resolution is explicitly larger. Oversized attribution fails with a readable report rather than losing the source URL. Updated content gets a new deterministic ID; fetching the same source keeps its ID. The schema remains pinned to SDF 0.2.0 plus `kloudy.sdf.webpage/1`; unsupported versions fail validation. An index lifetime is distinct from long-term content recheck policy.

Type Kloudy in a connected IDE to receive the same old-school cloud welcome. Dot and Grok Boi use this same normal door. The host still must install/attach the client first and controls how text visuals and MCP Apps are rendered. Bot Boozle is the native ecosystem IDE; this client does not claim to deploy its sentence-navigation UI.

A string deduplicates tool definitions, not owned selections. If two choices select the same tool with different arguments, both exact selection IDs remain in `routes`/`selections`; pass `--selection ID` on CLI calls or `{selectionId}` to `StringStore.call`. An ambiguous call fails without executing. MCP uses `selection_id`.

## IDE activity indicator

Version 0.3.11 supplies the public host adapter `@kloudy/open/activity` and stylesheet `@kloudy/open/status-indicator.css`. A compatible host mounts the purple orb with Kloudy above it in its own status surface. Load the stylesheet with your app bundler, then:

```js
import {mountStatusIndicator, observeClient} from '@kloudy/open/activity';
const indicator = mountStatusIndicator(statusBarElement);
const visibleClient = observeClient(client, event => indicator.update(event));
await visibleClient.call(selectedTool, inputs);
// When this status surface closes:
indicator.dispose();
```

Node hosts can use `withConnection(file, work, {onActivity})` and forward these bounded events over their existing trusted webview bridge. Events contain only schema/source/sequence/state/operation, never tool inputs, tokens or receipts. Pending work pulses; approval waits hold still; completed calls settle; failures visibly report failure. Concurrent reads keep the indicator busy until all outstanding work returns. Observer failures cannot retry or break an engine call. Reduced motion is honored.

Native hosts may feed listening/speaking events only while their real OS voice operation is active. This client never records speech. Generic MCP cannot inject an orb into an arbitrary IDE status bar: actual integration in Bot Boozle or another IDE requires that host to mount the adapter. The preview at `node scripts/preview-indicator.mjs` labels its state buttons as simulations; it is not proof of deployment in every IDE.

Wallet preview: `kloudy wallet balance --connection FILE` or `kloudy wallet top_up --amount 10.00 --connection FILE`. The SDK exposes `HttpkClient.wallet({operation, amount_usd})`; MCP uses the same single Kloudy tool with `operation: wallet`. These call the existing `kloudy/wallet` method. A preview never signs a transfer, starts payment or asserts a usable balance. Transfer adapters remain engine capabilities; no separate HTTPK or private signing key is added. Terminal activity uses stderr only when attached to a TTY.


### Chain, wallet, BWW and hosting (BBE 0.3.48)

All operations reuse the same initialized HTTPK session and scoped customer grant.
`client.action(name, inputs, {idempotencyKey})` selects exactly one tool. It does
not execute, approve, sign or broadcast. Use the returned tool/arguments with
`client.call`, then inspect the receipt; retain the same key after an uncertain
selection response. Supported product actions: `chain.head`, `wallet.prepare`,
`bww.fetch`, `bww.publish`. BWW publication is owner-scoped storage, not public
customer hosting. The provider opts into HTML; callers request it explicitly.

```sh
kloudy action chain.head --inputs head.json --idempotency-key inspect-1 --connection FILE
kloudy wallet-connect ethereum --connection FILE
kloudy hosting --connection FILE
kloudy hosting --budget-micros 100000000 --connection FILE
```

`head.json` is `{"chain":"ethereum"}`. SDK equivalents are
`walletConnection('ethereum')` and `hosting({budgetUsdMicros:100000000})`.
MCP uses the existing `kloudy` tool with `operation: action`, `wallet_connection`
or `hosting`. Budget values are integer USD micros. Preserve the authoritative
`customer_budget_active`, `tax_included` and enforcement fields: a development
meter budget is not an active full customer spending limit. Wallet connection
returns namespace requirements, not a QR or ownership proof. The surface SDK
creates pairing using its configured project ID. The user's wallet signs each
transaction; API credentials are not wallet private keys. No cross-chain
settlement is claimed by these adapters. Public customer grant exchange,
fee-recipient configuration and Reown live pairing remain deployment gates.
