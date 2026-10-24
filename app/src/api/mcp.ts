/**
 * 前端 → 本地 MCP 适配（/api/mcp，Vite 代理到 server/mcp-adapter.mjs）。
 * 前端不持有任何密钥；未启动/失败时如实降级演示模式。
 * live 模式提供解析后的真实数据钩子（useLiveCalendar / useLiveNutrition / useLiveTime）。
 */

import { useCallback, useEffect, useState } from 'react';
import type { McpEvent, McpFood } from '../domain/mcd-parsers';
import { parseCampaignCalendar, parseNutritionFoods, parseTimeInfo } from '../domain/mcd-parsers';

export type McpMode = 'live' | 'unconfigured' | 'error' | 'offline' | 'loading';

export interface McpStatus {
  mode: McpMode;
  toolCount?: number;
  tools?: string[];
  message?: string;
  error?: { code: string; message: string };
  checkedAt?: string;
}

export interface McpTool {
  readOnly?: boolean;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export async function fetchStatus(signal?: AbortSignal): Promise<McpStatus> {
  try {
    const res = await fetch('/api/mcp/status', { signal, cache: 'no-store' });
    if (!res.ok) return { mode: 'offline', message: `适配服务 HTTP ${res.status}` };
    const body = await res.json();
    if (body.mode === 'live') return { mode: 'live', toolCount: body.toolCount, tools: body.tools, checkedAt: body.checkedAt };
    if (body.mode === 'error') return { mode: 'error', error: body.error, checkedAt: body.checkedAt };
    return { mode: 'unconfigured', message: body.message };
  } catch {
    return { mode: 'offline', message: 'MCP 适配服务未启动（pnpm mcp:server）' };
  }
}

export async function fetchTools(): Promise<McpTool[]> {
  const res = await fetch('/api/mcp/tools', { cache: 'no-store' });
  if (!res.ok) throw new Error(`tools/list 失败（HTTP ${res.status}）`);
  const body = await res.json();
  return body.tools ?? [];
}

export interface CallResult {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
  try {
    const res = await fetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, arguments: args })
    });
    const body = await res.json().catch(() => null);
    if (!body) return { ok: false, error: { code: 'BAD_RESPONSE', message: `适配服务返回异常（HTTP ${res.status}）` } };
    return body;
  } catch {
    return { ok: false, error: { code: 'OFFLINE', message: '适配服务未启动或网络错误' } };
  }
}

export function extractText(result: unknown): string | null {
  const content = (result as { content?: Array<{ type: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return null;
  return content.filter(c => c.type === 'text' && c.text).map(c => c.text!).join('\n') || null;
}

/* ---------------- live 数据钩子 ---------------- */

export interface LiveCalendar {
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  events: McpEvent[];
  /** 服务端标注的「今日」（北京时间） */
  serverToday: string | null;
}

/** 拉取并解析活动日历（真实链路）。失败保留错误信息，绝不落回演示数据冒充。 */
export function useLiveCalendar(enabled: boolean): LiveCalendar {
  const [state, setState] = useState<LiveCalendar>({ loading: false, error: null, fetchedAt: null, events: [], serverToday: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    callTool('campaign-calendar').then(res => {
      if (cancelled) return;
      if (res.ok) {
        const text = extractText(res.result);
        if (!text) {
          setState({ loading: false, error: '活动日历返回为空', fetchedAt: new Date().toISOString(), events: [], serverToday: null });
          return;
        }
        const { events, todayHint, error } = parseCampaignCalendar(text);
        setState({ loading: false, error, fetchedAt: new Date().toISOString(), events, serverToday: todayHint });
      } else {
        setState({ loading: false, error: res.error?.message ?? '查询失败', fetchedAt: new Date().toISOString(), events: [], serverToday: null });
      }
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}

export interface LiveNutrition {
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  foods: McpFood[];
  reload: () => Promise<void>;
}

/** 营养表：重试失败时清空旧数据（不把旧结果当本次成功） */
export function useLiveNutrition(enabled: boolean): LiveNutrition {
  const [state, setState] = useState<Omit<LiveNutrition, 'reload'>>({ loading: false, error: null, fetchedAt: null, foods: [] });
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null, foods: [] }));
    const res = await callTool('list-nutrition-foods', {});
    if (res.ok) {
      const text = extractText(res.result);
      const foods = text ? parseNutritionFoods(text) : [];
      setState({
        loading: false,
        error: foods.length ? null : '营养数据解析为空',
        fetchedAt: new Date().toISOString(),
        foods
      });
    } else {
      setState({ loading: false, error: res.error?.message ?? '查询失败', fetchedAt: new Date().toISOString(), foods: [] });
    }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { ...state, reload: load };
}

export interface LiveTime {
  loading: boolean;
  date: string | null;
  dayOfWeek: string | null;
  error: string | null;
}

export function useLiveTime(enabled: boolean): LiveTime {
  const [state, setState] = useState<LiveTime>({ loading: false, date: null, dayOfWeek: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    callTool('now-time-info').then(res => {
      if (cancelled) return;
      if (res.ok) {
        const t = parseTimeInfo(extractText(res.result) ?? '');
        setState({ loading: false, date: t?.date ?? null, dayOfWeek: t?.dayOfWeek ?? null, error: t ? null : '时间返回无法解析' });
      } else {
        setState({ loading: false, date: null, dayOfWeek: null, error: res.error?.message ?? '查询失败' });
      }
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}
