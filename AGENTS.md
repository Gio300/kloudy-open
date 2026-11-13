## For AI agents: how to use Kloudy

The catalog is **kloudy 1.0**: 13,440 bots and 44 modality tags, bundled in this package (npm version 1.0.1). `recommend` / `stack` and `bots ... --offline` read that snapshot (or the local cache if one exists). They do not call the network. Kloudy does not run an LLM to choose bots. Ranking is deterministic: the same goal returns the same JSON.

Classes:

- **A** — live HTTP MCP endpoints.
- **B** — npx or uvx packages.
- **O** — open source and Hugging Face listings.

List modalities:

```sh
npx kloudy@latest bots modalities --offline
```

Commands:

```sh
npx kloudy@latest recommend "<goal>" --json
npx kloudy@latest stack "<goal>" --json
npx kloudy@latest bots search <words> --offline
npx kloudy@latest bots get <id> --offline
npx kloudy@latest agents
npx kloudy@latest --help
```

`recommend` and `stack` are aliases. `--json` prints only a JSON object on stdout (`schema`: `kloudy.recommend/1`, `catalog`: `kloudy 1.0`, `version`: the package version). Without `--json` you get the same sections as text, including an Unmatched section when a part did not match.

Each bot has `id`, `name`, `class` (`A`, `B`, or `O`), `command`, `license`, `description`, `why`, and `modalities`. `command` is what you run or connect to: an `npx ...` command, a `uvx ...` command, or a URL. `recommend` does not install or download anything. Use `bots get <id> --offline` to inspect a pick, then run the command only when you intend to.

The goal is decomposed before matching. Clauses split on commas, semicolons, and the words `and` and `then`. Inside a clause, distinct modality keywords become separate parts. Each part gets the top bots for each modality it needs (up to five). Order is class A, then B, then O, then primary-modality hint, keyword hits, catalog score, and catalog index. A part with no modality or no catalog row is returned in `unmatched` with the part text and the reason `no modality or catalog match`. Parts are not dropped to make a partial stack look complete.

Single-part example:

```sh
npx kloudy@latest recommend "voice assistant that transcribes phone calls" --json
```

One part, modality `audio`. First bot: `httpk:npm:mendelio-voice-mcp`, class B, MIT, command `npx -y mendelio-voice-mcp`.

Multi-part example:

```sh
npx kloudy@latest recommend "voice assistant that transcribes calls, summarizes them, and stores them in a database" --json
```

Three parts:

1. `voice assistant that transcribes calls` — `audio` — `httpk:npm:mendelio-voice-mcp` — `npx -y mendelio-voice-mcp`
2. `summarizes them` — `text` — `httpk:mcp:ai.liquidagent.api:liquid-agent` — `https://api.liquidagent.ai/mcp`
3. `stores them in a database` — `database_access` — `httpk:npm:microsoft:postgres-mcp` — `npx -y @microsoft/postgres-mcp`

`weave a basket` in a larger goal is unmatched. It is reported, not omitted.
