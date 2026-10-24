/**
 * 适配层可靠性契约测试（发布清单 B 组）。本地 mock，不访问真实服务。
 * 运行：node --test server/mcp-adapter.reliability.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdapterServer, createMcpClient, READ_TOOLS } from './mcp-adapter.mjs';

/* ---------- 测试辅助 ---------- */

function sse(...messages) {
  return messages.map(m => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join('');
}
function rpcMsg(id, result) { return { jsonrpc: '2.0', id, result }; }

const listen = (server) => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, res => {
    let d = ''; res.on('data', c => (d += c));
    res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
  }).on('error', reject);
});
const post = (port, p, payload, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, res => {
    let d = ''; res.on('data', c => (d += c));
    res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
  });
  req.on('error', reject);
  req.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
});

/* ---------- 1. 超时需覆盖响应体/SSE 全程 ---------- */

test('SSE 响应体迟迟不结束时整段请求超时（不是只等 header）', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(sse({ jsonrpc: '2.0', method: 'notifications/progress', progress: 1 })); // 先发一条通知，不结束
    // 永不结束，模拟挂起
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${upstream.address().port}`;
  const client = createMcpClient({ url, token: 't', timeoutMs: 300 });
  await assert.rejects(() => client.listTools(), err => err.code === 'TIMEOUT');
  // 挂起的 socket 需强制销毁，否则进程无法退出
  upstream.closeAllConnections?.();
  upstream.close();
});

test('JSON 响应体读取阶段超时同样触发 TIMEOUT', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"jsonrpc":"2.0","id":1,"res'); // 半截 JSON 后挂起
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const client = createMcpClient({ url: `http://127.0.0.1:${upstream.address().port}`, token: 't', timeoutMs: 300 });
  await assert.rejects(() => client.listTools(), err => err.code === 'TIMEOUT');
  upstream.closeAllConnections?.();
  upstream.close();
});

/* ---------- 2. 按请求 ID 匹配 SSE ---------- */

test('SSE 多条消息按 JSON-RPC id 匹配，不取最后一条', async () => {
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      // 干扰项：别人的 id、通知，然后才是本请求结果，最后再塞一条别人的
      res.end(
        sse(
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          rpcMsg(999, { wrong: true }),
          rpcMsg(msg.id, { tools: [{ name: 'now-time-info' }] }),
          rpcMsg(998, { wrong: true })
        )
      );
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const client = createMcpClient({ url: `http://127.0.0.1:${upstream.address().port}`, token: 't' });
  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'now-time-info');
  upstream.close();
});

/* ---------- 3. tools/list 分页与会话失效 ---------- */

test('tools/list 按 nextCursor 分页合并', async () => {
  const pages = [
    { tools: [{ name: 'a' }, { name: 'b' }], nextCursor: 'page2' },
    { tools: [{ name: 'c' }], nextCursor: null }
  ];
  const seenCursors = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      if (!msg.id) { res.writeHead(202); return res.end(); } // 通知
      if (msg.method !== 'tools/list') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : {} }));
      }
      seenCursors.push(msg.params?.cursor ?? null);
      const page = msg.params?.cursor ? pages[1] : pages[0];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: page }));
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const client = createMcpClient({ url: `http://127.0.0.1:${upstream.address().port}`, token: 't' });
  const tools = await client.listTools();
  assert.deepEqual(tools.map(t => t.name), ['a', 'b', 'c']);
  assert.deepEqual(seenCursors, [null, 'page2']);
  upstream.close();
});

test('会话失效（HTTP 404）时重建会话并重试一次', async () => {
  let sessionValid = false;
  let listCalls = 0;
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const msg = body ? JSON.parse(body) : null;
      if (!msg) { res.writeHead(202); return res.end(); }
      const sid = req.headers['mcp-session-id'];
      if (msg.method !== 'initialize' && sid === 'stale-session') {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'Session terminated' } }));
      }
      if (msg.method === 'initialize') {
        sessionValid = true;
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'fresh-session' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }));
      }
      if (msg.method === 'tools/list') {
        listCalls++;
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'x' }] } }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const client = createMcpClient({ url: `http://127.0.0.1:${upstream.address().port}`, token: 't' });
  // 直接注入陈旧会话，模拟服务端已重启
  client.forceSession('stale-session');
  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(listCalls, 1);
  assert.equal(client.sessionId, 'fresh-session');
  assert.ok(sessionValid);
  upstream.close();
});

/* ---------- 4. isError / 空响应 ---------- */

