/**
 * 麦当劳 MCP 真实响应解析器（纯函数，可测试）。
 * 依据 2026-10-25 实测响应结构（docs/workbuddy/readonly-proof-2026-10-25.json）：
 * - now-time-info：Markdown 后附 Original Response JSON，data 含北京时间日期字段
 * - campaign-calendar：Markdown 按日期分组（#### YYYY年M月D日 [今日]），
 *   条目含「活动标题/活动内容介绍/活动图片介绍」三段；同一活动可出现在多个日期组
 * - list-nutrition-foods：Original Response JSON 的 data 为 TOON 文本表
 *   "[N]{productName,...}:\n  名,desc,kj,kcal,蛋白,脂肪,碳水,钠,钙"，可含完全重复行
 */

export interface McpTimeInfo {
  date: string;       // YYYY-MM-DD（北京时间）
  formatted?: string;
  dayOfWeek?: string;
}

export interface McpEvent {
  /** 由标题去重后的稳定 id（解析器内保证唯一） */
  id: string;
  title: string;
  description: string;
  imageUrls: string[];
  /** 服务收录该条目的日期组，不代表活动起止时间。 */
  days: string[];
}

export interface McpFood {
  productName: string;
  nutritionDescription: string | null;
  energyKj: number | null;
  energyKcal: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrate: number | null;
  sodium: number | null;
  calcium: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function businessFailed(json: Record<string, unknown> | null): boolean {
  return json?.success === false || (typeof json?.code === 'number' && json.code !== 200 && json.code !== 0);
}

/** 从工具文本中截取 Original Response 后的首个 JSON 对象 */
export function extractOriginalJson(text: string): Record<string, unknown> | null {
  const marker = text.indexOf('Original Response');
  const start = marker >= 0 ? text.indexOf('{', marker) : text.indexOf('{');
  if (start < 0) return null;
  // 从首个 { 做括号配对（字符串感知）
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, i + 1));
          return isRecord(value) ? value : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

/** 解析 now-time-info */
export function parseTimeInfo(text: string): McpTimeInfo | null {
  const json = extractOriginalJson(text);
  if (businessFailed(json)) return null;
  const data = isRecord(json?.data) ? json.data : null;
  if (data && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return {
      date: data.date,
      formatted: typeof data.formatted === 'string' ? data.formatted : undefined,
      dayOfWeek: typeof data.dayOfWeek === 'string' ? data.dayOfWeek : undefined
    };
  }
  // 兜底：从头部 Markdown「当前时间：YYYY-MM-DD HH:mm:ss」取日期
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}/);
  return m ? { date: m[0].slice(0, 10) } : null;
}

const DAY_LINE = /^#{2,6}\s*(\d{4})年(\d{1,2})月(\d{1,2})日/;

/**
 * 解析 campaign-calendar。
 * 规则：
 * - 日期组：#### 2026年10月25日 今日 → 组日期
 * - 条目：以 **活动标题**： 开始；**活动内容介绍**： 多行直到 **活动图片介绍**：
 * - 图片：<img src="..."> 全部收集
 * - 同标题跨组视为同一活动，days 合并（不虚构结束日：只按出现日期归属）
 * - 不由收录日期推断活动开始、持续或结束状态
 */
