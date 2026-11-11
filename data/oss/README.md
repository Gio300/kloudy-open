# OSS catalog inputs for npm kloudy

Vetted copies used by `scripts/bundle-bots-catalog.mjs` and the prepared snapshot in `src/deployable-bots.json.gz`. Batch 1 first, then later batches. Flagged license files are not ingested. The fail-closed filter is re-applied on ingest, including Discord/Telegram bot-token holds in `held-discord-telegram.json`. HF x-supersedes replaces the matching earlier row.

The prepared 1.0 snapshot is the Gio300/kloudy PR #13 catalog: the passing A/B set plus approved OSS/HF rows. Rebuild with `npm run bots:bundle` (defaults to `--subset full`) after updating these files.

## Size filter

Class A/B rows are fail-closed to `data/oss/ab-survivors.json` (or `KLOUDY_AB_SURVIVORS`): 11,554 ids with a known payload size of at least 5 KB (5,120 bytes) (A 26, B 11,528). 137 under-5 KB rows are held in `data/oss/ab-held-under-5kb.json`; `data/oss/ab-held-no-size.json` is empty. Held ids are also in `data/oss/kloudy-exclusions-size-20261110.jsonl` with reason `size_under_5kb`. Rows not on the passing list are dropped. The 3,104 `stubs.csv` rows with fileCount 2 or less are not a size filter; 3,026 of those stubs are in the passing set because they are still 5 KB or more.

## Modality tags

`modality-tags.jsonl` is BBE Engine v2 (`modality-tags.v2.jsonl`, 1,901 rows). Tags merge by id onto the kept OSS pack. Lines for ids not in the pack are ignored. The 16-row `overrides-20261110.json` tags are a fallback only when v2 lacks an id. Tags also merge by id from `modality-tags.ab.jsonl`. Cap-derived modalities web, data, cloud, finance, productivity, comms, security, and maps are kept. Same-id case-variant A/B rows are deduped (rule 5).
