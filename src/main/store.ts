import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppState,
  Settings,
  Conversation,
  ProviderProfile,
} from "../shared/types";
export const defaults: Settings = {
  theme: "system",
  language: "en",
  systemPrompt: "You are a helpful assistant.",
  temperature: 0.7,
  maxTokens: 4096,
  toolsEnabled: false,
  fontSize: 16,
  reducedMotion: false,
  englishFunnyLevel: 5,
  cantoneseFunnyLevel: 5,
  showEmojis: true,
};
export function text(value: unknown, max = 10000): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0"))
    throw new Error("Invalid text");
  return value;
}
export function settings(value: unknown): Settings {
  const v = value as Settings;
  if (
    !v ||
    !["system", "light", "dark"].includes(v.theme) ||
    !["en", "zh-HK", "bilingual"].includes(v.language) ||
    typeof v.toolsEnabled !== "boolean" ||
    typeof v.reducedMotion !== "boolean" ||
    typeof v.showEmojis !== "boolean"
  )
    throw new Error("Invalid settings");
  text(v.systemPrompt, 32000);
  for (const [key, min, max] of [
    ["temperature", 0, 2],
    ["maxTokens", 1, 65536],
    ["fontSize", 12, 32],
    ["englishFunnyLevel", 1, 5],
    ["cantoneseFunnyLevel", 1, 5],
  ] as const)
    if (!Number.isFinite(v[key]) || v[key] < min || v[key] > max)
      throw new Error("Invalid settings");
  return Object.fromEntries(
    Object.keys(defaults).map((k) => [k, v[k as keyof Settings]]),
  ) as unknown as Settings;
}
export function profile(value: unknown): ProviderProfile {
  const v = value as ProviderProfile;
  if (
    !v ||
    ![
      "openai-chat",
      "openai-responses",
      "anthropic",
      "gemini",
      "azure-openai",
    ].includes(v.protocol)
  )
    throw new Error("Invalid provider");
  const url = new URL(text(v.baseUrl, 2048));
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error("Provider URL must use HTTPS or loopback HTTP");
  return {
    id: text(v.id, 100) || randomUUID(),
    name: text(v.name, 200),
    protocol: v.protocol,
    baseUrl: url.href,
    model: text(v.model, 200),
    ...(v.apiVersion ? { apiVersion: text(v.apiVersion, 100) } : {}),
  };
}
export function imported(value: unknown): Conversation {
  const v = value as Conversation;
  if (!v || !Array.isArray(v.messages) || v.messages.length > 10000)
    throw new Error("Invalid conversation");
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: text(v.title, 200),
    profileId: "",
    createdAt: now,
    updatedAt: now,
    messages: v.messages.map((m) => {
      if (!["user", "assistant", "system"].includes(m.role))
        throw new Error("Imported tools are not trusted");
      return {
        id: randomUUID(),
        role: m.role,
        content: text(m.content, 1000000),
        createdAt: now,
      };
    }),
  };
}
export class Store {
  state: AppState = {
    profiles: [],
    conversations: [],
    settings: { ...defaults },
    workspace: null,
    vaultAvailable: false,
    version: "0.1.0",
  };
  keys: Record<string, string> = {};
  private queue = Promise.resolve();
  constructor(readonly root: string) {}
  async load() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const raw = await fs.readFile(path.join(this.root, "state.json"), "utf8");
      if (raw.length > 20000000) throw new Error("State too large");
      const v = JSON.parse(raw);
      if (
        !v ||
        !Array.isArray(v.profiles) ||
        v.profiles.length > 100 ||
        !Array.isArray(v.conversations) ||
        v.conversations.length > 1000
      )
        throw new Error("Invalid state");
      this.state.settings = settings(v.settings);
      this.state.profiles = v.profiles.map(profile);
      this.state.conversations = v.conversations.map((c: Conversation) => {
        if (!Array.isArray(c.messages) || c.messages.length > 10000)
          throw new Error("Invalid history");
        const messages = c.messages.map((m) => {
          if (!["system", "user", "assistant", "tool"].includes(m.role))
            throw new Error("Invalid role");
          const clean: import("../shared/types").ChatMessage = {
            id: text(m.id, 100),
            role: m.role,
            content: text(m.content, 1000000),
            createdAt: text(m.createdAt, 100),
          };
          if (m.toolCallId) clean.toolCallId = text(m.toolCallId, 200);
          if (m.name) clean.name = text(m.name, 200);
          if (m.toolCalls) {
            if (!Array.isArray(m.toolCalls) || m.toolCalls.length > 20)
              throw new Error("Invalid calls");
            clean.toolCalls = m.toolCalls.map((call) => ({
              id: text(call.id, 200),
              name: text(call.name, 200),
              arguments: text(call.arguments, 200000),
            }));
          }
          if (m.continuation) {
            if (
              !Array.isArray(m.continuation.items) ||
              JSON.stringify(m.continuation).length > 1000000
            )
              throw new Error("Invalid continuation");
            clean.continuation = m.continuation;
          }
          return clean;
        });
        return {
          id: text(c.id, 100),
          title: text(c.title, 200),
          profileId: text(c.profileId, 100),
          createdAt: text(c.createdAt, 100),
          updatedAt: text(c.updatedAt, 100),
          messages,
          ...(c.usage ? { usage: c.usage } : {}),
        };
      });
      this.state.workspace =
        typeof v.workspace === "string" ? text(v.workspace, 4000) : null;
      if (
        !v.keys ||
        typeof v.keys !== "object" ||
        Array.isArray(v.keys) ||
        Object.keys(v.keys).length > 100
      )
        throw new Error("Invalid vault");
      this.keys = Object.fromEntries(
        Object.entries(v.keys).map(([k, value]) => [
          text(k, 100),
          text(value, 100000),
        ]),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Stored state is invalid. Preserve state.json and restore a valid backup.",
        );
    }
  }
  save() {
    const snapshot = JSON.stringify({ ...this.state, keys: this.keys });
    if (snapshot.length > 20000000)
      return Promise.reject(new Error("State capacity exceeded"));
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const temp = path.join(this.root, `state.${randomUUID()}.tmp`);
        await fs.writeFile(temp, snapshot, { mode: 0o600 });
        for (let attempt = 0; ; attempt++) {
          try {
            await fs.rename(temp, path.join(this.root, "state.json"));
            break;
          } catch (e) {
            if (
              attempt >= 3 ||
              !["EPERM", "EACCES", "EBUSY"].includes(
                (e as NodeJS.ErrnoException).code || "",
              )
            )
              throw e;
            await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          }
        }
      });
    return this.queue;
  }
}
