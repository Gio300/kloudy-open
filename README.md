# Kloudy Open

Open-source Kloudy protocol and SDK. This is the public surface for developers building with Kloudy.

## Lane (delegation)

This repo owns the **open protocol and no-API-key access layer** only: the session model, action log, kloudy.json card schema, connector spec (MCP, FHIR, CLI, SDK), and reference client libraries. This is the middleman surface — developers get SDK/MCP/CLI access through Kloudy without managing their own API keys or approvals.

It does **not** own: the browser product (Gio300/kloudy), the routing engine (Gio300/Project-Black-Box), the glasses UI (Gio300/kloudy-to-glasses), the closed core (Gio300/kloudy-core), or cross-repo contracts (Gio300/kloudy-shared).

**Start here:** read Gio300/kloudy-shared/delegation-map.md, then Gio300/kloudy-shared/inbox/2026-09-27-kloudy-as-middleman.md. Build only inside this repo; if a task belongs elsewhere, log it to kloudy-shared/inbox and stop.

## What's here

- **Session model** — how a bot session is opened, driven, and closed.
- **Action log** — the record of every action a bot takes.
- **kloudy.json card schema** — the site card format for bot-friendly surfaces.
- **Connector spec** — how external tools (MCP, FHIR, CLI, SDK) plug in.
- **SDK** — reference client libraries for the protocol.

## What's not here

- The directory, credential vault, hosted cloud runtime, concierge routing, and ad system. Those are private in [kloudy-core](https://github.com/Gio300/kloudy-core) and are not public.
- The browser product itself. That lives in Gio300/kloudy.
- The routing engine. That lives in Gio300/Project-Black-Box.

## Status

- [ ] Session model spec
- [ ] Action log format
- [ ] kloudy.json schema
- [ ] Connector spec
- [ ] Reference SDK (TypeScript)
