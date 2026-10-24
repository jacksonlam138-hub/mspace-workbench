/** Public store/menu boundaries. Prices are integer cents; identities come from MCP. */
export function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(record) : [];
const text = (v: unknown) => typeof v === 'string' ? v : '';
export interface Store { code: string; name: string; address: string; open: boolean; slots: string[] }
export interface StoreSelection { store: Store; reservationDate: string }
export interface MenuItem { code: string; name: string; image: string; cents: number | null; tags: string[]; categories: string[]; withOrder: boolean }
export interface BasketLine { code: string; quantity: number }
export interface Modification { values: { code: string; key: string; quantity: number }[] }
export interface PriceItem { productCode: string; quantity: number; modification?: Modification; roundList?: { round: string; comboItemList: { code: string; quantity: number; modification?: Modification }[] }[] }
export interface Quote { cents: number; lines: { code: string; name: string; quantity: number }[] }

export function parseStores(value: unknown): Store[] {
  if (!Array.isArray(value)) throw new Error('门店响应无法识别');
  return rows(value).filter(s => typeof s.storeCode === 'string' && typeof s.storeName === 'string').map(s => ({
    code: text(s.storeCode), name: text(s.storeName), address: text(s.address), open: s.businessStatus === true,
    slots: rows(s.reservationTimeOptions).map(o => `${text(o.date)}${o.today ? '（今天）' : ''} ${text(o.reservationOptionText)}`)
  }));
}
export function parseMenu(value: unknown): MenuItem[] {
  if (!record(value) || !record(value.meals) || !Array.isArray(value.categories)) throw new Error('菜单响应无法识别');
  return Object.entries(value.meals).filter(([, v]) => record(v) && typeof v.name === 'string').map(([code, v]) => {
    const meal = record(v) ? v : {};
    const cats = rows(value.categories).filter(c => rows(c.meals).some(m => m.code === code));
    const tags = cats.flatMap(c => rows(c.meals).filter(m => m.code === code).flatMap(m => Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === 'string') : []));
    const amount = typeof meal.currentPrice === 'string' && /^\d+(\.\d{1,2})?$/.test(meal.currentPrice) ? Math.round(Number(meal.currentPrice) * 100) : null;
    return { code, name: text(meal.name), image: text(meal.image), cents: amount !== null && Number.isSafeInteger(amount) ? amount : null, tags: [...new Set(tags)], categories: cats.map(c => text(c.name)), withOrder: meal.canWithOrder === true };
  });
}
function modification(value: unknown): Modification | undefined {
  if (!record(value)) return undefined;
  const values: Modification['values'] = [];
  for (const group of rows(value.items)) {
    for (const option of rows(group.values)) {
      const quantity = typeof option.selectedQuantity === 'number' ? option.selectedQuantity : 0;
      const key = quantity > 0 ? text(option.selectedKey) : text(option.unselectedKey);
      if (key) values.push({ code: text(option.code), key, quantity });
    }
  }
  return values.length ? { values } : undefined;
}
/** Preserve upstream default selections, including explicitly unselected modifications. */
export function defaultItem(value: unknown, quantity: number): PriceItem {
  if (!record(value) || typeof value.code !== 'string' || !Number.isInteger(quantity) || quantity < 1) throw new Error('商品详情或份数无效');
  const roundList = rows(value.rounds).map(round => {
    const comboItemList = rows(round.choices).filter(c => c.isDefault === 1).map(c => {
      if (typeof c.quantity !== 'number' || !Number.isInteger(c.quantity) || c.quantity < 1 || !text(c.code).trim()) throw new Error('套餐默认选项不完整，请在官方渠道选择规格');
      return { code: text(c.code), quantity: c.quantity, modification: modification(c.modification) };
    });
    const count = comboItemList.reduce((n, i) => n + i.quantity, 0);
    if (count < Number(round.minQuantity ?? 0) || count > Number(round.maxQuantity ?? Infinity)) throw new Error('套餐默认选项不完整，请在官方渠道选择规格');
    return { round: String(round.id), comboItemList };
  });
  return { productCode: value.code, quantity, modification: modification(value.modification), ...(roundList.length ? { roundList } : {}) };
}
export function parseQuote(value: unknown, requested: PriceItem[], budgetCents?: number): Quote {
  if (!record(value) || typeof value.price !== 'number' || !Number.isSafeInteger(value.price) || value.price < 0) throw new Error('核价未返回有效整单金额');
  if (budgetCents !== undefined && value.price > budgetCents) throw new Error('实际整单价格超过预算，请换一套或提高预算');
  const lines = rows(value.productList).map(p => ({ code: text(p.productCode), name: text(p.productName), quantity: Number(p.quantity) }));
  if (lines.length !== requested.length || requested.some(r => !lines.some(l => l.code === r.productCode && l.quantity === r.quantity))) throw new Error('核价明细与所选清单不一致，请重试');
  return { cents: value.price, lines };
}
export function candidateBaskets(menu: MenuItem[], people: number, budgetCents: number, mode: 'meal' | 'snack'): BasketLine[][] {
  if (!Number.isInteger(people) || people < 1 || people > 100 || !Number.isSafeInteger(budgetCents) || budgetCents <= 0) return [];
  const usable = menu.filter(m => m.cents != null && m.cents > 0 && !m.withOrder && !m.tags.includes('麦金卡') && !m.tags.includes('套餐') && !/套餐|件套|餐$|第二|\+|双人|多人|拼盘/.test(m.name));
  const main = usable.filter(m => mode === 'meal' ? /堡|汉堡|卷/.test(m.name) : /薯|麦乐鸡|鸡翅|派|鸡排/.test(m.name));
  const sides = usable.filter(m => /玉米|薯条|纯悦|牛奶|红茶/.test(m.name));
  const baskets: { lines: BasketLine[]; cents: number }[] = [];
  for (const m of main) {
    const cost = (m.cents ?? 0) * people;
    if (cost <= budgetCents) baskets.push({ lines: [{ code: m.code, quantity: people }], cents: cost });
    for (const side of sides) {
      if (side.code === m.code) continue;
      const total = cost + (side.cents ?? 0) * people;
      if (total <= budgetCents) baskets.push({ lines: [{ code: m.code, quantity: people }, { code: side.code, quantity: people }], cents: total });
    }
  }
  const maxItems = Math.max(0, ...baskets.map(b => b.lines.length));
  return baskets.filter(b => b.lines.length === maxItems).sort((a, b) => a.cents - b.cents).map(b => b.lines);
}
