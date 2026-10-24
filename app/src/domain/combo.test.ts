import { describe, expect, test } from 'vitest';
import { comboTotals, isVerifiedCombo, type ComboItem } from './combo';

const burger: ComboItem = { skuId: 'sku-1', label: '鸡肉汉堡', quantity: 1, price: 20, kcal: 420, protein: 25 };
const corn: ComboItem = { skuId: 'sku-2', label: '玉米杯', quantity: 2, price: 6, kcal: 80, protein: 3 };

describe('comboTotals：组合汇总', () => {
  test('按份数汇总价格与营养，不漏乘', () => {
    const t = comboTotals([burger, corn]);
    expect(t.price).toBe(20 + 6 * 2);
    expect(t.kcal).toBe(420 + 80 * 2);
    expect(t.protein).toBe(25 + 3 * 2);
  });

  test('同一 SKU 不允许重复出现，防止套餐与组件重复计价', () => {
    expect(() => comboTotals([burger, { ...burger }])).toThrow(/重复/);
  });

  test('价格或份数非法时报错，不产出错误合计', () => {
    expect(() => comboTotals([{ ...burger, price: -1 }])).toThrow();
    expect(() => comboTotals([{ ...burger, quantity: 0 }])).toThrow();
  });
});

describe('isVerifiedCombo：缺少关键营养数据不得进入已核实目录', () => {
  test('全部组件具备热量与蛋白质才视为已核实', () => {
    expect(isVerifiedCombo([burger, corn])).toBe(true);
  });
  test('任一组件缺关键营养即未核实', () => {
    expect(isVerifiedCombo([burger, { ...corn, kcal: undefined }])).toBe(false);
    expect(isVerifiedCombo([{ ...burger, protein: undefined }])).toBe(false);
  });
});

test('负数和非有限营养不能计入总量或标成已核实，零值有效', () => {
  for (const invalid of [-1, NaN, Infinity, -Infinity]) {
    for (const nutrient of ['kcal', 'protein']) {
      const item = { ...burger, [nutrient]: invalid };
      expect(isVerifiedCombo([item])).toBe(false);
      expect(() => comboTotals([item])).toThrow(/营养/);
    }
  }
  const zero = { ...burger, kcal: 0, protein: 0 };
  expect(isVerifiedCombo([zero])).toBe(true);
  expect(comboTotals([zero])).toMatchObject({ kcal: 0, protein: 0 });
});
