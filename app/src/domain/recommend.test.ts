import { describe, expect, test } from 'vitest';
import { recommend, resolveConditions } from './recommend';

describe('recommend：预算与人数规则', () => {
  test('团餐用整单总价核对预算，正餐每人一份', () => {
    const r = recommend({ budget: 180, people: 6, mode: 'meal', variation: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBeLessThanOrEqual(180);
    const mains = r.items.filter(i => i.main).reduce((s, i) => s + i.quantity, 0);
    expect(mains).toBe(6);
  });

  test('预算无法覆盖人数时返回最低缺口，不生成超预算套餐', () => {
    const r = recommend({ budget: 30, people: 6, mode: 'meal', variation: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.minimum).toBe(108);
    expect(r.message).toContain('108');
  });

  test('人数必须是 1–100 的整数，预算必须为正且有限', () => {
    const bad: Array<[number, number]> = [[0, 1], [-5, 1], [30, 0], [30, 1.5], [30, 101], [NaN, 2], [Infinity, 2]];
    for (const [budget, people] of bad) {
      expect(recommend({ budget, people, mode: 'meal', variation: 0 }).ok).toBe(false);
    }
  });

  test('换一套在存在多个候选时改变结果，且仍不超预算', () => {
    const first = recommend({ budget: 180, people: 6, mode: 'meal', variation: 0 });
    const next = recommend({ budget: 180, people: 6, mode: 'meal', variation: 1 });
    expect(first.ok && next.ok).toBe(true);
    if (!first.ok || !next.ok) return;
    expect(first.name).not.toBe(next.name);
    expect(next.total).toBeLessThanOrEqual(180);
  });

  test('分享小食模式按人数给份数', () => {
    const r = recommend({ budget: 100, people: 5, mode: 'snack', variation: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0].quantity).toBe(5);
    expect(r.items[0].main).toBe(false);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  test('盲盒重抽避免紧邻重复；只有一种候选时如实提示', () => {
    const first = recommend({ budget: 200, people: 6, mode: 'meal', variation: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = recommend({ budget: 200, people: 6, mode: 'meal', variation: 0, excludeName: first.name });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    if (first.candidateCount > 1) expect(again.name).not.toBe(first.name);

    // 预算只够一种候选时，candidateCount 为 1，不做伪随机
    const tight = recommend({ budget: 108, people: 6, mode: 'meal', variation: 0, excludeName: '经典鸡肉开饭局' });
    expect(tight.ok).toBe(true);
    if (!tight.ok) return;
    expect(tight.candidateCount).toBe(1);
    expect(tight.name).toBe('经典鸡肉开饭局');
  });
});

describe('resolveConditions：盲盒/团餐输入的可见默认规则', () => {
  test('只给预算：沿用可见人数（默认 1 人）', () => {
    const c = resolveConditions({ budget: 50, people: 1, perPersonPreset: 30 });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.totalBudget).toBe(50);
    expect(c.people).toBe(1);
  });

  test('只改人数：总预算 = 可见人均预算预设 × 人数', () => {
    const c = resolveConditions({ people: 4, perPersonPreset: 30 });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.totalBudget).toBe(120);
    expect(c.assumptions.some(a => a.includes('人均'))).toBe(true);
  });

  test('两者都给：总预算是上限，人数决定份数，不暗中推断人数', () => {
    const c = resolveConditions({ budget: 150, people: 5, perPersonPreset: 30 });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.totalBudget).toBe(150);
    expect(c.people).toBe(5);
  });

  test('非法输入被拒绝并给出原因', () => {
    expect(resolveConditions({ budget: -1, people: 2, perPersonPreset: 30 }).ok).toBe(false);
    expect(resolveConditions({ people: 0, perPersonPreset: 30 }).ok).toBe(false);
    expect(resolveConditions({ people: 2.5, perPersonPreset: 30 }).ok).toBe(false);
  });
});
