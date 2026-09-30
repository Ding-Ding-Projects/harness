import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  shell,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Store, profile, settings, text, imported } from "./store";
import {
  executeTool,
  definitions,
  StreamRedactor,
  assertNoSecret,
} from "./tools";
import { streamProvider, listModels } from "../providers/index";
import type {
  RunEvent,
  Conversation,
  SendRequest,
  ToolCall,
} from "../shared/types";
let win: BrowserWindow;
let store: Store;
const runs = new Map<string, AbortController>();
const tasks = new Map<string, Promise<void>>();
let closing = false;
let closeReady = false;
let builtAt: string | undefined;
async function finishAndQuit() {
  if (closing) return;
  closing = true;
  for (const [id, controller] of runs) {
    controller.abort();
    deny(id);
  }
  try {
    await Promise.allSettled([...tasks.values()]);
    await store.save();
    closeReady = true;
    app.quit();
  } catch {
    closing = false;
    if (win && !win.isDestroyed())
      await dialog.showMessageBox(win, {
        type: "error",
        message: "Conversation could not be saved",
        detail:
          "The window will remain open. Export your conversation before trying to close again.",
      });
  }
}
const pending = new Map<
  string,
  {
    runId: string;
    summary: string;
    detail: string;
    confirming?: boolean;
    resolve: (allow: boolean) => void;
  }
