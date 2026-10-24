/**
 * 活动日历站内提醒规则。
 * 首版仅站内提醒：进入工作台时展示到期提醒；不产生系统通知或外部渠道消息。
 */

export interface CalendarEvent {
  id: number;
  title: string;
  /** ISO 日期，如 2026-10-21 */
  startDay: string;
  endDay: string;
}

export type ReminderTiming = 'start' | 'day-before';

export interface ReminderDetails {
  title: string;
  /** 用户选择的日历收录日期；不冒充活动开售日。 */
  date: string;
}

export function parseReminderDetails(text: string): Record<string, ReminderDetails> {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const details: Record<string, ReminderDetails> = {};
    for (const [id, raw] of Object.entries(value)) {
      const entry: unknown = raw;
      if (entry && typeof entry === 'object' && 'title' in entry && typeof entry.title === 'string'
        && 'date' in entry && typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        details[id] = { title: entry.title, date: entry.date };
      }
    }
    return details;
  } catch { return {}; }
}

export interface Reminder {
  eventId: number;
  timing: ReminderTiming;
}

/** 关注/取消关注。对同一 id 幂等，绝不产生重复项。 */
export function toggleReminder(set: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const toDay = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueReminder extends Reminder {
  title: string;
}

/**
 * 计算某天的到期提醒：
 * - timing=start：活动开始当天到期；
 * - timing=day-before：开始前一天到期；
 * - 已结束（endDay < 今天）的活动不再提醒；
 * - 同一 eventId+timing 当天最多返回一次。
 */
export function dueReminders(
  reminders: Reminder[],
  events: CalendarEvent[],
  todayIso: string
): DueReminder[] {
  const today = toDay(todayIso);
  const byId = new Map(events.map(e => [e.id, e]));
  const seen = new Set<string>();
  const due: DueReminder[] = [];

  for (const r of reminders) {
    const event = byId.get(r.eventId);
    if (!event) continue;
    if (toDay(event.endDay) < today) continue; // 已结束
    const dueDay = r.timing === 'day-before' ? toDay(event.startDay) - DAY_MS : toDay(event.startDay);
    if (dueDay !== today) continue;
    const key = `${r.eventId}:${r.timing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    due.push({ ...r, title: event.title });
  }
  return due;
}
