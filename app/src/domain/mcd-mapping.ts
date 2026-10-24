/**
 * 真实 MCP 数据 → 六模块内容的映射层。
 * - 营养组合：精选目录里的品名必须能在 list-nutrition-foods 实际命中（精确名，含规格）；
 *   命中的用真实营养值重算合计并标注「真实营养数据」；未命中的组件剔除出组合，不强行配。
 * - 价格仍为演示字段（营养接口不含售价，禁止推断），UI 明示「价格未联调」。
 * - 新品：从 campaign-calendar 活动正文中的「上新/开售」信号映射，保留活动来源与日期；
 *   不虚构上市日期，无来源不挂新品。
 */
import type { McpEvent, McpFood } from './mcd-parsers';
import { findFoodByName } from './mcd-parsers';
import type { ComboItem } from './combo';

/* ---------------- 营养组合映射 ---------------- */

export interface ComboSpec {
  id: string;
  name: string;
  desc: string;
  category: '500 大卡内' | '蛋白质优选' | '主食配蔬果';
  mealType: '正餐' | '小食';
  /** 组件精确品名（须与营养表 productName 完全一致，含规格） */
  itemNames: Array<[name: string, qty: number]>;
  reason: string;
}

/** 精选组合目录（品名以 2026-10-25 实测营养表 158 条为准核对存在） */
export const COMBO_SPECS: ComboSpec[] = [
  {
    id: 'c1', name: '板烧轻能量餐', desc: '板烧鸡腿堡配小杯玉米杯与苹果片，一次选好三件。',
    category: '500 大卡内', mealType: '正餐',
    itemNames: [['板烧鸡腿堡', 1], ['小杯玉米杯', 1], ['苹果片', 1]],
    reason: '主食外配玉米与苹果，营养值按本次查询汇总。'
  },
  {
    id: 'c2', name: '深海鳕鱼正餐', desc: '双层深海鳕鱼堡配小杯玉米杯。',
    category: '主食配蔬果', mealType: '正餐',
    itemNames: [['双层深海鳕鱼堡', 1], ['小杯玉米杯', 1]],
    reason: '鱼肉主食配蔬菜小食的结构化搭配。'
  },
  {
    id: 'c3', name: '双牛蛋白组合', desc: '双层吉士汉堡与冰牛奶中杯。',
    category: '蛋白质优选', mealType: '正餐',
    itemNames: [['双层吉士汉堡', 1], ['冰牛奶中杯', 1]],
    reason: '牛肉主食搭配牛奶，蛋白质按当前规格与份数汇总。'
  },
  {
    id: 'c4', name: '麦满分早餐', desc: '猪柳蛋麦满分加热牛奶小杯。',
    category: '蛋白质优选', mealType: '正餐',
    itemNames: [['猪柳蛋麦满分', 1], ['热牛奶小杯', 1]],
    reason: '麦满分与牛奶的早餐搭配，营养值按本次查询汇总。'
  },
  {
    id: 'c5', name: '轻享小食刻', desc: '麦乐鸡 5 块与圆筒冰淇淋。',
    category: '500 大卡内', mealType: '小食',
    itemNames: [['麦乐鸡5块', 1], ['圆筒冰淇淋', 1]],
    reason: '热量较低部分因份量小，标注为小食而非正餐。'
  },
  {
    id: 'c6', name: '巨无霸经典餐', desc: '巨无霸配中薯条与无糖可乐中杯。',
    category: '主食配蔬果', mealType: '正餐',
    itemNames: [['巨无霸', 1], ['中薯条', 1], ['无糖可口可乐中杯', 1]],
    reason: '经典组合的营养透明版，各项数值按当前规格与份数汇总。'
  }
];

export interface ResolvedCombo {
  spec: ComboSpec;
  items: Array<ComboItem & { real: boolean }>;
  /** 真实营养合计（任一组件未命中即为 null，不展示假合计） */
  kcal: number | null;
  protein: number | null;
  /** 未能匹配真实营养的品名列表 */
  unmatched: string[];
}

/** 把组合目录映射到真实营养数据；未命中的组件进 unmatched，绝不使用示意值冒充 */
export function resolveCombos(foods: McpFood[]): ResolvedCombo[] {
  return COMBO_SPECS.map(spec => {
    const items: ResolvedCombo['items'] = [];
    const unmatched: string[] = [];
    let kcal = 0, protein = 0, complete = true;
    for (const [name, qty] of spec.itemNames) {
      const hit = findFoodByName(foods, name);
      if (hit.length !== 1) { // 0 条或同名多条（规格不明）都不强配
        unmatched.push(name);
        complete = false;
        continue;
      }
      const f = hit[0];
      if (f.energyKcal == null || f.protein == null) { unmatched.push(name); complete = false; continue; }
      kcal += f.energyKcal * qty;
      protein += f.protein * qty;
      items.push({ skuId: 'nut-' + name, label: name, quantity: qty, price: 0, kcal: f.energyKcal, protein: f.protein, real: true });
    }
    return {
      spec,
      items,
      kcal: complete ? kcal : null,
      protein: complete ? protein : null,
      unmatched
    };
  }).filter(rc => rc.items.length > 0); // 全部组件都无法映射的组合不展示
}

/* ---------------- 新品映射 ---------------- */

export interface NewProductLead {
  id: string;
  name: string;
  /** 活动正文首行作为介绍 */
  desc: string;
  /** 来源活动标题与日期组 */
  sourceTitle: string;
  sourceDays: string[];
  /** 从正文提取的开售线索（如 10月22日10:45开售），可能为 null；不虚构 */
  launchHint: string | null;
  imageUrl: string | null;
}

const NEW_SIGNAL = /上新|开售|正式发售|来袭|登场|上市/;

/**
 * 从活动日历提取新品线索：标题或正文含上新信号，且标题带「上新/开售/登场」优先。
 * 同名活动跨天只取一次；名称取标题去掉表情后的主句（截断到首个标点前），避免整句当品名。
 */
export function extractNewProductLeads(events: McpEvent[]): NewProductLead[] {
  const leads: NewProductLead[] = [];
  for (const ev of events) {
    const titleHasSignal = /上新|开售|发售|登场|上市/.test(ev.title);
    const descHasSignal = NEW_SIGNAL.test(ev.description);
    if (!titleHasSignal && !descHasSignal) continue;
    if (/派对|会员日|优惠预告|学期卡|图书|亲子/.test(ev.title)) continue; // 非商品类活动
    const nameMatch = ev.title.replace(/[🔥❤️✨🫐🍫🥳🩶💳~！!？?]+/g, '').trim();
    const name = nameMatch.split(/[，。！!？?—\-–]/)[0].slice(0, 24) || nameMatch.slice(0, 24);
    const launch = ev.description.match(/(\d{1,2}月\d{1,2}日\s*(?:\d{1,2}[:：]\d{2})?\s*(?:起)?(?:正式)?[开上][售市])/) || null;
    leads.push({
      id: ev.id + '-lead',
      name,
      desc: ev.description.split('\n')[0].slice(0, 60),
      sourceTitle: ev.title,
      sourceDays: ev.days,
      launchHint: launch ? launch[1] : null,
      imageUrl: ev.imageUrls[0] ?? null
    });
  }
  // 同名去重
  const seen = new Set<string>();
  return leads.filter(l => (seen.has(l.name) ? false : (seen.add(l.name), true)));
}
