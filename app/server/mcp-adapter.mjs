/**
 * M·SPACE 服务端 MCP 适配（麦当劳中国 MCP Server）
 *
 * 官方接入依据（2026-10-25 复核）：
 * - 仓库：https://github.com/M-China/mcd-mcp-server；接入地址 https://mcp.mcd.cn
 * - 传输：Streamable HTTP（JSON-RPC；响应可为 application/json 或 text/event-stream）
 * - 认证：Authorization: Bearer <MCP_TOKEN>（https://open.mcd.cn/mcp 申请）
 * - 限流：每 Token 600 次/分钟（429）；Token 问题 401/403
 * - 实时 tools/list（2026-10-25）：35 个工具（见 docs/workbuddy/live-tools-2026-10-25.json）
 *
 * 可靠性设计（发布清单 B 组）：
 * - 超时覆盖全程（连接 + 响应体/SSE 读取），不只等 header。
 * - SSE 按 JSON-RPC 请求 id 匹配响应，忽略通知与他人消息。
 * - tools/list 处理 nextCursor 分页；会话失效（404/-32001）重建并重试一次。
 * - 工具结果 isError:true / 空 content → 明确失败，不冒充成功。
 * - 只读采用允许名单 + 默认拒绝：未知工具一律 403，无绕过开关。
 * - 本地 API 校验 Origin/Host，仅回环监听，拒绝跨站。
 * - 对外错误信息脱敏：不回显 Token、URL 凭证或上游原文。
 * - 自动加载 server/.env（仅服务端内存，不打印、不下发）。
 */

import http from 'node:http';
import { runAgent, validateArguments, createCompletion, modelConfigured } from './agent.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 只读允许名单（默认拒绝策略：名单外一律拒绝，无论读写）。
 * 依据官方工具语义与 2026-10-25 实时清单筛选；写入类/未知工具不在此列。
 */
export const READ_TOOLS = new Set([
  'now-time-info',
  'campaign-calendar',
  'list-nutrition-foods',
  'query-nearby-stores',
  'delivery-query-stores',
  'delivery-query-addresses',
  'query-meal-assistance',
  'query-store-coupons',
  'query-meals',
  'query-meal-detail',
  'calculate-price',
  'query-order',
  'order-list',
  'available-coupons',
  'query-my-coupons',
  'query-my-account',
  'mall-points-products',
  'mall-product-detail',
  'query-lottery-info',
  'query-my-prizes',
  'mall-order-list',
  'mall-order-detail',
  'query-promotions',
  'query-survey-coupon',
  'query-party-city',
  'query-party-store',
  'query-party-store-date',
  'query-party-store-session'
]);

/** 兼容旧引用：写工具集合（现在由默认拒绝策略一并覆盖） */
export const WRITE_TOOLS = new Set([
  'delivery-create-address', 'create-order', 'cancel-order',
  'auto-bind-coupons', 'mall-create-order', 'draw-lottery', 'party-order-create'
]);

const JSON_RPC_VERSION = '2.0';
const CLIENT_INFO = { name: 'mspace-workbench', version: '0.2.0' };
const PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_TIMEOUT_MS = 15000;

/** 敏感信息脱敏：Token、URL 内嵌凭证、mcpSessionId */
export function sanitize(text, token = '') {
  const value = String(text ?? '');
  return (token ? value.split(token).join('***') : value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/([A-Za-z0-9-]+\s*[=:]\s*)[A-Za-z0-9]{16,}([A-Za-z0-9._~+/=-]*)/g, '$1***$2')
    .replace(/([a-z]+:\/\/)([^@/\s]+)@/gi, '$1***@')
    .replace(/(mcp[- ]?session[- ]?id[=:]\s*)[\w.-]+/gi, '$1***');
}

