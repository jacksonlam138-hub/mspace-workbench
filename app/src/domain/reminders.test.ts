import { describe, expect, test } from 'vitest';
import { dueReminders, toggleReminder, parseReminderDetails, type Reminder, type CalendarEvent } from './reminders';

test('真实活动提醒保留标题和所选日期，损坏的本地记录被忽略', () => {
  expect(parseReminderDetails(JSON.stringify({
    'ev-real': { title: '真实活动标题', date: '2026-10-26' },
    invalid: { title: 5, date: 'not-a-date' }
  }))).toEqual({ 'ev-real': { title: '真实活动标题', date: '2026-10-26' } });
  expect(parseReminderDetails('{broken')).toEqual({});
});

const events: CalendarEvent[] = [
  { id: 1, title: '进行中活动', startDay: '2026-10-21', endDay: '2026-10-21' },
  { id: 2, title: '明天的活动', startDay: '2026-10-22', endDay: '2026-10-23' },
  { id: 3, title: '下周的活动', startDay: '2026-10-28', endDay: '2026-10-28' },
  { id: 4, title: '已结束活动', startDay: '2026-10-19', endDay: '2026-10-20' }
];

describe('toggleReminder', () => {
  test('添加后可取消，往返幂等', () => {
    let set: ReadonlySet<number> = new Set();
    set = toggleReminder(set, 1);
    expect(set.has(1)).toBe(true);
    set = toggleReminder(set, 1);
    expect(set.has(1)).toBe(false);
  });

  test('重复添加不产生重复提醒', () => {
    let set: ReadonlySet<number> = new Set();
    set = toggleReminder(set, 1);
    set = toggleReminder(set, 2);
    set = toggleReminder(set, 1); // 取消
    set = toggleReminder(set, 1); // 再添加
    expect([...set].sort()).toEqual([1, 2]);
  });
});

describe('dueReminders：站内到期提醒', () => {
  const reminders: Reminder[] = [
    { eventId: 1, timing: 'start' },
    { eventId: 2, timing: 'day-before' },
    { eventId: 3, timing: 'start' },
    { eventId: 4, timing: 'start' }
  ];
  const today = '2026-10-21';

  test('开始时提醒当天到期，提前一天提醒前一天到期', () => {
    const due = dueReminders(reminders, events, today);
    const ids = due.map(d => d.eventId).sort();
    expect(ids).toEqual([1, 2]); // 1 当天开始；2 明天开始、提前一天
  });

  test('已结束的活动不再提醒', () => {
    const due = dueReminders(reminders, events, today);
    expect(due.some(d => d.eventId === 4)).toBe(false);
  });

  test('同一天同一提醒不重复返回', () => {
    const due = dueReminders(reminders, events, today);
    const ids = due.map(d => `${d.eventId}:${d.timing}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
