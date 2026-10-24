import { expect, test } from 'vitest';
import { parseMenu, parseStores, defaultItem, parseQuote, candidateBaskets } from './menu';

test('菜单以编码去重合并标签，价格转换成整数分', () => {
  const items = parseMenu({ categories: [{ name: '主食', meals: [{ code: 'a', tags: ['单品'] }] }, { name: '新品', meals: [{ code: 'a', tags: ['上新'] }] }], meals: { a: { name: '鸡腿堡', currentPrice: '17.80' } } });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ code: 'a', cents: 1780, tags: ['单品', '上新'] });
});
test('未知价格不当零价，未知菜单格式拒绝', () => {
  expect(parseMenu({ categories: [], meals: { a: { name: '商品', currentPrice: '' } } })[0].cents).toBeNull();
  expect(() => parseMenu({ wrong: true })).toThrow();
});
test('门店保留所有预约选项和营业状态，不猜测用户地址', () => {
  expect(parseStores([{ storeCode: '1', storeName: '门店', address: '公开地址', businessStatus: false, reservationTimeOptions: [{ date: '2026-10-25', reservationOptionText: '午餐10:45至14:15' }] }])[0]).toMatchObject({ code: '1', open: false, slots: ['2026-10-25 午餐10:45至14:15'] });
});
test('默认套餐组件和未选特调均传入整单核价', () => {
  const item = defaultItem({ code: 'a', rounds: [{ id: 1, minQuantity: 1, maxQuantity: 1, choices: [{ code: 'b', isDefault: 1, quantity: 1 }] }], modification: { items: [{ values: [{ code: 'sauce', selectedQuantity: 0, unselectedKey: 'off', selectedKey: 'on' }] }] } }, 3);
  expect(item).toMatchObject({ productCode: 'a', quantity: 3, roundList: [{ round: '1', comboItemList: [{ code: 'b', quantity: 1 }] }], modification: { values: [{ code: 'sauce', key: 'off', quantity: 0 }] } });
});
test('缺少套餐必选默认项时拒绝自动搭配', () => {
  expect(() => defaultItem({ code: 'a', rounds: [{ id: 1, minQuantity: 1, choices: [] }] }, 1)).toThrow();
});
test('整单价按分验证，明细必须与请求数量编码相符', () => {
  const items = [{ productCode: 'a', quantity: 3 }];
  expect(parseQuote({ price: 7050, productList: [{ productCode: 'a', quantity: 3, productName: '板烧' }] }, items, 7100).cents).toBe(7050);
  expect(() => parseQuote({ price: 7050 }, items, 7000)).toThrow(/预算/);
  expect(() => parseQuote({ price: 7000, productList: [{ productCode: 'a', quantity: 1 }] }, items, 8000)).toThrow(/明细/);
  expect(() => parseQuote({ price: -1 }, items)).toThrow();
});
test('推荐先保证每人主食，按整数分筛预算，不纳入随单购或套餐层叠', () => {
  const menu = parseMenu({ categories: [{ name: '鸡肉汉堡', meals: [{ code: 'a', tags: ['单品'] }] }, { name: '饮品', meals: [{ code: 'd', tags: ['冷饮'] }] }], meals: { a: { name: '鸡腿堡', currentPrice: '17.8' }, d: { name: '茶饮', currentPrice: '7.5' } } });
  expect(candidateBaskets(menu, 3, 5340, 'meal')[0]).toEqual([{ code: 'a', quantity: 3 }]);
  expect(candidateBaskets(menu, 3, 5339, 'meal')).toEqual([]);
});
test('有预算配小食时优先完整组合，不重复套用套餐或会员价',()=>{
 const menu=parseMenu({categories:[],meals:{a:{name:'鸡腿堡',currentPrice:'18'},b:{name:'玉米杯',currentPrice:'5'},c:{name:'鸡腿堡三件套',currentPrice:'10'}}});
 const baskets=candidateBaskets(menu,2,5000,'meal');
 expect(baskets.length).toBeGreaterThan(0);expect(baskets.every(b=>b.length===2)).toBe(true);
 expect(baskets.every(b=>b.every(i=>i.code!=='c'))).toBe(true);
});
test('默认组件数量缺失或非正整数时拒绝，不自行补成一份',()=>{
 for(const quantity of [undefined,0,-1,1.5])expect(()=>defaultItem({code:'a',rounds:[{id:1,choices:[{code:'b',isDefault:1,quantity}]}]},1)).toThrow();
});
