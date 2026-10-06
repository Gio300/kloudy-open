> Preserved work in progress: runtime source and tests are missing. This package is not built, published, or accepted in a host. A verified publisher must be configured before Marketplace publication.

# Kloudy for VS Code

Registers one Kloudy MCP and mounts a purple Kloudy indicator in the native status bar. It moves only during actual tool requests. Clicking opens the connection guide. Type Kloudy in a chat with this MCP enabled. The host owns chat, permission prompts and device voice. No model prompts, tool arguments, replies or credentials enter the activity channel.

An existing scoped Kloudy connection is required for protected engine tools; public reading and configured local model discovery remain available without it. Set the user-level `kloudy.connectionFile` path if needed. Never enter a token in settings. Existing user MCP configuration is untouched; disable duplicate Kloudy entries in the host when using the extension.

VS Code 1.127+ is required. Reduced motion can be selected with `kloudy.reduceMotion`; accessibility mode also stops animation. This extension does not change grants, approve tools, replace the host model or provide a microphone. Other IDEs require their own host integration. The compact native status bar uses a contributed monochrome purple orb glyph; it cannot show the full multicolor website orb or a stacked label.

Build: npm install then npm run build; npm run package produces an installable VSIX. Local IPC is loopback-only and carries an ephemeral display token, bounded state and sequence; no account credential. A dropped activity connection shows unavailable rather than a false completed state.
