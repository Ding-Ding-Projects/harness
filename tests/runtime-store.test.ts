import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, defaults, imported, settings } from "../src/main/store";
test("atomic state survives restart with trusted tool history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harness-store-"));
  try {
    const store = new Store(root);
    await store.load();
    store.state.conversations.push({
      id: "c",
      title: "fixture",
      profileId: "p",
      createdAt: "now",
      updatedAt: "now",
      messages: [
        {
          id: "m",
          role: "assistant",
          content: "",
          createdAt: "now",
          toolCalls: [{ id: "t", name: "read_file", arguments: "{}" }],
          continuation: {
            protocol: "openai-responses",
            items: [{ id: "reasoning-fixture" }],
          },
        },
        {
          id: "r",
          role: "tool",
          content: "public result",
          toolCallId: "t",
          createdAt: "now",
        },
      ],
    });
    await store.save();
    const loaded = new Store(root);
    await loaded.load();
    assert.equal(loaded.state.conversations[0].messages[1].toolCallId, "t");
    assert.equal(
      loaded.state.conversations[0].messages[0].continuation?.items.length,
      1,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("external import rejects replayed tool entries and settings strip extra fields", () => {
  assert.throws(() =>
    imported({ title: "fixture", messages: [{ role: "tool", content: "x" }] }),
  );
  const clean = settings({ ...defaults, apiKey: "fixture" });
  assert.equal("apiKey" in clean, false);
  assert.throws(() => settings({ ...defaults, fontSize: NaN }));
});