test('工具结果 isError:true 上报为 TOOL_ERROR，不冒充成功', async () => {
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      if (msg.method === 'tools/call') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          jsonrpc: '2.0', id: msg.id,
          result: { content: [{ type: 'text', text: '业务错误：门店不存在' }], isError: true }
        }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { tools: [{ name: 'query-nearby-stores', inputSchema: { type: 'object', properties: {} } }] } }));
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${upstream.address().port}`;
  const client = createMcpClient({ url, token: 't' });
  await assert.rejects(() => client.callTool('query-nearby-stores', {}), err => err.code === 'TOOL_ERROR' && /门店不存在/.test(err.message));
  // 适配层也要透传为失败
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'fake-test-credential-only', MCD_MCP_URL: url } });
  const port = await listen(server);
  const res = await post(port, '/api/mcp/call', { name: 'query-nearby-stores', arguments: {} });
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'TOOL_ERROR');
  server.close(); upstream.close();
});

test('空 content 的工具结果返回 ok:false（EMPTY）', async () => {
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      if (msg.method === 'tools/call') return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [] } }));
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { tools: [{ name: 'campaign-calendar', inputSchema: { type: 'object', properties: {} } }] } }));
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'fake-test-credential-only', MCD_MCP_URL: `http://127.0.0.1:${upstream.address().port}` } });
  const port = await listen(server);
  const res = await post(port, '/api/mcp/call', { name: 'campaign-calendar' });
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'EMPTY');
  server.close(); upstream.close();
});

/* ---------- 5. 只读白名单默认拒绝 ---------- */

test('未知工具默认拒绝（默认拒绝策略），已知写工具同样拒绝', async () => {
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'fake-test-credential-only', MCD_MCP_URL: 'http://127.0.0.1:1' } });
  const port = await listen(server);
  const unknown = await post(port, '/api/mcp/call', { name: 'totally-unknown-tool' });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.body.error.code, 'NOT_ALLOWED');
  const write = await post(port, '/api/mcp/call', { name: 'create-order' });
  assert.equal(write.status, 403);
  assert.equal(write.body.error.code, 'NOT_ALLOWED');
  server.close();
});

test('不存在绕过只读的开关：MCP_ALLOW_WRITES=1 也拒绝写工具', async () => {
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'fake-test-credential-only', MCD_MCP_URL: 'http://127.0.0.1:1', MCP_ALLOW_WRITES: '1' } });
  const port = await listen(server);
  const res = await post(port, '/api/mcp/call', { name: 'draw-lottery' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NOT_ALLOWED');
  server.close();
});

test('READ_TOOLS 白名单只含只读工具且包含核心读取项', () => {
  for (const name of ['now-time-info', 'campaign-calendar', 'list-nutrition-foods', 'query-meals', 'query-meal-detail', 'calculate-price']) {
    assert.ok(READ_TOOLS.has(name), `${name} 应在白名单`);
  }
  for (const name of ['create-order', 'cancel-order', 'draw-lottery', 'auto-bind-coupons', 'mall-create-order', 'party-order-create', 'delivery-create-address']) {
    assert.ok(!READ_TOOLS.has(name), `${name} 不应在白名单`);
  }
});

/* ---------- 6. Origin / Host 校验 ---------- */

test('跨站 Origin 与非法 Host 被拒绝', async () => {
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'fake-test-credential-only', MCD_MCP_URL: 'http://127.0.0.1:1' } });
  const port = await listen(server);
  const badOrigin = await get(port, '/api/mcp/status', { origin: 'https://evil.example' });
  assert.equal(badOrigin.status, 403);
  const badHost = await get(port, '/api/mcp/status', { host: 'evil.example:1234' });
  assert.equal(badHost.status, 403);
  const good = await get(port, '/api/mcp/status', { origin: 'http://127.0.0.1:10241' });
  assert.equal(good.status, 200);
  server.close();
});

/* ---------- 7. 错误脱敏 ---------- */

test('上游错误消息中的 Token 与 URL 凭证不回显给前端', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream failed for token secret-token-123 at https://user:pass@mcp.example' }));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const server = createAdapterServer({ env: { MCD_MCP_TOKEN: 'secret-token-123', MCD_MCP_URL: `http://127.0.0.1:${upstream.address().port}` } });
  const port = await listen(server);
  const status = await get(port, '/api/mcp/status');
  const raw = JSON.stringify(status.body);
  assert.ok(!raw.includes('secret-token-123'), '不得包含 Token');
  assert.ok(!raw.includes('user:pass'), '不得包含 URL 凭证');
  assert.equal(status.body.mode, 'error');
  server.close(); upstream.close();
});

/* ---------- 8. .env 自动加载（不打印值） ---------- */

test('loadEnvFile 注入未设置的环境变量且不覆盖已有值', async () => {
  const { loadEnvFile } = await import('./mcp-adapter.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mspace-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'MCD_MCP_TOKEN=file-token\nMCD_MCP_URL=https://file.example\n# comment\n', { mode: 0o600 });
  const env = { MCD_MCP_URL: 'https://env-wins.example' };
  loadEnvFile(file, env);
  assert.equal(env.MCD_MCP_TOKEN, 'file-token');
  assert.equal(env.MCD_MCP_URL, 'https://env-wins.example'); // 已有值优先
  fs.rmSync(dir, { recursive: true, force: true });
});
