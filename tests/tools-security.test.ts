import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  contained,
  executeTool,
  redact,
  StreamRedactor,
  assertNoSecret,
} from "../src/main/tools";
test("workspace rejects traversal, symlinks, hardlinks and Windows aliases", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-tools-"));
  try {
    const root = path.join(dir, "workspace");
    await fs.mkdir(root);
    const outside = path.join(dir, "outside");
    await fs.writeFile(outside, "fixture");
    await fs.link(outside, path.join(root, "linked"));
    for (const value of [
      "../outside",
      "linked",
      ".env::$DATA",
      "CON",
      "file.",
      "file ",
    ])
      await assert.rejects(contained(root, value, true));
    await assert.rejects(
      executeTool(
        {
          id: "1",
          name: "write_file",
          arguments: JSON.stringify({ path: "linked", content: "changed" }),
        },
        root,
        new AbortController().signal,
        async () => true,
      ),
    );
    assert.equal(await fs.readFile(outside, "utf8"), "fixture");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("write defaults to denial and rejects changed preview", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harness-write-"));
  try {
    await fs.writeFile(path.join(root, "a.txt"), "before");
    const call = {
      id: "1",
      name: "write_file",
      arguments: JSON.stringify({ path: "a.txt", content: "after" }),
    };
    assert.equal(
      await executeTool(
        call,
        root,
        new AbortController().signal,
        async () => false,
      ),
      "Write denied",
    );
    assert.equal(await fs.readFile(path.join(root, "a.txt"), "utf8"), "before");
    await assert.rejects(
      executeTool(call, root, new AbortController().signal, async () => {
        await fs.writeFile(path.join(root, "a.txt"), "other");
        return true;
      }),
    );
    assert.equal(await fs.readFile(path.join(root, "a.txt"), "utf8"), "other");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("public tool output redacts known and recognizable credentials", () => {
  assert.equal(
    redact("fixture-key api_key=secret", ["fixture-key"]),
    "[REDACTED] api_key=[REDACTED]",
  );
});

test("stream redaction blocks credentials split across chunks and opaque metadata", () => {
  const secret = "synthetic-secret-123";
  const redactor = new StreamRedactor([secret]);
  const output =
    redactor.push("start synthetic-") +
    redactor.push("secret-123 finish") +
    redactor.flush();
  assert.equal(output, "start [REDACTED] finish");
  assert.equal(output.includes(secret), false);
  const aborted = new StreamRedactor([secret]);
  assert.equal(aborted.push("synthetic-") + aborted.flush(), "[REDACTED]");
  assert.throws(() =>
    assertNoSecret({ nested: { signature: secret } }, [secret]),
  );
  const escapedSecret = 'synthetic-"-credential';
  assert.throws(() =>
    assertNoSecret({ nested: { value: escapedSecret } }, [escapedSecret]),
  );
  assert.throws(() =>
    assertNoSecret({ [escapedSecret]: "value" }, [escapedSecret]),
  );
  assert.doesNotThrow(() =>
    assertNoSecret({ signature: "unrelated opaque value" }, [secret]),
  );
});
