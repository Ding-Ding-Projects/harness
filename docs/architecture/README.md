# Architecture

## Process boundaries

- `src/renderer`: React user interface. No provider credentials are returned from storage. Model output is untrusted content.
- `src/preload`: narrow `window.harness` bridge implemented with `contextBridge` and named IPC channels.
- `src/main`: session lifecycle, encrypted key storage, atomic local persistence, optional workspace tools and approval mediation.
- `src/providers`: network adapters translating shared messages and tool definitions into each provider's documented protocol.
- `src/shared/types.ts`: the shared wire contract.

The run engine sends conversation history and settings to one selected provider. Streaming deltas are delivered to the matching conversation. Tool calls become bounded local read operations or explicit approval requests. The engine has a finite tool-round limit and cancellation signal. Provider and tool failures are surfaced without reflecting credential-bearing response bodies.

## Extending providers

An OpenAI-compatible endpoint can use a custom profile without a code change. A different protocol needs a new adapter implementing `streamProvider`'s shared events and model discovery. Authentication is part of the adapter contract: API-key compatibility is not equivalent to OAuth, IAM, request signing or browser-subscription access.

Add fixture tests for request serialization, split stream frames, content extraction, tool arguments, usage normalization, cancellation and malformed responses before advertising a new protocol.

## Packaging

Vite bundles the renderer with relative asset paths for packaged loading. esbuild bundles main and preload separately, leaving only Electron external. The Forge packager includes the compiled payload and original application icon; Squirrel.Windows creates the installer. Build receipts record the source revision, whether it was dirty, build time and entrypoint hashes.

The application has no public server API, so a Postman collection is not applicable. Provider APIs are outgoing integrations, documented in the provider category.