export function parseCampaignCalendar(text: string): { todayHint: string | null; events: McpEvent[]; error: string | null } {
  const json = extractOriginalJson(text);
  if (businessFailed(json)) return { todayHint: null, events: [], error: '活动日历查询失败' };
  const explicitEmpty = json?.success === true && Array.isArray(json.data) && json.data.length === 0;
  const lines = text.split(/\r?\n/);
  let todayHint: string | null = null;
  const byTitle = new Map<string, McpEvent>();
  let currentDay: string | null = null;
  let current: McpEvent | null = null;
  let section: 'title' | 'desc' | 'img' | null = null;
  let descLines: string[] = [];

  const flushEvent = () => {
    if (!current) return;
    current.description = descLines.join('\n').trim();
    descLines = [];
    if (!byTitle.has(current.title)) byTitle.set(current.title, current);
    else {
      // 同标题：合并 days（去重升序）；内容保留首次
      const existing = byTitle.get(current.title)!;
      existing.days = [...new Set([...existing.days, ...current.days])].sort();
    }
    current = null;
    section = null;
  };

  for (const raw of lines) {
    const dayMatch = raw.match(DAY_LINE);
    if (dayMatch) {
      flushEvent();
      const iso = `${dayMatch[1]}-${String(dayMatch[2]).padStart(2, '0')}-${String(dayMatch[3]).padStart(2, '0')}`;
      currentDay = iso;
      if (/今日/.test(raw) && !todayHint) todayHint = iso;
      continue;
    }
    const titleMatch = raw.match(/^\s*[-*]\s*\*\*活动标题\*\*[:：]\s*(.+?)\s*$/);
    if (titleMatch) {
      flushEvent();
      const title = titleMatch[1];
      current = { id: '', title, description: '', imageUrls: [], days: currentDay ? [currentDay] : [] };
      section = 'title';
      continue;
    }
    if (current) {
      const descStart = raw.match(/^\s*\*\*活动内容介绍\*\*[:：]\s*(.*)$/);
      if (descStart) { section = 'desc'; if (descStart[1].trim()) descLines.push(descStart[1].trim()); continue; }
      const imgStart = raw.match(/^\s*\*\*活动图片介绍\*\*/);
      if (imgStart) { section = 'img'; continue; }
      const descEnd = raw.match(/^\s*[-*]\s*\*\*活动标题\*\*/);
      if (descEnd) { flushEvent(); continue; }
      if (section === 'desc' && raw.trim()) descLines.push(raw.trim());
      if (section === 'img') {
        for (const m of raw.matchAll(/<img\s+src="([^"]+)"/g)) current.imageUrls.push(m[1]);
      }
    }
  }
  flushEvent();

  const events = [...byTitle.values()].map(e => ({
    ...e,
    id: 'ev-' + Math.abs([...e.title].reduce((h, c) => (h * 31 + c.codePointAt(0)!) | 0, 7))
  }));
  // An unrecognised response is not evidence that there are no campaigns.
  const validEvents = events.length > 0 && events.every(event => event.days.length > 0);
  return { todayHint, events: validEvents ? events : [], error: validEvents || explicitEmpty ? null : '活动日历格式无法识别，请重试' };
}

/** 北京时间今天的 ISO 日期（独立于系统时区） */
export function beijingToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  return parts; // en-CA → YYYY-MM-DD
}

export type EventStatus = '今日收录' | '后续日历' | '历史收录' | '日期未明';

/** 收录标签描述服务日期归属，不冒充活动生命周期。 */
export function statusOf(event: McpEvent, todayIso: string): EventStatus {
  if (event.days.includes(todayIso)) return '今日收录';
  if (event.days.some(day => day > todayIso)) return '后续日历';
  return event.days.length ? '历史收录' : '日期未明';
}

/** 解析 list-nutrition-foods 的 TOON 表 */
export function parseNutritionFoods(text: string): McpFood[] {
  const json = extractOriginalJson(text);
  if (businessFailed(json)) return [];
  const data = typeof json?.data === 'string' ? json.data : null;
  if (!data) return [];
  const headerMatch = data.match(/^\[(\d+)\]\{([^}]+)\}:/);
  if (!headerMatch) return [];
  const cols = headerMatch[2].split(',').map(s => s.trim());
  const body = data.slice(data.indexOf(':') + 1);
  const seen = new Set<string>();
  const foods: McpFood[] = [];
  for (const line of body.split('\n')) {
    const row = line.trim();
    if (!row) continue;
    const cells = row.split(',');
    if (cells.length !== cols.length) continue; // 列数不符即放弃该行（不许强配）
    const obj: Record<string, string> = {};
    cols.forEach((c, i) => (obj[c] = cells[i]?.trim() ?? ''));
    const key = row;
    if (seen.has(key)) continue; // 完全重复记录只保留一条
    seen.add(key);
    const num = (v: string) => (v && v !== 'null' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    foods.push({
      productName: obj.productName ?? '',
      nutritionDescription: obj.nutritionDescription && obj.nutritionDescription !== 'null' ? obj.nutritionDescription : null,
      energyKj: num(obj.energyKj),
      energyKcal: num(obj.energyKcal),
      protein: num(obj.protein),
      fat: num(obj.fat),
      carbohydrate: num(obj.carbohydrate),
      sodium: num(obj.sodium),
      calcium: num(obj.calcium)
    });
  }
  return foods;
}

/** 精确名称匹配；同名不同行（不同规格/值）返回全部，不强行合并 */
export function findFoodByName(foods: McpFood[], name: string): McpFood[] {
  return foods.filter(f => f.productName === name);
}
