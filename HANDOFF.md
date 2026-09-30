# Verification handoff

## Delivered local build

Harness 0.1.0 is a runnable Windows x64 desktop AI workspace. The verified application and installer were built from `c028c39eb07c55d84dcac937d438a05073d42c46`. Later documentation and verification-helper changes do not change the packaged runtime.

- Run `out/Harness-win32-x64/Harness.exe` with the rest of its folder intact.
- Installer: `out/make/squirrel.windows/x64/HarnessSetup.exe` (153,832,960 bytes).
- Installer SHA-256: `0f8d76a05fe99fe22475813b12122fe510d88861c70741aa03858fbed721af85`.
- Executable SHA-256: `efd01ac3a348b9fb17f992a1627a0f3ec9646b60d100b73fbabf8693901d0b39`.
- Application archive SHA-256: `b11a0d24b12a94f6ec4ad471a830024bc2e2cca8b4be4a2333858fa54da0b21f`.
- The full installer package contains the identical application archive. All bundled renderer, main, preload and icon hashes match the build receipt.
- `build-installer.bat /s` completed successfully in 79.7 seconds. The installer is intentionally unsigned; Authenticode reports `NotSigned`.
- Installer generation and payload were verified. Installing or upgrading an existing installation was not exercised.

## Checks performed

| Check | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Passed | Integrated TypeScript sources |
| `tests/providers.test.ts` | 7 passed | SSE framing, endpoint rules, native request/replay shapes, tools, usage, credential-safe errors |
| `tests/runtime-store.test.ts` | 2 passed | Atomic persistence and import validation |
| `tests/tools-security.test.ts` | 4 passed | Workspace containment, changed-write denial, redaction and split credential protection |
| `npm test` | 13 passed, 0 failed | Local deterministic fixtures, no cloud accounts |
| Locked dependency audit | 0 known vulnerabilities reported | Installed dependency graph at build time |
| Packaged desktop interaction | Passed | Profile creation, local streaming, Markdown, cancellation, error retention, settings, regex and persistence |
| Native workspace flow | Passed | Real folder picker, tool opt-in, denied write left file absent, separately approved native write created expected fixture |
| Synthetic credential entry | Passed | Saved-key presence exposed without the key, then cleared through the UI; no real key used |
| Layout matrix | 48 captures/measures | 1264x785 and 860x600 CSS viewports; light/dark; English/Cantonese/bilingual; 1/1.25/1.5/2 emulated scale |
| Layout observations | Passed for sampled settings surface | No horizontal root overflow or displaced shell; small viewport history has 84px minimum height |
| Close during stream and reopen | Passed after repair | Partial assistant text persisted and appeared after a fresh launch |
| Public-content scan | Passed before integration | No private conversation terms in scanned source or commit text |

The matrix uses Chromium device-scale emulation, not physical operating-system DPI changes. It samples the settings surface and does not establish full accessibility or every-feature layout coverage. Independent source reviews covered credential handling, filesystem access, native approval, stream state and shutdown. They are not a comprehensive security certification.

Three original final-build images are checked in under `evidence/` and displayed in the README. Their inventory carries exact capture hashes and UTC capture times. The strict evidence validator accepted all three. Detailed launch, interaction, layout, transaction and privacy-review receipts, along with all 48 raw matrix images, remain in the ignored `.local/` diagnostic area. The layout repair was measured before and after against separately hashed builds: shell displacement changed from 174px to 0px.

## Provider coverage and limits

Five adapters implement OpenAI Responses, OpenAI-compatible Chat Completions, Anthropic Messages, Google Gemini and Azure OpenAI v1 chat. Seventeen presets include major hosted services and local Ollama/LM Studio endpoints. A custom profile supports another endpoint implementing one of those protocols. Account-specific model access, billing, tools and provider extensions require live verification; no paid or real-key calls were made.

Not implemented: Bedrock IAM, Vertex OAuth, arbitrary proprietary protocols, image/audio/file attachments, autonomous background scheduling, a hosted update feed, full localization, complete per-level copy variation, personal vocabulary import, school mode, complete settings search, bulk controls and the broader customization inventory. See `design/README.md` and `ROADMAP.md`. Material Designer's required authoring/export route was unavailable, so the design reference consists of checked-in tokens and a state inventory.

The four workspace tools are optional. File reads are constrained to the selected folder, but a separately approved shell command runs with the user's normal account permissions. Native confirmation is required for each write or command. There is no operating-system sandbox for approved commands.

## Source and external state

All three implementation branches were merged into local `main`. No remote is configured. The repository destination question has not been answered, so no source push, hosted release, wiki, project board, issue handoff or public site is claimed. The branches and linked checkouts remain retained because remote ancestry has not been established. No destructive cleanup was performed.

The provider and runtime checkouts are clean. The UI checkout retains one untracked, redundant provider catalog used for temporary type resolution; its intended UI changes are committed and merged. Build output, dependencies, isolated test profiles and scratch verification plans are ignored and uncommitted.

The shared Status Hub could not be authenticated from this task; no successful Hub publication is claimed. All owned hidden application processes were closed after verification, and the local fixture service was stopped.

## Next steps

1. Choose the remote repository destination, then publish and verify `main`.
2. Add a real provider profile through the application's protected password field and verify account-specific model access.
3. Exercise installation and updating on a disposable Windows account before distributing an installer publicly.
4. Implement remaining provider/authentication and product features as separately verified changes.
