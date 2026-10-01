# Source publication and distribution

The source is public at [Ding-Ding-Projects/harness](https://github.com/Ding-Ding-Projects/harness), with `main` as the default branch. Public source availability does not mean a hosted installer release, live provider verification, or complete product website exists.

## Desktop build

Run `build.bat --run` from a Windows x64 checkout, or `build-installer.bat /s` to generate the supported Squirrel.Windows installer. The build scripts acquire pinned prerequisites as documented in the root README. No API key is needed to build. Enter provider credentials only through the installed application's protected settings.

The packaged build bound to `c028c39eb07c55d84dcac937d438a05073d42c46` was exercised with local fixtures. Its installer payload was inspected, but installation and update execution were not tested. The installer remains unsigned. See [the handoff](../../HANDOFF.md) for exact hashes and verification limits.

## Public evidence and unfinished website

Three original captures are tracked in `evidence/` with source revision, executable hash, capture hash and validated UTC time. The [public evidence gallery](https://ding-ding-projects.github.io/harness-gallery/) preserves those reviewed images. Anonymous HTTP requests verified the page, manifest and every PNG; image bytes matched the original hashes. A screenshot records one exercised state, not every provider, account, model or feature. The gallery's runtime layout and broader feature conformance remain unverified.

The requested product landing page was paused before source authoring when the user requested preservation. It has no deployment or download link. Resume it as a separate implementation step, using the real captures and the documented compatibility limits.

## Handoff and failure modes

- [Delivery issue](https://github.com/Ding-Ding-Projects/harness/issues/1): open remaining work and evidence.
- [Progress discussion](https://github.com/Ding-Ding-Projects/harness/discussions/2): source and closeout status.
- Wiki initialization is unavailable through its current Git endpoint. No content was published there.
- No workflow, release, hosted update feed or continuous integration result is implied by a source push.

This category has no hosted application API. A Postman collection is not applicable; provider integration tests use isolated local fixtures.
