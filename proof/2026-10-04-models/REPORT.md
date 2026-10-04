# Open 0.3.15 model client delivery

Implemented CLI and SDK bounded model listing/completion on user-owned OpenAI-compatible endpoints; read-only MCP model discovery through the existing kloudy tool; JSON status templates; BBE host-interface negotiation without changing permissions.

Verification (2026-10-04 UTC):
- npm test: exit 0, 63 passed, 0 failed. Full output: tests.log.
- Actual installed Ollama catalog: exit 0, local-catalog.json.
- Actual local qwen2.5:7b-instruct-q4_K_M completion: exit 0, local-inference.json, Ready, 36 prompt + 2 completion tokens. No model downloaded; no paid provider request.
- Actual stdio MCP client: exit 0, stdio-models.json, single kloudy tool, same live local catalog.
- Actual installed BBE HTTPK presentation negotiation: exit 0, installed-host.json, zero mocked hops, unchanged session/mode, no credential minted, no model invoked.
- Adversarial coverage: provider-cost gate before network; local proxies cannot masquerade as free Ollama; cloud aliases require permission; credential resolver called per request; echoed secrets rejected; redirect/response/token bounds; missing models; no automatic retry of uncertain completion; MCP callers cannot change configured endpoint; template slots bounded and unknown state unconfirmed.

Scope: direct endpoint adapter, not managed LiteLLM provisioning, automatic installation, cloud CPU capacity proof, wallet settlement or authoritative customer grants. These are listed in kloudy-shared/inbox/2026-10-04-model-client-and-template-delivery.md. Version 0.3.15 is directly downloadable from kloudy.ai/downloads/kloudy-open-0.3.15.tgz; not published to the npm registry in this release.
