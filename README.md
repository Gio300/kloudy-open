# Kloudy Open

Open-source Kloudy protocol and SDK. This is the public surface for developers building with Kloudy.

## What this is

The open layer of Kloudy: the protocol, schemas, and SDKs that let anyone build on top of the Kloudy network. The closed core (directory, vault, hosted runtime, concierge, ads) lives in [kloudy-core](https://github.com/Gio300/kloudy-core) and is not public.

## What's here

- **Session model** — how a bot session is opened, driven, and closed.
- **Action log** — the record of every action a bot takes.
- **kloudy.json card schema** — the site card format for bot-friendly surfaces.
- **Connector spec** — how external tools (MCP, FHIR, CLI, SDK) plug in.
- **SDK** — reference client libraries for the protocol.

## What's not here

- The directory, credential vault, hosted cloud runtime, concierge routing, and ad system. Those are private in kloudy-core.
- The browser product itself. That lives in Gio300/kloudy.
- The routing engine. That lives in Gio300/Project-Black-Box.

## Status

- [ ] Session model spec
- [ ] Action log format
- [ ] kloudy.json schema
- [ ] Connector spec
- [ ] Reference SDK (TypeScript)
