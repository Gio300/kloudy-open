## For AI agents: how to use Kloudy

The catalog is **kloudy 1.0**: 13,440 bots and 44 modality tags, bundled in this package (npm version 1.0.2). `recommend` / `stack` and `bots ... --offline` read that snapshot (or the local cache if one exists). They do not call the network. Kloudy does not run an LLM to choose bots. Ranking is deterministic: the same goal returns the same JSON.

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

Write the goal as one sentence per need, or as a comma-separated list of needs. A long sentence is still accepted. Clearer parts produce a clearer stack.

The goal is decomposed before matching. Clauses split on commas, semicolons, and the words `and` and `then`. Inside a clause, distinct modality keywords become separate parts. Each part gets the top bots for each modality it needs (up to five). Familiar modality words such as transcribe, summarize, and database still return the top bots in that modality. A narrower need, such as a watch, a timer, Android sync, a meal plan, or a social post, keeps only bots that share a real keyword or a clearly related catalog name, id, or cap with that part. Unrelated bots are not added as filler. Order is class A, then B, then O, then primary-modality hint, keyword hits, catalog score, and catalog index. A part with no modality or no catalog row is returned in `unmatched` with the part text and the reason `no modality or catalog match`. Parts are not dropped to make a partial stack look complete.

`phone`, `call`, and `calls` map to `audio` only when an audio cue is in the same part or clause: transcribe, transcription, voice, speech, audio, whisper, microphone, asr, phone call, or call audio. Otherwise phone, Android, and mobile are a device-sync need, not audio.

Every part has `confidence`: `match`, `weak`, or `none`. Top-level `complete` is true only when every part is `match` and `gaps` is empty. `complete` false means the stack is partial. `gaps` lists unmatched and weak parts. Each gap has the part text, `confidence`, and a reason. `kind` is `catalog integration` when a catalog bot with an install or run command is a real but weak hit. `kind` is `suggestion: build yourself / platform API` when the catalog does not cover the need, such as Wear OS sensor APIs, Health Connect, or the Facebook Graph API. That suggestion is unverified non-catalog guidance. It is not a catalog bot.

Without `--json`, the text includes Confidence, Gaps, and `complete=true` or `complete=false`. `--json` still prints only the JSON object (`schema`: `kloudy.recommend/1`, `catalog`: `kloudy 1.0`, `version`: `1.0.2`).

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

That control stack is `complete` true: each part is confidence `match`, and `gaps` is empty.

`weave a basket` in a larger goal is unmatched. It is reported, not omitted. The goal is then `complete` false.
