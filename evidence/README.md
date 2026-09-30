# Desktop evidence

The exact reviewed inventory is `inventory.json`.

| ID | Screen and state | Image |
| --- | --- | --- |
| `conversation-dark` | Completed local fixture response, dark theme, 1264x785, scale 1 | [Conversation](conversation-dark.png) |
| `settings-dark` | Saved appearance and model defaults, dark theme, 1264x785, scale 1 | [Settings](settings-dark.png) |
| `search-dark` | Bounded regular expression builder, dark theme, 1264x785, scale 1 | [Search](search-dark.png) |

All three images are unchanged PNG bytes captured from the packaged executable built from `c028c39eb07c55d84dcac937d438a05073d42c46`. They were inspected before and after staging, bound to the executable and source by versioned receipts, and accepted by the strict evidence validator. Capture times in the inventory come from the capture operation and are UTC.

The application was launched on an isolated hidden desktop, with a disposable profile and a local protocol fixture. No real provider key, private user file, unrelated desktop or cloud response appears in these images. An image proves the displayed state; the separate interaction and test results are described in `HANDOFF.md`. These images do not establish live-provider compatibility, installer execution or exhaustive accessibility compliance.
