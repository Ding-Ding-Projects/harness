/** Decode SSE independently of transport chunk boundaries, including UTF-8 and CRLF splits. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    event = "",
    data: string[] = [],
    total = 0;
  const line = (value: string) => {
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    let text = colon < 0 ? "" : value.slice(colon + 1);
    if (text.startsWith(" ")) text = text.slice(1);
    if (field === "event") event = text;
    if (field === "data") data.push(text);
  };
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Request cancelled.");
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      total += chunk.value?.length ?? 0;
      if (total > 64 * 1024 * 1024 || buffer.length > 2 * 1024 * 1024)
        throw new Error("Provider stream exceeds the supported size.");
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        if (
          match[0] === "\r" &&
          match.index === buffer.length - 1 &&
          !chunk.done
        )
          break;
        const value = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (value === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = "";
          data = [];
        } else line(value);
      }
      if (chunk.done) {
        if (buffer) line(buffer);
        if (data.length) yield { event, data: data.join("\n") };
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
