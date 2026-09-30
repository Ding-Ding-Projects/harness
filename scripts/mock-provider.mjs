import http from 'node:http';

// Local development fixture. This server is never included in a packaged application.
const port = Number(process.argv[2] ?? 43187);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Provide a valid local port.');
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'local-fixture', object: 'model', owned_by: 'local-test' }] }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return; }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) { res.writeHead(413).end(); return; }
  }
  let payload;
  try { payload = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
  const last = payload.messages?.at(-1);
  if (String(last?.content).includes('simulate-error')) { res.writeHead(429).end('Fixture rate limit.'); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  if (last?.role === 'user' && String(last.content).includes('[tool]') && payload.tools?.length) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0,
      id: 'fixture-call-1', type: 'function', function: { name: 'write_file',
        arguments: JSON.stringify({ path: 'approved-note.txt', content: 'Created by the approved local verification fixture.\n' }) }
    }] }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
    return;
  }
  const pieces = ['This is a **local verification fixture**, ', 'not a cloud model.\n\n',
    'Streaming, conversation persistence, and Markdown rendering are connected.\n\n',
    '```typescript\nconst workspace = "ready";\n```\n\n',
    'No provider account was contacted.'];
  for (const content of pieces) {
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  if (!res.destroyed) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 36, total_tokens: 48 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local verification fixture at http://127.0.0.1:${port}/v1`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
