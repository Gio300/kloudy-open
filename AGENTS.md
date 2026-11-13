## For AI agents: how to use Kloudy

The catalog is **kloudy 1.0**: 13,440 bots and 44 modality tags, bundled in this package (npm version 1.0.2). `recommend` / `stack` and `bots ... --offline` read that snapshot (or the local cache if one exists). Kloudy never runs an LLM. Ranking is deterministic: the same goal and the same score overrides return the same JSON.

When a network is available, `recommend` may GET `https://kloudy.ai/api/feedback/scores` and cache those overrides for about 24 hours in the Kloudy data directory (`~/.kloudy`, or `KLOUDY_DATA_DIR`). Overrides demote, exclude, or boost a bot after the class tier. `--offline`, a failed request, or a missing scores file leaves ranking on the bundled catalog order.

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
npx kloudy@latest recommend "<goal>" --json --limit 5
npx kloudy@latest stack "<goal>" --json --limit 5 --offline
npx kloudy@latest feedback --stack <stackId> --bot <botId> --result worked|failed|partial [--reason <short>] [--client <name>]
npx kloudy@latest feedback --flush
npx kloudy@latest bots search <words> --offline
npx kloudy@latest bots get <id> --offline
npx kloudy@latest agents
npx kloudy@latest --help
```

`recommend` and `stack` are aliases. `--json` prints only a JSON object on stdout (`schema`: `kloudy.recommend/1`, `catalog`: `kloudy 1.0`, `version`: the package version). Without `--json` you get the same sections as text, including an Unmatched section when a part did not match. `--limit <n>` sets the per-part cap. `n` is an integer from 1 to 20. The default is 5. `--offline` skips the score-override request.

Each bot has `id`, `name`, `class` (`A`, `B`, or `O`), `command`, `license`, `description`, `why`, and `modalities`. `command` is what you run or connect to: an `npx ...` command, a `uvx ...` command, or a URL. `recommend` does not install or download anything. Use `bots get <id> --offline` to inspect a pick, then run the command only when you intend to.

Write the goal as one sentence per need, or as a comma-separated list of needs. A long sentence is still accepted. Clearer parts produce a clearer stack.

The goal is decomposed before matching. Clauses split on commas, semicolons, and the words `and` and `then`. Inside a clause, distinct modality keywords become separate parts. Each part gets the top bots for each modality it needs, then the list is capped per part. Each part includes `candidatesTotal` (how many eligible candidates existed before the cap) and `bots` (the capped list). Narrow that capped list with the project you have open: language, frameworks, licenses, and tools already in the repo. Kloudy never runs an LLM and does not read the project to pick a bot.

Familiar modality words such as transcribe, summarize, and database still return the top bots in that modality. A narrower need, such as a watch, a timer, Android sync, a meal plan, or a social post, keeps only bots that share a real keyword or a clearly related catalog name, id, or cap with that part. Unrelated bots are not added as filler. Order is class A, then B, then O, then score override (boost, then unchanged, then demote), then primary-modality hint, keyword hits, catalog score, and catalog index. Exclude removes a bot before the cap. A part with no modality or no catalog row is returned in `unmatched` with the part text and the reason `no modality or catalog match`. Parts are not dropped to make a partial stack look complete.

`phone`, `call`, and `calls` map to `audio` only when an audio cue is in the same part or clause: transcribe, transcription, voice, speech, audio, whisper, microphone, asr, phone call, or call audio. Otherwise phone, Android, and mobile are a device-sync need, not audio.

Every part has `confidence`: `match`, `weak`, or `none`. Top-level `complete` is true only when every part is `match` and `gaps` is empty. `complete` false means the stack is partial. `gaps` lists unmatched and weak parts. Each gap has the part text, `confidence`, and a reason. `kind` is `catalog integration` when a catalog bot with an install or run command is a real but weak hit. `kind` is `suggestion: build yourself / platform API` when the catalog does not cover the need, such as Wear OS sensor APIs, Health Connect, or the Facebook Graph API. That suggestion is unverified non-catalog guidance. It is not a catalog bot.

Every recommend result includes `limit`, `stackId`, and `feedback`. `stackId` is a sha256 of the goal's parts plus the chosen bot ids. The same parts and the same picks always produce the same `stackId`. `feedback` is the command to run after you try a bot. Put that bot's id in place of `<id>`.

After you try a stack, report whether it worked:

```sh
kloudy feedback --stack <stackId> --bot <botId> --result worked|failed|partial [--reason <short>] [--client <name>]
```

`--result` is `worked`, `failed`, or `partial`. `--reason` is optional and short: it is truncated to 80 characters, and a path, token, or email is dropped. `--client` is an optional tool name such as `cursor`, `claude`, `codex`, or `vscode`. It counts distinct clients. Do not pass a person, email, or account. The report is opt-in and anonymous. The payload may include only `stackId`, `botId`, `result`, an optional short `reason`, the kloudy version, and an optional client name. It never includes the goal text, personal info, file paths, environment, or tokens. The POST goes to `https://kloudy.ai/api/feedback`. If the network is down or the POST fails, the report is queued in the Kloudy data directory and sent on the next `kloudy feedback` or `kloudy feedback --flush`.

Score overrides come from those anonymous reports. `scripts/aggregate-feedback-scores.mjs` is meant to run weekly Sunday 3:00 America/Phoenix. It writes `feedback-scores.json`. Bots with fewer than 3 reports are ignored. A bot is demoted after it fails for 3 or more distinct clients with a failure ratio of 60% or more. A bot is excluded after 10 or more reports with a failure ratio of 80% or more. A bot is boosted at 5 or more reports when at least 80% are `worked` and it is not demoted or excluded. `partial` counts as a report and counts as neither worked nor failed. Failure ratio is `failed` divided by all reports. Reports without a client still count toward ratios. They do not add a distinct client.

Without `--json`, the text includes Confidence, Candidates, Gaps, `limit`, `stackId`, `feedback`, and `complete=true` or `complete=false`. `--json` still prints only the JSON object (`schema`: `kloudy.recommend/1`, `catalog`: `kloudy 1.0`, `version`: `1.0.2`).

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
