import type {
  ProviderRequest,
  ProviderProfile,
  ProviderEvent,
  ChatMessage,
  ToolCall,
} from "../shared/types";
import { readSSE } from "./sse";
export function endpoint(base: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("Invalid provider endpoint.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(host))
    )
  )
    throw new Error(
      "Provider endpoint must use HTTPS or local loopback HTTP without credentials, query, or fragment.",
    );
  url.pathname =
    url.pathname.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
  return url;
}
const headers = (p: ProviderProfile, key: string) => ({
  "Content-Type": "application/json",
  ...(p.protocol === "anthropic"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
    : p.protocol === "gemini"
      ? { "x-goog-api-key": key }
      : p.protocol === "azure-openai"
        ? { "api-key": key }
        : key
          ? { Authorization: `Bearer ${key}` }
          : {}),
});
const replay = (m: ChatMessage, p: ProviderProfile) =>
  m.continuation?.protocol === p.protocol ? m.continuation.items : undefined;
function body(r: ProviderRequest): Record<string, unknown> {
  const p = r.profile;
  const tools = r.tools ?? [];
  const system = [
    r.systemPrompt,
    ...r.messages.filter((m) => m.role === "system").map((m) => m.content),
  ]
    .filter(Boolean)
    .join("\n");
  const msgs = r.messages.filter((m) => m.role !== "system");
  const common = { model: p.model, stream: true };
  if (p.protocol === "openai-responses") {
    return {
      ...common,
      store: false,
      include: ["reasoning.encrypted_content"],
      instructions: system || undefined,
      max_output_tokens: r.maxTokens,
      tools: tools.map((t) => ({ type: "function", ...t, strict: false })),
      input: msgs.flatMap(
        (m) =>
          replay(m, p) ??
          (m.role === "tool"
            ? [
                {
                  type: "function_call_output",
                  call_id: m.toolCallId,
                  output: m.content,
                },
              ]
            : m.role === "assistant" && m.toolCalls?.length
              ? [
                  ...(m.content ? [{ role: m.role, content: m.content }] : []),
                  ...m.toolCalls.map((t) => ({
                    type: "function_call",
                    call_id: t.id,
                    name: t.name,
                    arguments: t.arguments,
                  })),
                ]
              : [{ role: m.role, content: m.content }]),
      ),
    };
  }
  if (p.protocol === "anthropic")
    return {
      ...common,
      system: system || undefined,
      max_tokens: r.maxTokens ?? 4096,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      messages: msgs.map((m) => ({
        role: m.role === "tool" ? "user" : m.role,
        content:
          replay(m, p) ??
          (m.role === "tool"
            ? [
                {
                  type: "tool_result",
                  tool_use_id: m.toolCallId,
                  content: m.content,
                },
              ]
            : m.role === "assistant" && m.toolCalls?.length
              ? [
                  ...(m.content ? [{ type: "text", text: m.content }] : []),
                  ...m.toolCalls.map((t) => ({
                    type: "tool_use",
                    id: t.id,
                    name: t.name,
                    input: JSON.parse(t.arguments),
                  })),
                ]
              : m.content),
      })),
    };
  if (p.protocol === "gemini")
    return {
      contents: msgs.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts:
          replay(m, p) ??
          (m.role === "tool"
            ? [
                {
                  functionResponse: {
                    name:
                      m.name ??
                      msgs
                        .flatMap((x) => x.toolCalls ?? [])
                        .find((t) => t.id === m.toolCallId)?.name ??
                      "tool",
                    response: { result: m.content },
                  },
                },
              ]
            : m.role === "assistant" && m.toolCalls?.length
              ? [
                  ...(m.content ? [{ text: m.content }] : []),
                  ...m.toolCalls.map((t) => ({
                    functionCall: {
                      name: t.name,
                      args: JSON.parse(t.arguments),
                    },
                  })),
                ]
              : [{ text: m.content }]),
      })),
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        maxOutputTokens: r.maxTokens,
        temperature: r.temperature,
      },
      tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
    };
  const nativeChat =
    p.protocol === "azure-openai" ||
    new URL(p.baseUrl).hostname === "api.openai.com";
  return {
    ...common,
    ...(nativeChat
      ? {
          max_completion_tokens: r.maxTokens,
          stream_options: { include_usage: true },
        }
      : { max_tokens: r.maxTokens }),
    ...(!/^(o1|o3|o4|gpt-5|gpt-6)/i.test(p.model)
      ? { temperature: r.temperature }
      : {}),
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...msgs.map((m) => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.toolCallId,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((t) => ({
                id: t.id,
                type: "function",
                function: { name: t.name, arguments: t.arguments },
              })),
            }
          : {}),
      })),
    ],
    tools: tools.length
      ? tools.map((t) => ({ type: "function", function: t }))
      : undefined,
  };
}
export async function* streamProvider(
  r: ProviderRequest,
): AsyncGenerator<ProviderEvent> {
  const p = r.profile;
  const combined = AbortSignal.any([r.signal, AbortSignal.timeout(180000)]);
  const path =
    p.protocol === "gemini"
      ? `models/${encodeURIComponent(p.model.replace(/^models\//, ""))}:streamGenerateContent`
      : p.protocol === "anthropic"
        ? "messages"
        : p.protocol === "openai-responses"
          ? "responses"
          : "chat/completions";
  const url = endpoint(p.baseUrl, path);
  if (p.protocol === "gemini") url.searchParams.set("alt", "sse");
  if (p.protocol === "azure-openai" && p.apiVersion)
    url.searchParams.set("api-version", p.apiVersion);
  const calls = new Map<string, ToolCall>();
  let items: any[] = [],
    done = false;
  let input = 0,
    output = 0;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers(p, r.apiKey),
      body: JSON.stringify(body(r)),
      signal: combined,
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Provider request failed (HTTP ${response.status}).`);
    if (!response.body) throw new Error("Provider returned no stream.");
    for await (const frame of readSSE(response.body, combined)) {
      if (frame.data === "[DONE]") {
        done = true;
        break;
      }
      let v: any;
      try {
        v = JSON.parse(frame.data);
      } catch {
        throw new Error("Provider returned malformed stream data.");
      }
      if (
        v.error ||
        v.type === "error" ||
        ["response.failed", "response.incomplete"].includes(v.type)
      )
        throw new Error("Provider could not complete the request.");
      if (p.protocol === "openai-responses") {
        if (v.type === "response.output_text.delta")
          yield { type: "text", text: v.delta };
        if (v.type === "response.completed") {
          items = v.response?.output ?? [];
          done = true;
          const u = v.response?.usage;
          input = u?.input_tokens ?? 0;
          output = u?.output_tokens ?? 0;
          for (const item of items)
            if (item.type === "function_call")
              calls.set(item.call_id, {
                id: item.call_id,
                name: item.name,
                arguments: item.arguments,
              });
        }
      } else if (p.protocol === "anthropic") {
        if (v.type === "message_start")
          input = v.message?.usage?.input_tokens ?? 0;
        if (v.type === "content_block_start")
          items[v.index] = { ...v.content_block };
        if (v.type === "content_block_delta") {
          const item = items[v.index];
          if (!item)
            throw new Error("Provider returned an invalid content sequence.");
          const d = v.delta;
          if (d.type === "text_delta") {
            item.text = (item.text ?? "") + d.text;
            yield { type: "text", text: d.text };
          } else if (d.type === "input_json_delta")
            item._json = (item._json ?? "") + d.partial_json;
          else if (d.type === "thinking_delta")
            item.thinking = (item.thinking ?? "") + d.thinking;
          else if (d.type === "signature_delta")
            item.signature = (item.signature ?? "") + d.signature;
        }
        if (v.type === "content_block_stop") {
          const item = items[v.index];
          if (item?.type === "tool_use") {
            if (item._json) {
              item.input = JSON.parse(item._json);
              delete item._json;
            }
            calls.set(item.id, {
              id: item.id,
              name: item.name,
              arguments: JSON.stringify(item.input),
            });
          }
        }
        if (v.type === "message_delta") {
          output = v.usage?.output_tokens ?? output;
          if (["max_tokens", "refusal"].includes(v.delta?.stop_reason))
            throw new Error("Provider stopped before completing the request.");
        }
        if (v.type === "message_stop") done = true;
      } else if (p.protocol === "gemini") {
        if (v.promptFeedback?.blockReason)
          throw new Error("Provider blocked the request.");
        for (const c of v.candidates ?? []) {
          if (c.index && c.index !== 0) continue;
          for (const part of c.content?.parts ?? []) {
            items.push(part);
            if (part.text && !part.thought)
              yield { type: "text", text: part.text };
            if (part.functionCall) {
              const f = part.functionCall;
              const id = f.id ?? `gemini_${calls.size}`;
              calls.set(id, {
                id,
                name: f.name,
                arguments: JSON.stringify(f.args ?? {}),
              });
            }
          }
          if (c.finishReason) {
            if (!["STOP"].includes(c.finishReason))
              throw new Error(
                "Provider stopped before completing the request.",
              );
            done = true;
          }
        }
        input = v.usageMetadata?.promptTokenCount ?? input;
        output = v.usageMetadata?.candidatesTokenCount ?? output;
      } else {
        const c = v.choices?.find((x: any) => x.index === 0) ?? v.choices?.[0];
        if (c?.delta?.content) yield { type: "text", text: c.delta.content };
        for (const t of c?.delta?.tool_calls ?? []) {
          const key = String(t.index ?? 0);
          const old = calls.get(key) ?? { id: "", name: "", arguments: "" };
          old.id += t.id ?? "";
          old.name += t.function?.name ?? "";
          old.arguments += t.function?.arguments ?? "";
          calls.set(key, old);
        }
        if (c?.finish_reason) {
          if (
            !["stop", "tool_calls", "function_call"].includes(c.finish_reason)
          )
            throw new Error("Provider stopped before completing the request.");
          done = true;
        }
        input = v.usage?.prompt_tokens ?? input;
        output = v.usage?.completion_tokens ?? output;
      }
    }
    if (!done) throw new Error("Provider stream ended before completion.");
    for (const call of calls.values()) {
      if (!call.id || !call.name)
        throw new Error("Provider returned an incomplete tool call.");
      try {
        JSON.parse(call.arguments);
      } catch {
        throw new Error("Provider returned invalid tool arguments.");
      }
      yield { type: "tool-call", call };
    }
    if (items.length)
      yield {
        type: "continuation",
        continuation: { protocol: p.protocol, items },
      };
    yield {
      type: "usage",
      usage: { inputTokens: input, outputTokens: output },
    };
  } catch (e) {
    if (r.signal.aborted) throw new Error("Request cancelled.");
    if (combined.aborted) throw new Error("Provider request timed out.");
    if (e instanceof Error && /^Provider /.test(e.message)) throw e;
    throw new Error("Provider connection failed.");
  }
}
export async function listModels(
  p: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (p.protocol === "azure-openai")
    throw new Error(
      "Automatic Azure deployment discovery is unavailable. Enter a deployment name manually.",
    );
  const url = endpoint(p.baseUrl, "models");
  const names = new Set<string>();
  try {
    for (let page = 0; page < 20; page++) {
      const response = await fetch(url, {
        headers: headers(p, apiKey),
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(15000),
        ]),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          `Provider model discovery failed (HTTP ${response.status}). Enter a model manually.`,
        );
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > 2 * 1024 * 1024)
        throw new Error("Provider model list exceeds the supported size.");
      if (!response.body) throw new Error("Provider returned no model list.");
      let text = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const c = await reader.read();
          if (c.done) break;
          text += decoder.decode(c.value, { stream: true });
          if (text.length > 2 * 1024 * 1024)
            throw new Error("Provider model list exceeds the supported size.");
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
      const v = JSON.parse(text);
      for (const m of v.data ?? v.models ?? []) {
        if (
          p.protocol === "gemini" &&
          !m.supportedGenerationMethods?.includes("generateContent")
        )
          continue;
        const id = m.id ?? m.name;
        if (typeof id === "string" && id.length <= 256)
          names.add(id.replace(/^models\//, ""));
      }
      if (p.protocol === "gemini" && v.nextPageToken) {
        url.searchParams.set("pageToken", v.nextPageToken);
        continue;
      }
      if (p.protocol === "anthropic" && v.has_more && v.last_id) {
        url.searchParams.set("after_id", v.last_id);
        continue;
      }
      return [...names].sort();
    }
    throw new Error("Provider model discovery exceeded the pagination limit.");
  } catch (e) {
    if (signal?.aborted) throw new Error("Request cancelled.");
    if (e instanceof Error && /^Provider /.test(e.message)) throw e;
    throw new Error("Provider model discovery failed. Enter a model manually.");
  }
}
