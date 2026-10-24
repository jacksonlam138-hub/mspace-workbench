import { expect, test } from 'vitest';
import { recommend, resolveConditions, type ComboChoice, type RecommendMode } from './recommend';

const choices = {
  meal: [{ name: '三人预算边界', unit: 17.8, label: '每人一份', art: 'meal' }],
  snack: []
} satisfies Record<RecommendMode, ComboChoice[]>;

test('金额按整数分比较：17.8元三份在53.40元内，超过53.39元', () => {
  expect(recommend({ budget: 53.4, people: 3, mode: 'meal', variation: 0, choices }))
    .toMatchObject({ ok: true, total: 53.4 });
  expect(recommend({ budget: 53.39, people: 3, mode: 'meal', variation: 0, choices }))
    .toMatchObject({ ok: false, minimum: 53.4 });
});

test('人均预设乘人数不产生多余的小数', () => {
  expect(resolveConditions({ people: 3, perPersonPreset: 17.8 }))
    .toMatchObject({ ok: true, totalBudget: 53.4 });
});