/** 加载 .env（仅注入未设置的变量；不打印任何值） */
export function loadEnvFile(file, target = process.env) {
  if (!fs.existsSync(file)) return;
  const stat = fs.statSync(file);
  if (stat.mode & 0o077) {
    console.warn('[mcp-adapter] 警告：.env 权限过宽（建议 chmod 600），本次仍继续加载。');
  }
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in target) || target[key] === undefined || target[key] === '') {
      target[key] = value;
    }
  }
}

/* ---------------- SSE / 响应解析 ---------------- */

/** 把 SSE 文本解析为消息数组（忽略非 JSON 行） */
export function parseSseText(text) {
  const messages = [];
  let dataLines = [];
  const flush = () => {
    if (!dataLines.length) return;
    try { messages.push(JSON.parse(dataLines.join('\n'))); } catch { /* 非 JSON 事件忽略 */ }
    dataLines = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    else if (line.trim() === '') flush();
  }
  flush();
  return messages;
}

/** 读取 JSON 或 SSE；调用方的 AbortSignal 覆盖连接与整个响应体。 */
async function readResponse(res, expectId, onSessionHeader) {
  const sessionHeader = res.headers.get('mcp-session-id');
  if (sessionHeader) onSessionHeader?.(sessionHeader);
  const matches = msg => msg?.jsonrpc === JSON_RPC_VERSION && msg.id === expectId
    && (msg.result !== undefined || msg.error !== undefined);
  if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
    const text = await res.text();
    let message;
    try { message = JSON.parse(text); }
    catch { throw Object.assign(new Error('上游返回无效 JSON'), { code: 'BAD_RESPONSE' }); }
    if (!matches(message)) throw Object.assign(new Error('JSON-RPC 响应与请求不匹配'), { code: 'BAD_RESPONSE' });
    return message;
  }
  if (!res.body) throw Object.assign(new Error('SSE 响应为空'), { code: 'BAD_RESPONSE' });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // CRLF can be split across network chunks, so normalise only complete delimiters.
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const messages = parseSseText(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const matched = messages.find(matches);
        if (matched) return matched;
      }
      if (done) break;
    }
    throw Object.assign(new Error('SSE 流中没有匹配请求 id 的响应'), { code: 'BAD_RESPONSE' });
  } finally {
    try { await reader.cancel(); } catch { /* 请求已被 abort 时无需再次处理 */ }
    reader.releaseLock();
  }
}

/* ---------------- MCP 客户端 ---------------- */

