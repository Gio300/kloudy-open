# OSS catalog inputs for npm kloudy

Vetted copies used by scripts/bundle-bots-catalog.mjs and the prepared snapshot in src/deployable-bots.json.gz. Batch 1 first, then later batches. Flagged license files are not ingested. The fail-closed filter is re-applied on ingest, including Discord/Telegram bot-token holds in held-discord-telegram.json. HF x-supersedes replaces the matching earlier row. Class A/B will be filtered by data/oss/ab-survivors.json or KLOUDY_AB_SURVIVORS once that audit list is provided.

The prepared snapshot is the Gio300/kloudy PR #13 catalog after batch 3 and Hugging Face ingest (A/B survivor filter still pending). Rebuild with 
pm run bots:bundle -- --subset full after updating these files.

## Modality tags

modality-tags.jsonl is BBE Engine v2 (modality-tags.v2.jsonl, 1,901 rows). Tags merge by id onto the kept OSS pack. Lines for ids not in the pack are ignored. The 16-row overrides-20261110.json tags are a fallback only when v2 lacks an id.
