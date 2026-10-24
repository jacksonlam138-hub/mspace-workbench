/**
 * 盲盒 / 团餐的预算与份数规则。所有价格单位为人民币元。
 * 组合目录是演示数据（见 src/data/demo.ts），不代表官方当前供应与定价。
 */

export type RecommendMode = 'meal' | 'snack';

export interface ComboChoice {
  name: string;
  /** 每人一份的整份价格 */
  unit: number;
  label: string;
  art: 'burger' | 'fries' | 'drink' | 'nuggets' | 'meal';
}

export interface RecommendItem {
  label: string;
  price: number;
  quantity: number;
  art: ComboChoice['art'];
  main: boolean;
}

export type RecommendResult =
  | {
      ok: true;
      name: string;
      total: number;
      people: number;
      candidateCount: number;
      items: RecommendItem[];
    }
  | { ok: false; message: string; minimum?: number };

export interface RecommendInput {
  budget: number;
  people: number;
  mode: RecommendMode;
  variation: number;
  /** 盲盒重抽时排除紧邻上一次的结果 */
  excludeName?: string;
  /** 可注入的候选目录；默认使用演示目录 */
  choices?: Record<RecommendMode, ComboChoice[]>;
}

/** 演示候选目录。正式版由门店菜单与核价接口替换。 */
export const DEMO_CHOICES: Record<RecommendMode, ComboChoice[]> = {
  meal: [
    { name: '经典鸡肉开饭局', unit: 18, label: '鸡肉汉堡 + 茶饮', art: 'burger' },
    { name: '板烧充能开饭局', unit: 22, label: '板烧鸡腿堡 + 玉米杯', art: 'meal' },
    { name: '牛肉快乐开饭局', unit: 25, label: '牛肉汉堡 + 薯条 + 茶饮', art: 'burger' }
  ],
  snack: [
    { name: '下午茶分享局', unit: 12, label: '薯条 + 冰美式', art: 'fries' },
    { name: '甜蜜补给局', unit: 15, label: '苹果派 + 牛奶', art: 'drink' },
    { name: '快乐小食局', unit: 18, label: '鸡块 + 玉米杯', art: 'nuggets' }
  ]
};

export function recommend(input: RecommendInput): RecommendResult {
  const { budget, people, mode, variation, excludeName } = input;
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ok: false, message: '请输入有效预算（大于 0 的数字）。' };
  }
  if (!Number.isInteger(people) || people < 1 || people > 100) {
    return { ok: false, message: '人数需要是 1–100 之间的整数。' };
  }
  const catalog = input.choices ?? DEMO_CHOICES;
  const choices = catalog[mode];
  if (!choices.length) return { ok: false, message: '当前没有可用的候选组合。' };

  // Compare integer cents so a three-person total of 17.8 is exactly 53.40.
  const budgetCents = Math.round(budget * 100);
  const candidates = choices.filter(c => Math.round(c.unit * 100) * people <= budgetCents);
  if (!candidates.length) {
    const minimum = Math.min(...choices.map(c => Math.round(c.unit * 100))) * people / 100;
    return { ok: false, minimum, message: `当前演示组合至少需要 ¥${minimum}。可以增加预算或减少人数。` };
  }

  // 换一套 / 重抽：排除紧邻上一次的结果；只有一种候选时如实返回
  const pool =
    excludeName && candidates.length > 1 ? candidates.filter(c => c.name !== excludeName) : candidates;
  const index = Math.abs(Math.trunc(variation)) % pool.length;
  const candidate = pool[index];
  return {
    ok: true,
    name: candidate.name,
    total: Math.round(candidate.unit * 100) * people / 100,
    people,
    candidateCount: candidates.length,
    items: [
      {
        label: candidate.label,
        price: candidate.unit,
        quantity: people,
        art: candidate.art,
        main: mode === 'meal'
      }
    ]
  };
}

export interface ConditionsInput {
  budget?: number;
  people?: number;
  /** 界面上可见、可编辑的人均预算预设 */
  perPersonPreset: number;
}

export type ConditionsResult =
  | { ok: true; totalBudget: number; people: number; assumptions: string[] }
  | { ok: false; message: string };

/**
 * 盲盒与团餐共用的输入收敛规则：
 * - 只给预算：沿用可见的人数设置（默认 1 人）；
 * - 只给人数：总预算 = 可见人均预算预设 × 人数，并在 assumptions 中明示；
 * - 两者都给：总预算是上限，人数决定份数，绝不从预算暗中推断人数。
 */
export function resolveConditions(input: ConditionsInput): ConditionsResult {
  const assumptions: string[] = [];
  const people = input.people ?? 1;
  if (!Number.isInteger(people) || people < 1 || people > 100) {
    return { ok: false, message: '人数需要是 1–100 之间的整数。' };
  }
  if (input.people == null) assumptions.push('未指定人数，按默认 1 人计算。');

  let totalBudget: number;
  if (input.budget != null) {
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      return { ok: false, message: '请输入有效预算（大于 0 的数字）。' };
    }
    totalBudget = input.budget;
  } else {
    if (!Number.isFinite(input.perPersonPreset) || input.perPersonPreset <= 0) {
      return { ok: false, message: '人均预算预设无效。' };
    }
    totalBudget = Math.round(input.perPersonPreset * 100) * people / 100;
    assumptions.push(`未指定总预算，按可见人均预算 ¥${input.perPersonPreset} × ${people} 人计算。`);
  }
  return { ok: true, totalBudget, people, assumptions };
}