export function createMcpClient(config) {
  const { url, token, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = config;
  let sessionId = null;
  let nextId = 1;
  let initialized = false;
  let protocolVersion = PROTOCOL_VERSION;

  async function rawRpc(method, params, { retried = false } = {}) {
    const id = nextId++;
    const controller = new AbortController();
    // One deadline covers headers and body; abort also releases upstream resources.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${token}`,
            ...(method !== 'initialize' ? { 'MCP-Protocol-Version': protocolVersion } : {}),
            ...(sessionId ? { 'mcp-session-id': sessionId } : {})
          },
          body: JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id, method, ...(params !== undefined ? { params } : {}) }),
          signal: controller.signal
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw Object.assign(new Error('请求超时（连接阶段）'), { code: 'TIMEOUT' });
        throw Object.assign(new Error(`网络错误：${err?.message || err}`), { code: 'NETWORK' });
      }

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('MCP Token 无效、已过期或未提供（401/403）'), { code: 'AUTH', status: res.status });
      }
      if (res.status === 429) {
        throw Object.assign(new Error('触发限流（每 Token 600 次/分钟）'), { code: 'RATE_LIMIT', status: 429 });
      }
      if (res.status === 404 && sessionId && !retried && method !== 'initialize') {
        // 会话失效：丢弃会话重建，仅重试一次
        sessionId = null;
        initialized = false;
        await ensureInitialized();
        return rawRpc(method, params, { retried: true });
      }
      if (!res.ok) {
        throw Object.assign(new Error(`MCP 服务返回 HTTP ${res.status}`), { code: 'HTTP', status: res.status });
      }

      const message = await readResponse(res, id, sid => { sessionId = sid; });

      if (message.error) {
        const err = Object.assign(new Error(`MCP 错误 ${message.error.code}：${message.error.message}`), {
          code: 'RPC', rpcCode: message.error.code
        });
        if (message.error.code === -32001 && sessionId && !retried && method !== 'initialize') {
          sessionId = null;
          initialized = false;
          await ensureInitialized();
          return rawRpc(method, params, { retried: true });
        }
        throw err;
      }
      return message.result;
    } catch (err) {
      if (controller.signal.aborted) throw Object.assign(new Error('请求超时（连接或响应体）'), { code: 'TIMEOUT' });
      throw err;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async function ensureInitialized() {
    if (initialized) return;
    const result = await rawRpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    });
    protocolVersion = typeof result?.protocolVersion === 'string' ? result.protocolVersion : PROTOCOL_VERSION;
    // A notification has no RPC response, but its HTTP request must still be bounded.
    const notificationController = new AbortController();
    const notificationTimer = setTimeout(() => notificationController.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${token}`,
          'MCP-Protocol-Version': protocolVersion,
          ...(sessionId ? { 'mcp-session-id': sessionId } : {})
        },
        signal: notificationController.signal,
        body: JSON.stringify({ jsonrpc: JSON_RPC_VERSION, method: 'notifications/initialized' })
      });
      await response.body?.cancel();
    } catch { /* 通知失败不阻断，但不得留下无限等待的请求 */ }
    finally {
      clearTimeout(notificationTimer);
      notificationController.abort();
    }
    initialized = true;
    return result;
  }

  return {
    async initialize() { return ensureInitialized(); },
    async listTools() {
      await ensureInitialized();
      const all = [];
      let cursor = undefined;
      let pages = 0;
      do {
        const result = await rawRpc('tools/list', cursor ? { cursor } : {});
        all.push(...(result?.tools ?? []));
        cursor = result?.nextCursor ?? null;
        pages++;
      } while (cursor && pages < 20);
      return all;
    },
    async callTool(name, args = {}) {
      await ensureInitialized();
      const result = await rawRpc('tools/call', { name, arguments: args });
      if (!result || typeof result !== 'object') {
        throw Object.assign(new Error('工具结果缺失'), { code: 'BAD_RESPONSE' });
      }
      if (result.isError) {
        const text = Array.isArray(result.content)
          ? result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : '';
        throw Object.assign(new Error(`工具执行失败：${sanitize(text, token) || '（无说明）'}`), { code: 'TOOL_ERROR' });
      }
      if (!Array.isArray(result.content) || result.content.length === 0) {
        throw Object.assign(new Error('工具返回为空'), { code: 'EMPTY' });
      }
      return result;
    },
    get sessionId() { return sessionId; },
    forceSession(sid) { sessionId = sid; initialized = true; } // 仅供测试
  };
}

/* ---------------- 本地适配服务 ---------------- */

export function createAdapterServer({ env = process.env, clientFactory = createMcpClient } = {}) {
  const token = env.MCD_MCP_TOKEN || '';
  const url = env.MCD_MCP_URL || 'https://mcp.mcd.cn';
  const configured = Boolean(token);

  let client = null;
  let toolsCache = { at: 0, tools: null };
  const TOOLS_CACHE_MS = 5 * 60 * 1000;

  const getClient = () => (client ??= clientFactory({ url, token }));

  const redact = value => [token, env.M_AGENT_API_KEY].filter(Boolean).reduce((text, secret) => text.split(secret).join('***'), String(value));

  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(redact(JSON.stringify(body)));
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 64 * 1024) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });

  /** 本地安全校验：仅允许回环 Host 与本地开发 Origin */
  const isLocalRequest = (req) => {
    const host = (req.headers.host || '').toLowerCase();
    const hostName = host.split(':')[0];
    const hostOk = hostName === '127.0.0.1' || hostName === 'localhost' || hostName === '[::1]';
    const origin = req.headers.origin;
    const originOk = !origin || (() => {
      try {
        const o = new URL(origin);
        return (o.hostname === '127.0.0.1' || o.hostname === 'localhost' || o.hostname === '[::1]');
      } catch { return false; }
    })();
    return hostOk && originOk;
  };

  const errorPayload = (err) => ({
    ok: false,
    error: { code: err?.code || 'INTERNAL', message: sanitize(err?.message || '内部错误', token) }
  });

  const statusFor = (code) =>
    code === 'AUTH' ? 401 : code === 'RATE_LIMIT' ? 429 : code === 'TIMEOUT' ? 504 :
    code === 'NOT_ALLOWED' ? 403 : code === 'BAD_REQUEST' ? 400 :
    code === 'TOOL_ERROR' || code === 'EMPTY' || code === 'BAD_RESPONSE' ? 502 : 500;

  const liveTools = async () => {
    if (toolsCache.tools && Date.now() - toolsCache.at < TOOLS_CACHE_MS) return toolsCache.tools;
    const tools = await getClient().listTools();
    toolsCache = { at: Date.now(), tools };
    return tools;
  };
  const executeReadTool = async (name, args) => {
    if (!READ_TOOLS.has(name)) throw Object.assign(new Error('工具不在只读允许名单'), { code:'NOT_ALLOWED' });
    const tool = (await liveTools()).find(t => t.name === name);
    const errors = validateArguments(tool, args);
    if (errors.length) throw Object.assign(new Error(errors.join('；')), { code:'BAD_REQUEST' });
    const result = await getClient().callTool(name, args);
    // The official service can encode business failure inside a successful MCP result.
    for (const content of result.content ?? []) {
      if (content.type !== 'text' || typeof content.text !== 'string') continue;
      const marker = content.text.indexOf('Original Response');
      const start = content.text.indexOf('{', marker < 0 ? 0 : marker);
      if (start < 0) continue;
      let depth = 0, quoted = false, escape = false;
      for (let i = start; i < content.text.length; i++) {
        const char = content.text[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (char === '{') depth++;
        if (char === '}') depth--;
        if (depth !== 0) continue;
        let body;
        try { body = JSON.parse(content.text.slice(start, i + 1)); } catch { break; }
        if (body.success === false || (typeof body.code === 'number' && ![0, 200].includes(body.code))) {
          throw Object.assign(new Error(typeof body.message === 'string' ? body.message : '工具业务失败'), { code:'TOOL_ERROR' });
        }
        break;
      }
    }
    return result;
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!isLocalRequest(req)) {
        return send(res, 403, { ok: false, error: { code: 'FORBIDDEN_ORIGIN', message: '仅允许本地回环调用' } });
      }
      const { pathname } = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'GET' && pathname === '/api/mcp/agent/status') {
        return send(res, 200, { configured:modelConfigured(env), readOnly:true });
      }
      if (req.method === 'POST' && pathname === '/api/mcp/agent') {
        if (!configured || !modelConfigured(env)) return send(res, 503, { ok:false, error:{ code:'MODEL_UNCONFIGURED', message:'未配置模型，使用直连工具模式' } });
        const body = await readBody(req);
        if (!Array.isArray(body.messages) || body.messages.length > 30 || body.messages.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000)) {
          return send(res, 400, { ok:false, error:{code:'BAD_REQUEST',message:'只接受用户与助手文字消息'} });
        }
        const messages = body.messages.map(m => ({role:m.role,content:m.content}));
        const result = await runAgent({ messages, tools:await liveTools(), allowed:READ_TOOLS, complete:createCompletion(env), execute:executeReadTool, redact });
        return send(res, 200, { ok:true, ...result });
      }

      if (req.method === 'GET' && pathname === '/api/mcp/status') {
        if (!configured) {
          return send(res, 200, {
            ok: true, configured: false, live: false, mode: 'unconfigured',
            message: '未配置 MCD_MCP_TOKEN，当前为演示模式。参见 server/.env.example。',
            requiredEnv: ['MCD_MCP_TOKEN'], optionalEnv: ['MCD_MCP_URL', 'MCP_ADAPTER_PORT'],
            readOnlyTools: [...READ_TOOLS]
          });
        }
        try {
          const tools = await getClient().listTools();
          toolsCache = { at: Date.now(), tools };
          return send(res, 200, {
            ok: true, configured: true, live: true, mode: 'live',
            toolCount: tools.length, tools: tools.map(t => t.name),
            checkedAt: new Date().toISOString()
          });
        } catch (err) {
          return send(res, 200, {
            ok: true, configured: true, live: false, mode: 'error',
            error: { code: err.code || 'INTERNAL', message: sanitize(err.message, token) },
            checkedAt: new Date().toISOString()
          });
        }
      }

      if (req.method === 'GET' && pathname === '/api/mcp/tools') {
        if (!configured) return send(res, 503, { ok: false, error: { code: 'UNCONFIGURED', message: '缺少 MCD_MCP_TOKEN' } });
        if (toolsCache.tools && Date.now() - toolsCache.at < TOOLS_CACHE_MS) {
          return send(res, 200, { ok: true, cached: true, tools: toolsCache.tools.map(t => ({ ...t, readOnly:READ_TOOLS.has(t.name) })) });
        }
        try {
          const tools = await getClient().listTools();
          toolsCache = { at: Date.now(), tools };
          return send(res, 200, { ok: true, cached: false, tools: tools.map(t => ({ ...t, readOnly:READ_TOOLS.has(t.name) })) });
        } catch (err) {
          return send(res, 502, errorPayload(err));
        }
      }

      if (req.method === 'POST' && pathname === '/api/mcp/call') {
        if (!configured) return send(res, 503, { ok: false, error: { code: 'UNCONFIGURED', message: '缺少 MCD_MCP_TOKEN' } });
        const body = await readBody(req);
        const name = body?.name;
        if (typeof name !== 'string' || !name) {
          return send(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: '缺少工具名称 name' } });
        }
        // 只读允许名单：名单外一律拒绝（默认拒绝，无绕过开关）
        if (!READ_TOOLS.has(name)) {
          const kind = WRITE_TOOLS.has(name) ? '写操作工具' : '未知工具';
          return send(res, 403, {
            ok: false,
            error: { code: 'NOT_ALLOWED', message: `${kind} ${name} 不在只读允许名单中，已拒绝。本适配层仅开放只读查询。` }
          });
        }
        try {
          const result = await executeReadTool(name, body.arguments ?? {});
          return send(res, 200, { ok: true, result });
        } catch (err) {
          return send(res, statusFor(err.code), errorPayload(err));
        }
      }

      return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未知路径' } });
    } catch (err) {
      return send(res, 500, errorPayload(err));
    }
  });

  return server;
}

/* ---------------- 直启 ---------------- */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvFile(path.join(__dirname, '.env')); // 自动加载，不打印值
  const port = Number(process.env.MCP_ADAPTER_PORT || 10243);
  const server = createAdapterServer();
  server.listen(port, '127.0.0.1', () => {
    const configured = Boolean(process.env.MCD_MCP_TOKEN);
    console.log(`[mcp-adapter] 监听 http://127.0.0.1:${port}`);
    console.log(`[mcp-adapter] 模式：${configured ? '已配置 Token（live）' : '未配置 MCD_MCP_TOKEN（演示模式）'}`);
    console.log(`[mcp-adapter] 只读允许名单 ${READ_TOOLS.size} 项；名单外工具默认拒绝，无绕过开关。`);
  });
}
