/**
 * 服务端 MCP 适配契约测试。使用本地 mock MCP Server，不访问真实服务。
 * 运行：node --test server/mcp-adapter.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAdapterServer, createMcpClient, parseSseText, WRITE_TOOLS } from './mcp-adapter.mjs';

/** 启动一个 mock MCP Server（Streamable HTTP 行为：SSE 响应 + session 头） */
function startMockMcp({ sse = true, failStatus = null } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const message = body ? JSON.parse(body) : null;
      if (message) calls.push({ method: message.method, headers: { ...req.headers } });
      if (failStatus) {
        res.writeHead(failStatus, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'mock failure' }));
      }
      if (!message || !message.id) {
        // notifications/initialized
        res.writeHead(202);
        return res.end();
      }
      let result;
      if (message.method === 'initialize') {
        result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcd', version: '1.0.9' } };
      } else if (message.method === 'tools/list') {
        result = {
          tools: [
            { name: 'now-time-info', description: '获取当前时间信息', inputSchema: { type: 'object', properties: {} } },
            { name: 'campaign-calendar', description: '活动日历查询工具', inputSchema: { type: 'object', properties: {} } }
          ]
        };
      } else if (message.method === 'tools/call' && message.params.name === 'now-time-info') {
        result = { content: [{ type: 'text', text: '{"date":"2026-10-23"}' }] };
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } }));
      }
      const payload = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
      if (sse) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'mock-session-1'
        });
        return res.end(`event: message\ndata: ${payload}\n\n`);
      }
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'mock-session-1' });
      res.end(payload);
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, calls });
    });
  });
}

const listen = (server) =>
  new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const get = (port, path) =>
  new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });

const post = (port, path, payload) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });

test('MCP 客户端：initialize → tools/list 走通 SSE 协议并携带 Bearer 头与会话', async () => {
  const mock = await startMockMcp({ sse: true });
  const client = createMcpClient({ url: mock.url, token: 'test-token' });
  const tools = await client.listTools();
  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, 'now-time-info');
  assert.equal(client.sessionId, 'mock-session-1');
  const init = mock.calls.find(c => c.method === 'initialize');
  assert.equal(init.headers.authorization, 'Bearer test-token');
  assert.ok(init.headers.accept.includes('text/event-stream'));
  assert.ok(mock.calls.some(c => c.method === 'notifications/initialized'));
  const list = mock.calls.find(c => c.method === 'tools/list');
  assert.equal(list.headers['mcp-session-id'], 'mock-session-1');
  mock.server.close();
});

test('MCP 客户端：兼容 application/json 响应', async () => {
  const mock = await startMockMcp({ sse: false });
  const client = createMcpClient({ url: mock.url, token: 'test-token' });
  const tools = await client.listTools();
  assert.equal(tools.length, 2);
  mock.server.close();
});

test('MCP 客户端：tools/call 返回工具结果', async () => {
  const mock = await startMockMcp();
  const client = createMcpClient({ url: mock.url, token: 'test-token' });
  const result = await client.callTool('now-time-info', {});
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.content[0].text.includes('2026-10-23'));
  mock.server.close();
});

test('MCP 客户端：401 映射为 AUTH，429 映射为 RATE_LIMIT', async () => {
  for (const [status, code] of [[401, 'AUTH'], [429, 'RATE_LIMIT']]) {
    const mock = await startMockMcp({ failStatus: status });
    const client = createMcpClient({ url: mock.url, token: 'bad-token' });
    await assert.rejects(() => client.listTools(), err => err.code === code);
    mock.server.close();
  }
});

test('parseSseText：忽略非 JSON 的 SSE 行', () => {
  const text = 'event: message\ndata: not-json\n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n';
  const messages = parseSseText(text);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].result, { tools: [] });
});

test('适配服务：未配置 Token 时 status 如实报告 unconfigured，tools/call 拒绝', async () => {
  const server = createAdapterServer({ env: {} });
  const port = await listen(server);
  const status = await get(port, '/api/mcp/status');
  assert.equal(status.body.mode, 'unconfigured');
  assert.deepEqual(status.body.requiredEnv, ['MCD_MCP_TOKEN']);
  const tools = await get(port, '/api/mcp/tools');
  assert.equal(tools.status, 503);
  const call = await post(port, '/api/mcp/call', { name: 'now-time-info' });
  assert.equal(call.status, 503);
  server.close();
});

test('适配服务：配置后透传 tools/list，响应不含 Token', async () => {
  const mock = await startMockMcp();
  const server = createAdapterServer({
    env: { MCD_MCP_TOKEN: 'secret-token', MCD_MCP_URL: mock.url }
  });
  const port = await listen(server);
  const status = await get(port, '/api/mcp/status');
  assert.equal(status.body.mode, 'live');
  assert.equal(status.body.toolCount, 2);
  assert.ok(!JSON.stringify(status.body).includes('secret-token'));
  const tools = await get(port, '/api/mcp/tools');
  assert.equal(tools.body.tools.length, 2);
  assert.ok(!JSON.stringify(tools.body).includes('secret-token'));
  server.close();
  mock.server.close();
});

test('适配服务：默认拦截写操作工具（NOT_ALLOWED，默认拒绝）', async () => {
  const mock = await startMockMcp();
  const server = createAdapterServer({
    env: { MCD_MCP_TOKEN: 'secret-token', MCD_MCP_URL: mock.url }
  });
  const port = await listen(server);
  for (const name of WRITE_TOOLS) {
    const res = await post(port, '/api/mcp/call', { name, arguments: {} });
    assert.equal(res.status, 403, `${name} 应被拦截`);
    assert.equal(res.body.error.code, 'NOT_ALLOWED');
  }
  // 写工具从未到达上游
  assert.ok(!mock.calls.some(c => c.method === 'tools/call'));
  server.close();
  mock.server.close();
});

test('适配服务：只读工具调用透传成功', async () => {
  const mock = await startMockMcp();
  const server = createAdapterServer({
    env: { MCD_MCP_TOKEN: 'secret-token', MCD_MCP_URL: mock.url }
  });
  const port = await listen(server);
  const res = await post(port, '/api/mcp/call', { name: 'now-time-info', arguments: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  server.close();
  mock.server.close();
});

test('适配服务：上游 401 时 status 报告 error 模式而非伪装成功', async () => {
  const mock = await startMockMcp({ failStatus: 401 });
  const server = createAdapterServer({
    env: { MCD_MCP_TOKEN: 'expired-token', MCD_MCP_URL: mock.url }
  });
  const port = await listen(server);
  const status = await get(port, '/api/mcp/status');
  assert.equal(status.body.mode, 'error');
  assert.equal(status.body.error.code, 'AUTH');
  assert.equal(status.body.live, false);
  server.close();
  mock.server.close();
});
