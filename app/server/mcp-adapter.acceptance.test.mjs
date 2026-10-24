// Independent acceptance regressions: local fake upstreams, no real credentials.
import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createMcpClient, createAdapterServer } from './mcp-adapter.mjs';

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

function rpcServer(reply) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => reply(JSON.parse(body), req, res));
  });
}

const initial = { protocolVersion: '2025-03-26', capabilities: {} };
function json(res, id, result) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

for (const stage of ['headers', 'SSE body', 'JSON body']) {
  test(`timeout aborts the upstream socket during ${stage}`, { timeout: 2500 }, async t => {
    let disconnected = false;
    const upstream = http.createServer((req, res) => {
      res.on('close', () => { disconnected = true; });
      if (stage === 'SSE body') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(': pending\n\n');
      } else if (stage === 'JSON body') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{');
      }
    });
    const url = await listen(t, upstream);
    const client = createMcpClient({ url, token: 'fake-only', timeoutMs: 100 });
    const result = await Promise.race([
      client.listTools().then(() => 'SUCCESS', err => err.code),
      delay(1600).then(() => 'UNBOUNDED')
    ]);
    assert.equal(result, 'TIMEOUT', 'the whole request must have a deadline');
    await delay(50);
    assert.equal(disconnected, true, 'timeout must close the upstream, not merely reject a race');
  });
}

test('CRLF SSE matches the requested ID across chunks', async t => {
  const url = await listen(t, rpcServer((msg, req, res) => {
    if (!msg.id) { res.writeHead(202); res.end(); return; }
    const result = msg.method === 'initialize' ? initial : { tools: [{ name: 'now-time-info' }] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: 999, result: {} })}\r\n\r\n`);
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\r`);
    res.end('\n\r\n');
  }));
  const tools = await createMcpClient({ url, token: 'fake-only' }).listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['now-time-info']);
});

test('subsequent requests include the negotiated protocol header', async t => {
  const headers = [];
  const url = await listen(t, rpcServer((msg, req, res) => {
    if (msg.method !== 'initialize') headers.push(req.headers['mcp-protocol-version']);
    if (!msg.id) { res.writeHead(202); res.end(); return; }
    json(res, msg.id, msg.method === 'initialize' ? { ...initial, protocolVersion: '2025-06-18' } : { tools: [] });
  }));
  await createMcpClient({ url, token: 'fake-only' }).listTools();
  assert.deepEqual(headers, ['2025-06-18', '2025-06-18']);
});

test('JSON responses cannot satisfy another request ID', async t => {
  const url = await listen(t, rpcServer((msg, req, res) => json(res, msg.id + 1, initial)));
  await assert.rejects(createMcpClient({ url, token: 'fake-only' }).listTools(), { code: 'BAD_RESPONSE' });
});

test('a stalled initialized notification is bounded', { timeout: 2500 }, async t => {
  let notificationClosed = false;
  const url = await listen(t, rpcServer((msg, req, res) => {
    if (!msg.id) { res.on('close', () => { notificationClosed = true; }); return; }
    json(res, msg.id, msg.method === 'initialize' ? initial : { tools: [] });
  }));
  const result = await Promise.race([
    createMcpClient({ url, token: 'fake-only', timeoutMs: 400 }).listTools().then(() => 'DONE'),
    delay(1600).then(() => 'UNBOUNDED')
  ]);
  assert.equal(result, 'DONE');
  await delay(50);
  assert.equal(notificationClosed, true);
});

test('status and call errors redact the exact configured token', async t => {
  const token = 'fake_private_token_for_acceptance_only';
  const url = await listen(t, rpcServer((msg, req, res) => {
    if (!msg.id) { res.writeHead(202); res.end(); return; }
    if (msg.method === 'initialize') { json(res, msg.id, initial); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `reflected ${token}` } }));
  }));
  const adapter = await listen(t, createAdapterServer({ env: { MCD_MCP_TOKEN: token, MCD_MCP_URL: url } }));
  const status = await fetch(`${adapter}/api/mcp/status`).then(res => res.text());
  const call = await fetch(`${adapter}/api/mcp/call`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'now-time-info' })
  }).then(res => res.text());
  assert.equal(status.includes(token), false);
  assert.equal(call.includes(token), false);
});
