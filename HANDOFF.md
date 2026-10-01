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

All three implementation branches were merged into `main`. The user selected the public repository `Ding-Ding-Projects/harness`. Source commit `892be4aaf6d1c6aed42f7a8fdc8870c7a4d8acd3` was pushed and independently matched by `git ls-remote`. No hosted installer release or update feed is claimed.

All three implementation tips are ancestors of published `main`. After the verified backup and remote ancestry checks, the provider and runtime linked checkouts and branches were removed. The UI checkout and its branch remain: it retains one untracked, redundant provider catalog used for temporary type resolution, whose SHA-256 matches the committed catalog in `main`. Build output, dependencies, isolated test profiles and scratch verification plans are ignored and retained.

## Requested website and preservation closeout

The user requested a product landing page, then explicitly stopped new implementation for a preservation and cleanup pass. No landing-page source, Sites registration, deployment or published product page was created. Relevant hosting and design workflows were inspected only. Resume the landing page as unfinished work; keep provider support protocol-based and do not invent an installer download URL.

A final timestamped 7-Zip backup in the owner's configured backup location was created and read back successfully on 2026-10-01 UTC before deletion. It includes the primary checkout, all three original linked checkouts, the untracked catalog copy, and the complete Git administrative directory. Integrity passed: 928,975 bytes, 598 entries, 280 Git administrative files. The archive excluded 48,272 ignored paths across the checkout inventories. Ignored builds and diagnostic output in the primary checkout were not deleted. The earlier 923,029-byte backup was also retained.

The [public screenshot gallery](https://ding-ding-projects.github.io/harness-gallery/) is published from the separate [evidence repository](https://github.com/Ding-Ding-Projects/harness-gallery). Anonymous requests returned HTTP 200 for the page, JSON manifest and all three PNGs; each PNG hash matched this repository's validated inventory. The gallery is a preservation deliverable, not completion of the requested product landing page or the remaining application feature inventory. A [delivery issue](https://github.com/Ding-Ding-Projects/harness/issues/1), [progress discussion](https://github.com/Ding-Ding-Projects/harness/discussions/2), and formally linked [project](https://github.com/orgs/Ding-Ding-Projects/projects/52) preserve the remaining work. The issue stays open and its project item stays In Progress. Wiki support was enabled, but its Git endpoint returned repository not found; no wiki publication is claimed.

The shared Status Hub could not be authenticated from this task; no successful Hub publication is claimed. All owned hidden application processes were closed after verification, and the local fixture service was stopped.

## Next steps

1. Build and publish the requested product landing page with genuine screenshots and truthful download status.
2. Add a real provider profile through the application's protected password field and verify account-specific model access.
3. Exercise installation and updating on a disposable Windows account before distributing an installer publicly.
4. Implement remaining provider/authentication and product features as separately verified changes.