>();
const emit = (event: RunEvent) => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
    win.webContents.send("harness:event", event);
};
const conversation = (id: unknown) => {
  const c = store.state.conversations.find((c) => c.id === text(id, 100));
  if (!c) throw new Error("Conversation not found");
  return c;
};
const getProfile = (id: unknown) => {
  const p = store.state.profiles.find((p) => p.id === text(id, 100));
  if (!p) throw new Error("Provider not found");
  return p;
};
function key(id: string) {
  if (!store.keys[id]) return "";
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("OS credential protection is unavailable");
  return safeStorage.decryptString(Buffer.from(store.keys[id], "base64"));
}
function deny(runId: string) {
  for (const [id, p] of pending)
    if (p.runId === runId) {
      pending.delete(id);
      p.resolve(false);
    }
}
async function run(
  runId: string,
  c: Conversation,
  profileId: string,
  controller: AbortController,
) {
  const signal = controller.signal;
  const runSettings = { ...store.state.settings };
  const workspace = store.state.workspace;
  emit({ type: "started", runId, conversationId: c.id });
  let flushPartial: (() => void) | undefined;
  try {
    const p = getProfile(profileId),
      secret = key(p.id);
    for (let round = 0; round < 8; round++) {
      if (signal.aborted) break;
      const assistant = {
        id: randomUUID(),
        role: "assistant" as const,
        content: "",
        createdAt: new Date().toISOString(),
        toolCalls: [] as ToolCall[],
        continuation: undefined as
          import("../shared/types").ProviderContinuation | undefined,
      };
      c.messages.push(assistant);
      emit({
        type: "assistant",
        runId,
        conversationId: c.id,
        messageId: assistant.id,
        conversation: c,
      });
      const redactor = new StreamRedactor([secret]);
      let savedAt = 0;
      flushPartial = () => {
        const tail = redactor.flush();
        assistant.content += tail;
        if (tail)
          emit({ type: "text", runId, conversationId: c.id, text: tail });
      };
      for await (const event of streamProvider({
        profile: p,
        apiKey: secret,
        messages: c.messages.slice(0, -1),
        systemPrompt: runSettings.systemPrompt,
        temperature: runSettings.temperature,
        maxTokens: runSettings.maxTokens,
        tools: runSettings.toolsEnabled && workspace ? definitions : undefined,
        signal,
      })) {
        if (signal.aborted) break;
        if (event.type === "text") {
          const chunk = redactor.push(event.text);
          assistant.content += chunk;
          emit({ type: "text", runId, conversationId: c.id, text: chunk });
          if (Date.now() - savedAt > 750) {
            await store.save();
            savedAt = Date.now();
          }
        } else if (event.type === "tool-call") {
          if (
            event.call.arguments.length > 200000 ||
            assistant.toolCalls.length >= 20
          )
            throw new Error("Tool limit exceeded");
          assertNoSecret(event.call, [secret]);
          assertNoSecret(JSON.parse(event.call.arguments), [secret]);
          assistant.toolCalls.push(event.call);
        } else if (event.type === "continuation") {
          if (JSON.stringify(event.continuation).length > 1000000)
            throw new Error("Continuation too large");
          assertNoSecret(event.continuation, [secret]);
          assistant.continuation = event.continuation;
        } else if (event.type === "usage") {
          const u = c.usage || { inputTokens: 0, outputTokens: 0 };
          c.usage = {
            inputTokens: u.inputTokens + event.usage.inputTokens,
            outputTokens: u.outputTokens + event.usage.outputTokens,
          };
        }
      }
      flushPartial();
      flushPartial = undefined;
      c.updatedAt = new Date().toISOString();
      await store.save();
      if (signal.aborted) {
        delete (assistant as { toolCalls?: ToolCall[] }).toolCalls;
        delete assistant.continuation;
        await store.save();
        break;
      }
      if (!assistant.toolCalls.length) break;
      for (const call of assistant.toolCalls) {
        let content = "Tools are disabled";
        if (runSettings.toolsEnabled && workspace) {
          try {
            content = await executeTool(
              call,
              workspace,
              signal,
              (summary, detail) =>
                new Promise<boolean>((resolve) => {
                  const id = randomUUID();
                  const timeout = setTimeout(() => {
                    pending.delete(id);
                    resolve(false);
                  }, 60000);
                  pending.set(id, {
                    runId,
                    summary,
                    detail,
                    resolve: (allow) => {
                      clearTimeout(timeout);
                      resolve(allow && !signal.aborted);
                    },
                  });
                  emit({
                    type: "approval",
                    runId,
                    conversationId: c.id,
                    approval: { id, runId, tool: call.name, summary, detail },
                  });
                }),
              [secret],
            );
          } catch {
            content = signal.aborted
              ? "Tool cancelled"
              : "Tool could not complete safely";
          }
        }
        c.messages.push({
          id: randomUUID(),
          role: "tool",
          content,
          toolCallId: call.id,
          name: call.name,
          createdAt: new Date().toISOString(),
        });
        await store.save();
      }
      if (round === 7)
        emit({
          type: "status",
          runId,
          conversationId: c.id,
          message: "Stopped at the eight-round tool limit.",
        });
    }
  } catch (e) {
    flushPartial?.();
    flushPartial = undefined;
    const last = c.messages.at(-1);
    if (last?.role === "assistant") {
      delete last.toolCalls;
      delete last.continuation;
    }
    const message = (e as Error).message;
    const safe =
      /^(Provider|Request cancelled)/.test(message) &&
      message.length < 300 &&
      !/[\r\n]/.test(message)
        ? message
        : "The provider request could not complete. Check the endpoint, model and protected credential.";
    if (!signal.aborted)
      emit({ type: "error", runId, conversationId: c.id, message: safe });
  } finally {
    deny(runId);
    runs.delete(runId);
    await store.save();
    emit({
      type: "done",
      runId,
      conversationId: c.id,
      conversation: c,
      cancelled: signal.aborted,
    });
  }
}
function register() {
  const handlers: Record<string, (...args: any[]) => any> = {
    bootstrap: () => ({
      ...store.state,
      profiles: store.state.profiles.map((p) => ({
        ...p,
        hasKey: !!store.keys[p.id],
      })),
      vaultAvailable: safeStorage.isEncryptionAvailable(),
      version: app.getVersion(),
      builtAt,
    }),
    saveProfile: async (v, apiKey) => {
      const p = profile(v),
        old = store.state.profiles.find((x) => x.id === p.id);
      if (old && new URL(old.baseUrl).origin !== new URL(p.baseUrl).origin)
        delete store.keys[p.id];
      if (apiKey !== undefined) {
        const k = text(apiKey, 16000);
        if (k) {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error("OS credential protection is unavailable");
          store.keys[p.id] = safeStorage.encryptString(k).toString("base64");
        } else delete store.keys[p.id];
      }
      store.state.profiles = store.state.profiles
        .filter((x) => x.id !== p.id)
        .concat(p);
      await store.save();
      return { ...p, hasKey: !!store.keys[p.id] };
    },
    removeProfile: async (id) => {
      getProfile(id);
      delete store.keys[id];
      store.state.profiles = store.state.profiles.filter((p) => p.id !== id);
      await store.save();
    },
    clearKey: async (id) => {
      getProfile(id);
      delete store.keys[id];
      await store.save();
    },
    listModels: async (id) => {
      const p = getProfile(id);
      try {
        return await listModels(p, key(p.id), AbortSignal.timeout(30000));
      } catch {
        throw new Error("Model discovery failed");
      }
    },
    createConversation: async (id) => {
      getProfile(id);
      const now = new Date().toISOString();
      const c: Conversation = {
        id: randomUUID(),
        title: "New conversation",
        profileId: id,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      store.state.conversations.unshift(c);
      await store.save();
      return c;
    },
    renameConversation: async (id, title) => {
      conversation(id).title = text(title, 200);
      await store.save();
    },
    deleteConversation: async (id) => {
      const c = conversation(id);
      if ([...runs.keys()].some((r) => r.startsWith(c.id + ":")))
        throw new Error("Cancel the running request first");
      store.state.conversations = store.state.conversations.filter(
        (x) => x.id !== c.id,
      );
      await store.save();
    },
    saveSettings: async (v) => {
      const s = settings(v);
      if (s.toolsEnabled && !store.state.settings.toolsEnabled) {
        const choice = await dialog.showMessageBox(win, {
          type: "warning",
          buttons: ["Keep disabled", "Enable workspace tools"],
          defaultId: 0,
          cancelId: 0,
          message: "Enable AI workspace tools?",
          detail:
            "Read tools can access non-secret files in your selected workspace. Every write and shell command needs a separate explicit approval. Shell commands can access files outside the workspace. Review each command carefully.",
        });
        if (choice.response !== 1) s.toolsEnabled = false;
      }
      store.state.settings = s;
      await store.save();
      return s;
    },
    send: async (v: SendRequest) => {
      if (closing) throw new Error("Application is closing");
      const c = conversation(v?.conversationId);
      getProfile(v.profileId);
      if (c.messages.length && c.profileId !== v.profileId)
        throw new Error(
          "Create a new conversation to switch providers after messages have been sent.",
        );
      const content = text(v.text, 100000);
      if (!content.trim()) throw new Error("Message is empty");
      if ([...runs.keys()].some((r) => r.startsWith(c.id + ":")))
        throw new Error("Conversation already running");
      const runId = c.id + ":" + randomUUID(),
        controller = new AbortController();
      runs.set(runId, controller);
      c.profileId = v.profileId;
      c.messages.push({
        id: randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      });
      try {
        await store.save();
      } catch (e) {
        runs.delete(runId);
        c.messages.pop();
        throw e;
      }
      const task = new Promise<void>((resolve) => setTimeout(resolve, 25))
        .then(() => run(runId, c, v.profileId, controller))
        .catch(() => {
          runs.delete(runId);
          deny(runId);
          emit({
            type: "error",
            runId,
            conversationId: c.id,
            message:
              "Local state could not be saved. Export this conversation before closing.",
          });
        })
        .finally(() => {
          tasks.delete(runId);
        });
      tasks.set(runId, task);
      return { runId };
    },
    cancel: async (id) => {
      text(id, 200);
      runs.get(id)?.abort();
      deny(id);
    },
    approve: async (id, allow) => {
      text(id, 100);
      if (typeof allow !== "boolean") throw new Error("Invalid approval");
      const p = pending.get(id);
      if (!p || p.confirming) return;
      if (!allow) {
        pending.delete(id);
        p.resolve(false);
        return;
      }
      p.confirming = true;
      const choice = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["Deny", "Allow this exact action"],
        defaultId: 0,
        cancelId: 0,
        message: p.summary,
        detail: p.detail,
      });
      if (pending.get(id) !== p) return;
      pending.delete(id);
      p.resolve(choice.response === 1 && !runs.get(p.runId)?.signal.aborted);
    },
    selectWorkspace: async () => {
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
      });
      if (result.canceled) return null;
      store.state.workspace = await fs.realpath(result.filePaths[0]);
      await store.save();
      return store.state.workspace;
    },
    clearWorkspace: async () => {
      store.state.workspace = null;
      await store.save();
    },
    exportConversation: async (id, format) => {
      const c = conversation(id);
      if (!["json", "markdown"].includes(format))
        throw new Error("Invalid format");
      const clean = {
        title: c.title,
        messages: c.messages
          .filter((m) => m.role !== "tool")
          .map((m) => ({
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
      };
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `conversation.${format === "json" ? "json" : "md"}`,
        filters: [
          { name: format, extensions: [format === "json" ? "json" : "md"] },
        ],
      });
      if (result.canceled || !result.filePath) return false;
      await fs.writeFile(
        result.filePath,
        format === "json"
          ? JSON.stringify(clean, null, 2)
          : `# ${c.title}\n\n` +
              clean.messages
                .map((m) => `## ${m.role}\n\n${m.content}`)
                .join("\n\n"),
      );
      return true;
    },
    importConversation: async () => {
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [{ name: "Conversation JSON", extensions: ["json"] }],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > 10000000)
        throw new Error("Import too large");
      const c = imported(JSON.parse(await fs.readFile(file, "utf8")));
      c.profileId = store.state.profiles[0]?.id || "";
      store.state.conversations.unshift(c);
      await store.save();
      return c;
    },
  };
  for (const [name, handler] of Object.entries(handlers))
    ipcMain.handle(`harness:${name}`, async (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw new Error("Untrusted IPC sender");
      try {
        return await handler(...args);
      } catch (e) {
        throw new Error(
          (e as Error).message.startsWith("OS credential") ||
            (e as Error).message.startsWith("Create a new conversation")
            ? (e as Error).message
            : "The operation could not complete safely.",
        );
      }
    });
}
const squirrel = process.argv.find((a) =>
  /^--squirrel-(install|updated|uninstall|obsolete)$/.test(a),
);
if (squirrel) {
  if (squirrel === "--squirrel-obsolete") app.quit();
  else {
    const update = path.resolve(
      path.dirname(process.execPath),
      "..",
      "Update.exe",
    );
    const flag =
      squirrel === "--squirrel-uninstall"
        ? "--removeShortcut"
        : "--createShortcut";
    const child = spawn(update, [flag, path.basename(process.execPath)], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("close", () => app.quit());
    child.on("error", () => app.quit());
    setTimeout(() => app.quit(), 5000);
  }
} else {
  app.setName("Harness");
  if (process.env.HARNESS_DATA_DIR)
    app.setPath("userData", path.resolve(process.env.HARNESS_DATA_DIR));
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app
      .whenReady()
      .then(async () => {
        store = new Store(
          process.env.HARNESS_DATA_DIR || app.getPath("userData"),
        );
        await store.load();
        try {
          const receipt = JSON.parse(
            await fs.readFile(
              path.join(__dirname, "build-receipt.json"),
              "utf8",
            ),
          );
          if (
            typeof receipt.builtAt === "string" &&
            Number.isFinite(Date.parse(receipt.builtAt))
          )
            builtAt = receipt.builtAt;
        } catch {
          /* Development mode has no packaged build receipt. */
        }
        win = new BrowserWindow({
          width: 1280,
          height: 850,
          minWidth: 860,
          minHeight: 600,
          title: "Harness",
          icon: path.join(app.getAppPath(), "assets/icon.png"),
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
          },
        });
        const frameSize = win.getSize(),
          clientSize = win.getContentSize();
        win.setMinimumSize(
          860 + frameSize[0] - clientSize[0],
          600 + frameSize[1] - clientSize[1],
        );
        win.webContents.setWindowOpenHandler(({ url }) => {
          try {
            const target = new URL(url);
            if (
              ["https:", "http:"].includes(target.protocol) &&
              !target.username &&
              !target.password
            )
              void shell.openExternal(target.href).catch(() => {});
          } catch {}
          return { action: "deny" };
        });
        win.webContents.on("will-navigate", (event) => event.preventDefault());
        win.webContents.session.setPermissionRequestHandler(
          (_wc, _permission, callback) => callback(false),
        );
        const devUrl = process.env.HARNESS_DEV_URL;
        const devOrigin = devUrl ? new URL(devUrl) : null;
        if (
          devOrigin &&
          (devOrigin.protocol !== "http:" ||
            !["127.0.0.1", "localhost", "[::1]"].includes(devOrigin.hostname))
        )
          throw new Error("Invalid development URL");
        win.webContents.session.webRequest.onHeadersReceived(
          (details, callback) =>
            callback({
              responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                  devOrigin
                    ? `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://${devOrigin.host}; object-src 'none'; frame-src 'none'`
                    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
                ],
              },
            }),
        );
        register();
        app.on("before-quit", (event) => {
          if (closeReady) return;
          event.preventDefault();
          void finishAndQuit();
        });
        win.on("close", (event) => {
          if (closeReady) return;
          event.preventDefault();
          void finishAndQuit();
        });
        const dev = process.env.HARNESS_DEV_URL;
        if (dev) {
          const url = new URL(dev);
          if (
            url.protocol !== "http:" ||
            !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
          )
            throw new Error("Invalid development URL");
          await win.loadURL(url.href);
        } else await win.loadFile(path.join(__dirname, "renderer/index.html"));
        win.on("closed", () => {
          for (const [id, c] of runs) {
            c.abort();
            deny(id);
          }
        });
      })
      .catch(() => {
        dialog.showErrorBox(
          "Harness could not start",
          "Local state or startup configuration is invalid. Preserve the data folder before restoring a backup.",
        );
        app.quit();
      });
    app.on("window-all-closed", () => {
      if (closeReady) app.quit();
      else void finishAndQuit();
    });
    app.on("second-instance", () => {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
  }
}
