# Harness

A local-first Windows desktop workspace for AI conversations and explicitly approved workspace tools. Bring your own provider account, endpoint and API key. Configure multiple profiles, choose models, stream responses, keep conversation history locally, and export your work.

**Compatibility is protocol-based, not a claim that every AI service works.** Native adapters target OpenAI Responses, OpenAI Chat Completions, Anthropic Messages, Gemini, and Azure OpenAI. Compatible endpoints include OpenRouter, Groq, Together, Fireworks, DeepSeek, xAI, Mistral, Cerebras, Perplexity, Hugging Face, Ollama and LM Studio. Model capabilities, tool support, regional URLs, account permissions and billing remain provider-specific. AWS Bedrock IAM, Vertex AI OAuth and proprietary APIs need additional authentication adapters.

## Build and run

Windows x64 is the supported packaging target. From a fresh checkout:

```powershell
.\build.bat --run
```

The script acquires pinned Node.js when needed from nodejs.org, checks its published SHA-256, installs locked dependencies, builds the desktop application, and launches the packaged executable. Internet access is required for the first build. The packaged application includes its runtime.

```powershell
.\build.bat /s
.\build-installer.bat /s
```

The application is produced under `out/Harness-win32-x64/`. Genuine Squirrel.Windows installer files are produced under `out/make/squirrel.windows/x64/`: `HarnessSetup.exe`, `RELEASES`, and a full `.nupkg`. They are unsigned and Windows may show an unknown-publisher or SmartScreen warning. Building does not publish a release or configure an update feed.

For development with Node.js 24.19.0:

```powershell
npm ci
node node_modules/electron/install.js
npm run dev
```

For a production renderer build and local checks:

```powershell
npm run build
npm run typecheck
npm test
```

## First conversation

1. Open **Providers**, choose a preset, and enter a name, endpoint, model and your own API key. Enter secrets only in the application's password field.
2. Save the profile, then use **Test connection** or reopen it and choose **List models**. Enter an exact model/deployment identifier when listing is unavailable.
3. Create a conversation, choose the profile and send a prompt. Provider charges may apply. No paid request is issued merely by opening the app.
4. To use workspace tools, select a folder and explicitly enable tools in settings. Each proposed file write or command requires a separate approval showing what will run.
5. Stop a run at any time. Export a conversation as Markdown or JSON; saved API keys are never included.

## Security boundaries

Provider requests run in the desktop main process. The renderer is sandboxed, has no Node.js integration, and uses a small validated IPC interface. Stored API keys are encrypted with Electron `safeStorage` using the operating system's protection. No fallback to plaintext storage is permitted. Encryption at rest is not protection against a compromised signed-in operating-system account.

Use HTTPS for hosted endpoints. HTTP is allowed only for loopback services. Credentials are never forwarded through redirects. A compatible endpoint is a recipient you choose, so only configure endpoints you trust. An API key from one provider does not grant access to another.

Workspace tools are optional. Read tools are bounded to the selected folder and exclude sensitive paths. Writes show a preview and revalidate the destination after approval. **An approved command runs with your user account's permissions, not inside an operating-system sandbox.** Review the complete command before allowing it. Conversation content can include selected workspace data and is sent to the chosen provider when included in a request.

See [provider documentation](docs/providers/README.md), [security documentation](docs/security/README.md), [architecture](docs/architecture/README.md), [roadmap](ROADMAP.md), and [verification status](HANDOFF.md).

## Project boundaries

No provider account, paid subscription, hosted service, auto-update feed or API key is bundled. Local protocol fixtures establish request parsing and stream behavior; live provider verification requires the user's account and is reported separately. Published releases, runtime captures and complete feature verification are only claimed when linked in `HANDOFF.md`.

Version 0.1.0 is a runnable local desktop foundation. It supports text conversations and four optional workspace tools. Image/audio/file attachments, Bedrock IAM, Vertex OAuth, a hosted update feed, full localization and the broader product feature inventory are not implemented. Navigation and core conversation controls have English, Cantonese and bilingual modes; provider, settings and help copy remains partly English.

Contributors keep credentials out of source, test fixtures, logs and exports, preserve user data, validate privileged inputs, and report observed results rather than inferred success. Repository-local development details are in `AGENTS.md`.

## Verified desktop views

These are original captures of the packaged application with a disposable local fixture. They are not live cloud-model responses. The source commit, hashes and state tuples are recorded in [the evidence inventory](evidence/inventory.json).

![Harness conversation with a completed local streaming response](evidence/conversation-dark.png)

![Harness appearance and model settings in dark theme](evidence/settings-dark.png)

![Harness bounded regular expression builder in dark theme](evidence/search-dark.png)
