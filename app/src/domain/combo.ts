/**
 * 营养套餐组合的汇总与核实规则。
 * 组合可以引用官方套餐 SKU，也可以是本项目搭配的多个 SKU（来源类型需标注）。
 * 套餐与组件不能重复计价：组合目录中的一行就是一个 SKU 条目，不允许同一 SKU 出现两次。
 */

export interface ComboItem {
  skuId: string;
  label: string;
  quantity: number;
  /** 单价（元） */
  price: number;
  /** 单份热量（千卡）。缺失时组合不得进入“已核实”营养目录 */
  kcal?: number;
  /** 单份蛋白质（克） */
  protein?: number;
}

export interface ComboTotals {
  price: number;
  kcal?: number;
  protein?: number;
  itemCount: number;
}

export function comboTotals(items: ComboItem[]): ComboTotals {
  const seen = new Set<string>();
  let price = 0;
  let kcal = 0;
  let protein = 0;
  let kcalComplete = true;
  let proteinComplete = true;
  let itemCount = 0;

  for (const item of items) {
    if (seen.has(item.skuId)) {
      throw new Error(`组合中 SKU 重复（${item.skuId}），疑似套餐与组件重复计价`);
    }
    seen.add(item.skuId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`份数必须是正整数（${item.label}）`);
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      throw new Error(`价格无效（${item.label}）`);
    }
    for (const nutrient of [item.kcal, item.protein]) {
      if (nutrient != null && (!Number.isFinite(nutrient) || nutrient < 0)) {
        throw new Error(`营养数值无效（${item.label}）`);
      }
    }
    price += item.price * item.quantity;
    itemCount += item.quantity;
    if (item.kcal == null) kcalComplete = false;
    else kcal += item.kcal * item.quantity;
    if (item.protein == null) proteinComplete = false;
    else protein += item.protein * item.quantity;
  }

  return {
    price: Math.round(price * 100) / 100,
    kcal: kcalComplete ? kcal : undefined,
    protein: proteinComplete ? protein : undefined,
    itemCount
  };
}

/** 缺少关键营养数据（热量/蛋白质）的组合不进入承诺已核实的营养目录 */
export function isVerifiedCombo(items: ComboItem[]): boolean {
  return items.length > 0 && items.every(i => [i.kcal, i.protein].every(v => v != null && Number.isFinite(v) && v >= 0));
}
