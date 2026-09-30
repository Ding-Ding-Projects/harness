import { test } from "node:test";
import assert from "node:assert/strict";
import { readSSE } from "../src/providers/sse";
import { endpoint, streamProvider, listModels } from "../src/providers";
const stream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of new TextEncoder().encode(text))
        c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
test("SSE preserves split UTF-8, CRLF, comments and multiline data", async () => {
  const out = [];
  for await (const e of readSSE(
    stream(":ping\r\nevent: text\r\ndata: 香港\r\ndata: ok\r\n\r\n"),
  ))
    out.push(e);
  assert.deepEqual(out, [{ event: "text", data: "香港\nok" }]);
});
test("endpoint enforces transport and preserves base paths", () => {
  assert.equal(
    endpoint("https://example.com/api/v1/", "models").href,
    "https://example.com/api/v1/models",
  );
  for (const s of [
    "http://example.com",
    "https://a:b@example.com",
    "https://example.com?key=x",
    "https://example.com#x",
  ])
    assert.throws(() => endpoint(s, "models"));
  assert.equal(endpoint("http://[::1]:1234/v1", "models").protocol, "http:");
});
test("chat assembles complete tool calls and usage without sampling reasoning models", async () => {
  const original = globalThis.fetch;
  let sent: any;
  globalThis.fetch = async (_u, o) => {
    sent = JSON.parse(String(o?.body));
    assert.equal(o?.redirect, "error");
    return new Response(
      stream(
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"read","arguments":"{\\"x\\":"}}]}}]}\n\ndata: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
      ),
    );
  };
  try {
    const out = [];
    for await (const e of streamProvider({
      profile: {
        id: "x",
        name: "x",
        protocol: "openai-chat",
        baseUrl: "https://example.com/v1",
        model: "gpt-6",
      },
      apiKey: "fixture",
      messages: [],
      signal: new AbortController().signal,
      temperature: 1,
    }))
      out.push(e);
    assert.equal(sent.temperature, undefined);
    assert.deepEqual(out[0], {
      type: "tool-call",
      call: { id: "a", name: "read", arguments: '{"x":1}' },
    });
    assert.deepEqual(out[1], {
      type: "usage",
      usage: { inputTokens: 4, outputTokens: 2 },
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("provider error bodies and fetch error secrets are never reflected", async () => {
  const original = globalThis.fetch;
  try {
    for (const fail of [
      async () => new Response("secret-key", { status: 401 }),
      async () => {
        throw new Error("secret-key");
      },
    ]) {
      globalThis.fetch = fail;
      await assert.rejects(
        async () => {
          for await (const _ of streamProvider({
            profile: {
              id: "x",
              name: "x",
              protocol: "openai-chat",
              baseUrl: "https://example.com/v1",
              model: "x",
            },
            apiKey: "secret-key",
            messages: [],
            signal: new AbortController().signal,
          })) {
          }
        },
        (e) => e instanceof Error && !e.message.includes("secret-key"),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("Azure deployment discovery gives manual entry result without network", async () => {
  await assert.rejects(
    listModels(
      {
        id: "x",
        name: "Azure",
        protocol: "azure-openai",
        baseUrl: "https://example.com/openai/v1",
        model: "deployment",
      },
      "fixture",
    ),
    /deployment name manually/,
  );
});
test("native adapters preserve opaque replay, bodies, tool calls and authentication", async () => {
  const original = globalThis.fetch;
  try {
    for (const protocol of [
      "openai-responses",
      "anthropic",
      "gemini",
      "azure-openai",
    ] as const) {
      let sent: any;
      let auth: any;
      const items =
        protocol === "openai-responses"
          ? [{ type: "reasoning", encrypted_content: "opaque" }]
          : protocol === "anthropic"
            ? [{ type: "thinking", thinking: "", signature: "opaque" }]
            : [{ text: "", thoughtSignature: "opaque" }];
      const data =
        protocol === "openai-responses"
          ? {
              type: "response.completed",
              response: {
                output: [
                  ...items,
                  {
                    type: "function_call",
                    call_id: "tool1",
                    name: "read",
                    arguments: "{}",
                  },
                ],
                usage: { input_tokens: 3, output_tokens: 4 },
              },
            }
          : protocol === "anthropic"
            ? null
            : protocol === "gemini"
              ? {
                  candidates: [
                    {
                      content: {
                        parts: [
                          ...items,
                          {
                            functionCall: {
                              id: "tool1",
                              name: "read",
                              args: {},
                            },
                          },
                        ],
                      },
                      finishReason: "STOP",
                    },
                  ],
                  usageMetadata: {
                    promptTokenCount: 3,
                    candidatesTokenCount: 4,
                  },
                }
              : {
                  choices: [
                    {
                      index: 0,
                      delta: { content: "ok" },
                      finish_reason: "stop",
                    },
                  ],
                  usage: { prompt_tokens: 3, completion_tokens: 4 },
                };
      const frames =
        protocol === "anthropic"
          ? [
              {
                type: "message_start",
                message: { usage: { input_tokens: 3 } },
              },
              {
                type: "content_block_start",
                index: 0,
                content_block: {
                  type: "tool_use",
                  id: "tool1",
                  name: "read",
                  input: {},
                },
              },
              {
                type: "content_block_delta",
                index: 0,
                delta: { type: "input_json_delta", partial_json: "{}" },
              },
              { type: "content_block_stop", index: 0 },
              {
                type: "message_delta",
                delta: { stop_reason: "tool_use" },
                usage: { output_tokens: 4 },
              },
              { type: "message_stop" },
            ]
          : [data];
      globalThis.fetch = async (_url, o) => {
        sent = JSON.parse(String(o?.body));
        auth = o?.headers;
        return new Response(
          stream(
            frames.map((f) => "data: " + JSON.stringify(f) + "\n\n").join(""),
          ),
        );
      };
      const out = [];
      for await (const e of streamProvider({
        profile: {
          id: "x",
          name: "x",
          protocol,
          baseUrl: "https://example.com/v1",
          model: "deployment",
        },
        apiKey: "fixture",
        messages: [
          {
            id: "a",
            role: "assistant",
            content: "",
            createdAt: "",
            continuation: { protocol, items },
          },
        ],
        signal: new AbortController().signal,
        maxTokens: 42,
      }))
        out.push(e);
      assert.deepEqual(out.at(-1), {
        type: "usage",
        usage: { inputTokens: 3, outputTokens: 4 },
      });
      if (protocol === "openai-responses") {
        assert.equal(sent.store, false);
        assert.deepEqual(sent.input, items);
        assert.deepEqual(sent.include, ["reasoning.encrypted_content"]);
      }
      if (protocol === "anthropic") {
        assert.equal(auth["anthropic-version"], "2023-06-01");
        assert.deepEqual(sent.messages[0].content, items);
      }
      if (protocol === "gemini") {
        assert.equal(auth["x-goog-api-key"], "fixture");
        assert.deepEqual(sent.contents[0].parts, items);
      }
      if (protocol === "azure-openai") {
        assert.equal(auth["api-key"], "fixture");
        assert.equal(sent.model, "deployment");
        assert.equal(sent.max_completion_tokens, 42);
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("generic and native chat bodies use their supported output controls", async () => {
  const original = globalThis.fetch;
  try {
    for (const baseUrl of [
      "https://api.openai.com/v1",
      "https://example.com/v1",
    ]) {
      let body: any;
      globalThis.fetch = async (_u, o) => {
        body = JSON.parse(String(o?.body));
        return new Response(
          stream(
            'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          ),
        );
      };
      for await (const _ of streamProvider({
        profile: {
          id: "x",
          name: "x",
          protocol: "openai-chat",
          baseUrl,
          model: "model",
        },
        apiKey: "fixture",
        messages: [],
        maxTokens: 23,
        signal: new AbortController().signal,
      })) {
      }
      if (baseUrl.includes("api.openai.com")) {
        assert.equal(body.max_completion_tokens, 23);
        assert.equal(body.stream_options.include_usage, true);
      } else {
        assert.equal(body.max_tokens, 23);
        assert.equal(body.stream_options, undefined);
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});
