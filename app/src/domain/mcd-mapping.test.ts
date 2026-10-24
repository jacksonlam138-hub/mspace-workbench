import { describe, expect, test } from 'vitest';
import { resolveCombos, extractNewProductLeads } from './mcd-mapping';
import type { McpEvent, McpFood } from './mcd-parsers';

const FOODS: McpFood[] = [
  { productName: '板烧鸡腿堡', nutritionDescription: null, energyKj: 1638, energyKcal: 391, protein: 23, fat: 17, carbohydrate: 35, sodium: 1041, calcium: 93 },
  { productName: '小杯玉米杯', nutritionDescription: null, energyKj: 223, energyKcal: 53, protein: 2, fat: 1, carbohydrate: 7, sodium: 1, calcium: 6 },
  { productName: '苹果片', nutritionDescription: null, energyKj: 135, energyKcal: 32, protein: 0, fat: 0, carbohydrate: 8, sodium: 3, calcium: 2 },
  { productName: '巨无霸', nutritionDescription: null, energyKj: 2147, energyKcal: 513, protein: 27, fat: 26, carbohydrate: 45, sodium: 1010, calcium: 128 },
  { productName: '中薯条', nutritionDescription: null, energyKj: 1210, energyKcal: 289, protein: 4, fat: 12, carbohydrate: 38, sodium: 165, calcium: 18 },
  { productName: '无糖可口可乐中杯', nutritionDescription: null, energyKj: 0, energyKcal: 0, protein: 0, fat: 0, carbohydrate: 1, sodium: 35, calcium: 0 },
  // 同名两条（不同规格不在本表区分时）：用于验证不强配
  { productName: '同名品', nutritionDescription: 'A', energyKj: 1, energyKcal: 10, protein: 1, fat: 1, carbohydrate: 1, sodium: 1, calcium: 1 },
  { productName: '同名品', nutritionDescription: 'B', energyKj: 2, energyKcal: 20, protein: 2, fat: 2, carbohydrate: 2, sodium: 2, calcium: 2 }
];

describe('resolveCombos：营养组合映射真实数据', () => {
  const resolved = resolveCombos(FOODS);

  test('组件全部命中的组合按真实值合计', () => {
    const c1 = resolved.find(r => r.spec.id === 'c1')!;
    expect(c1.unmatched).toEqual([]);
    expect(c1.kcal).toBe(391 + 53 + 32);
    expect(c1.protein).toBe(23 + 2 + 0);
    expect(c1.items.every(i => i.real)).toBe(true);
  });

  test('组件未命中时进 unmatched，合计为 null（不用示意值）', () => {
    const c2 = resolved.find(r => r.spec.id === 'c2')!; // 双层深海鳕鱼堡不在 FOODS
    expect(c2.unmatched).toContain('双层深海鳕鱼堡');
    expect(c2.kcal).toBeNull();
    // 命中的玉米杯仍在清单里，real 标记为 true
    expect(c2.items.some(i => i.label === '小杯玉米杯' && i.real)).toBe(true);
  });

  test('同名多条记录不强配（进 unmatched，不用任一值冒充）', () => {
    // 同名品 + 正常品混合：同名品进 unmatched，正常品保留
    const spec = {
      id: 'x', name: 'x', desc: '', category: '主食配蔬果' as const, mealType: '正餐' as const,
      itemNames: [['同名品', 1] as [string, number], ['板烧鸡腿堡', 1] as [string, number]], reason: ''
    };
    const results = resolveCombosWithSpecs(FOODS, [spec]);
    expect(results).toHaveLength(1);
    expect(results[0].unmatched).toEqual(['同名品']);
    expect(results[0].kcal).toBeNull();
    expect(results[0].items.map(i => i.label)).toEqual(['板烧鸡腿堡']);
  });

  test('全部组件无法映射的组合不展示', () => {
    const spec = { id: 'y', name: 'y', desc: '', category: '主食配蔬果' as const, mealType: '正餐' as const, itemNames: [['不存在的品', 1] as [string, number]], reason: '' };
    expect(resolveCombosWithSpecs(FOODS, [spec])).toHaveLength(0);
  });
});

// 暴露一个可注入 spec 的变体便于测试
import { COMBO_SPECS } from './mcd-mapping';
function resolveCombosWithSpecs(foods: McpFood[], specs: typeof COMBO_SPECS) {
  // 复用同一逻辑：临时替换全局目录（测试专用）
  const original = COMBO_SPECS.splice(0, COMBO_SPECS.length, ...specs);
  try {
    return resolveCombos(foods);
  } finally {
    COMBO_SPECS.splice(0, COMBO_SPECS.length, ...original);
  }
}

describe('extractNewProductLeads：新品线索来自活动来源', () => {
  const events: McpEvent[] = [
    {
      id: 'ev1', title: '韩式风味蘸酱上新❤️就「酱」心有所「薯」',
      description: '韩式辣椒黄油风味酱\n10月8日 10:30起正式开售⏰\n鸡薯双全盒仅需15.9元起',
      imageUrls: ['https://x/a.jpg'], days: ['2026-10-25', '2026-10-31']
    },
    {
      id: 'ev2', title: '🫐一口爆汁！蓝莓爆爆珠麦旋风上新',
      description: '蓝莓爆爆珠麦旋风\n10月X日上市', imageUrls: [], days: ['2026-11-03']
    },
    {
      id: 'ev3', title: '过家家派对上线，快来一起解锁梦想职业',
      description: '9月9日到店解锁过家家派对', imageUrls: [], days: ['2026-10-25']
    }
  ];

  test('提取带上新/开售信号的商品类活动，保留来源与日期', () => {
    const leads = extractNewProductLeads(events);
    const names = leads.map(l => l.name);
    expect(names.some(n => n.includes('韩式风味蘸酱'))).toBe(true);
    expect(names.some(n => n.includes('蓝莓爆爆珠麦旋风'))).toBe(true);
    const sauce = leads.find(l => l.name.includes('韩式风味蘸酱'))!;
    expect(sauce.sourceTitle).toContain('上新');
    expect(sauce.sourceDays).toEqual(['2026-10-25', '2026-10-31']);
    expect(sauce.launchHint).toContain('10月8日');
    expect(sauce.imageUrl).toBe('https://x/a.jpg');
  });

  test('非商品类活动（派对/亲子）不进新品', () => {
    const leads = extractNewProductLeads(events);
    expect(leads.some(l => l.sourceTitle.includes('过家家'))).toBe(false);
  });

  test('无开售日期时 launchHint 为 null，不虚构', () => {
    const leads = extractNewProductLeads(events);
    const berry = leads.find(l => l.sourceTitle.includes('蓝莓'))!;
    expect(berry.launchHint).toBeNull();
  });
});
