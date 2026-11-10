# OSS rows bundled with the npm `kloudy` package

`scripts/bundle-bots-catalog.mjs` strips class O from `data/catalog/deployable-bots-base.json.gz` (the Gio300/kloudy PR #13 catalog, 54,570 bots: 97 class A, 54,159 class B, 314 class O) and merges these manifests with the same fail-closed filter as `scripts/build-deployable-bots.mjs` in that repo.

| file | rows | role |
|--|--:|--|
| `manifests-OSS.jsonl` | 314 | vetted batch 1 already in the PR #13 snapshot |
| `manifests-OSS-batch2.jsonl` | 1401 | MIT/permissive sweep, complete as of 2026-11-10 |

Batch 2 was ingested. Re-run with `npm run bots:bundle`. The npm snapshot keeps class A and class O because the full catalog packed over ~2 MB. `--subset full` writes every class for a local file; `kloudy bots sync` is how a published install fetches class B.
