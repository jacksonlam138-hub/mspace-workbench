/**
 * 演示数据。所有活动、商品、营养、价格均为虚构或示意，不代表官方当前供应。
 * 真实数据模式下由服务端 MCP 适配提供，演示与真实在 UI 中明确区分。
 */
import type { CalendarEvent } from '../domain/reminders';
import type { ComboItem } from '../domain/combo';
import type { FoodType } from '../icons';

export interface DemoEvent extends CalendarEvent {
  desc: string;
  type: '新品上架' | '会员福利' | '特别活动';
  art: FoodType;
  status: '进行中' | '即将开始' | '已结束';
}

/** 演示月份为 2026 年 10 月；其他月份无演示数据时如实提示 */
export const DEMO_MONTH = { year: 2026, month: 10 };

export const DEMO_EVENTS: DemoEvent[] = [
  { id: 1, title: '周三，给自己加一份快乐', desc: '午后小食灵感 · 10 月 21 日 14:00–17:00', type: '会员福利', art: 'fries', status: '进行中', startDay: '2026-10-21', endDay: '2026-10-21' },
  { id: 2, title: '秋日新品，准备好第一口', desc: '秋日风味上新 · 10 月 23 日–31 日', type: '新品上架', art: 'burger', status: '即将开始', startDay: '2026-10-23', endDay: '2026-10-31' },
  { id: 3, title: '1024 灵感补给日', desc: '和热爱代码的你，一起脑洞全开 · 10 月 24 日', type: '特别活动', art: 'meal', status: '即将开始', startDay: '2026-10-24', endDay: '2026-10-24' },
  { id: 4, title: '周一，开启轻松一周', desc: '会员专属灵感菜单 · 10 月 26 日', type: '会员福利', art: 'drink', status: '即将开始', startDay: '2026-10-26', endDay: '2026-10-26' },
  { id: 5, title: '周末见，快乐一起分享', desc: '好友相聚，来一份分享小食 · 10 月 30 日–31 日', type: '特别活动', art: 'nuggets', status: '即将开始', startDay: '2026-10-30', endDay: '2026-10-31' }
];

export interface DemoProduct {
  id: string;
  name: string;
  desc: string;
  category: '汉堡' | '小食' | '饮品';
  price: number;
  art: FoodType;
  tone: '' | 'mint' | 'rose' | 'blue';
  tag: string;
  source: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: 'p1', name: '秋日香烤鸡腿堡', desc: '香烤鸡腿与爽脆生菜，秋天的第一口新鲜灵感。', category: '汉堡', price: 23, art: 'burger', tone: '', tag: '秋日限定', source: '演示维护目录 · 未关联门店商品，仅作资讯' },
  { id: 'p2', name: '金黄脆薯分享盒', desc: '外脆内软，分享快乐也分享最后一根。', category: '小食', price: 16, art: 'fries', tone: 'mint', tag: '分享新选择', source: '演示维护目录 · 未关联门店商品，仅作资讯' },
  { id: 'p3', name: '桂香轻乳拿铁', desc: '一缕桂香，一口绵密，给忙碌按下暂停键。', category: '饮品', price: 19, art: 'drink', tone: 'rose', tag: '季节灵感', source: '演示维护目录 · 未关联门店商品，仅作资讯' },
  { id: 'p4', name: '酥香鸡块小食盒', desc: '一口一个的小确幸，适合聊天时慢慢分享。', category: '小食', price: 18, art: 'nuggets', tone: 'blue', tag: '尝鲜推荐', source: '演示维护目录 · 未关联门店商品，仅作资讯' }
];

export type ComboCategory = '500 大卡内' | '蛋白质优选' | '主食配蔬果';

export interface DemoCombo {
  id: string;
  name: string;
  desc: string;
  category: ComboCategory;
  mealType: '正餐' | '小食';
  art: FoodType;
  tone: '' | 'mint' | 'rose' | 'blue';
  sourceType: '项目自配组合（演示）' | '官方套餐引用（演示）' | '项目自配组合（真实营养）';
  reason: string;
  items: ComboItem[];
}

export const DEMO_COMBOS: DemoCombo[] = [
  {
    id: 'm1', name: '板烧蔬果搭配', desc: '鸡肉汉堡、玉米杯与苹果片，一次选好三件。', category: '主食配蔬果', mealType: '正餐',
    art: 'meal', tone: 'mint', sourceType: '项目自配组合（演示）', reason: '主食之外配玉米与苹果，帮助理解搭配结构。',
    items: [
      { skuId: 'sku-101', label: '板烧鸡腿堡', quantity: 1, price: 18, kcal: 380, protein: 22 },
      { skuId: 'sku-201', label: '玉米杯', quantity: 1, price: 6, kcal: 80, protein: 3 },
      { skuId: 'sku-301', label: '苹果片', quantity: 1, price: 4, kcal: 26, protein: 1 }
    ]
  },
  {
    id: 'm2', name: '鸡肉蛋白组合', desc: '鸡肉主食搭配牛奶，适合想多一点蛋白质的你。', category: '蛋白质优选', mealType: '正餐',
    art: 'burger', tone: '', sourceType: '项目自配组合（演示）', reason: '在同类正餐候选中蛋白质相对更高，非仅靠加量。',
    items: [
      { skuId: 'sku-102', label: '鸡肉汉堡', quantity: 1, price: 20, kcal: 420, protein: 25 },
      { skuId: 'sku-302', label: '牛奶', quantity: 1, price: 10, kcal: 145, protein: 10 }
    ]
  },
  {
    id: 'm3', name: '轻巧鱼堡餐', desc: '鱼堡配玉米与茶饮，简单的一餐也有好搭配。', category: '500 大卡内', mealType: '正餐',
    art: 'meal', tone: 'blue', sourceType: '官方套餐引用（演示）', reason: '参考官方 500 大卡系列思路的组合示意。',
    items: [
      { skuId: 'sku-103', label: '鱼肉汉堡', quantity: 1, price: 18, kcal: 378, protein: 19 },
      { skuId: 'sku-201', label: '玉米杯', quantity: 1, price: 6, kcal: 80, protein: 3 },
      { skuId: 'sku-303', label: '茶饮', quantity: 1, price: 2, kcal: 0, protein: 0 }
    ]
  },
  {
    id: 'm4', name: '牛肉能量补给', desc: '牛肉汉堡与牛奶，配一份清甜苹果。', category: '蛋白质优选', mealType: '正餐',
    art: 'burger', tone: 'rose', sourceType: '项目自配组合（演示）', reason: '牛肉与牛奶的蛋白质组合，按实际组成标注。',
    items: [
      { skuId: 'sku-104', label: '牛肉汉堡', quantity: 1, price: 20, kcal: 450, protein: 24 },
      { skuId: 'sku-302', label: '牛奶', quantity: 1, price: 8, kcal: 118, protein: 8 },
      { skuId: 'sku-301', label: '苹果片', quantity: 1, price: 4, kcal: 26, protein: 1 }
    ]
  },
  {
    id: 'm5', name: '午后轻食时刻', desc: '玉米、苹果与牛奶。小食搭配，不作为完整正餐。', category: '500 大卡内', mealType: '小食',
    art: 'drink', tone: 'mint', sourceType: '项目自配组合（演示）', reason: '热量较低是因为份量小，已标注为小食而非正餐。',
    items: [
      { skuId: 'sku-201', label: '玉米杯', quantity: 1, price: 6, kcal: 80, protein: 3 },
      { skuId: 'sku-301', label: '苹果片', quantity: 1, price: 4, kcal: 26, protein: 1 },
      { skuId: 'sku-302', label: '牛奶', quantity: 1, price: 8, kcal: 118, protein: 8 }
    ]
  },
  {
    id: 'm6', name: '清爽鸡肉午餐', desc: '鸡肉汉堡配玉米杯，再来一份脆甜苹果。', category: '主食配蔬果', mealType: '正餐',
    art: 'meal', tone: '', sourceType: '项目自配组合（演示）', reason: '主食加蔬果的结构化搭配示意。',
    items: [
      { skuId: 'sku-102', label: '鸡肉汉堡', quantity: 1, price: 19, kcal: 430, protein: 26 },
      { skuId: 'sku-201', label: '玉米杯', quantity: 1, price: 6, kcal: 80, protein: 3 },
      { skuId: 'sku-301', label: '苹果片', quantity: 1, price: 4, kcal: 26, protein: 1 }
    ]
  }
];

export const QUICK_CHATS = ['看看我的优惠券', '积分能兑换什么？', '帮我查一下订单', '你都能帮我做什么？'];

/** 演示对话脚本。正式版由 MAgent 调用真实工具；此处明确标注为模拟回复。 */
export function scriptedReply(text: string): string {
  if (/券|优惠/.test(text)) return '我为你准备了 3 张演示优惠券：\n• 早餐组合券：示意优惠 ¥5\n• 咖啡体验券：示意优惠 ¥3\n• 小食分享券：示意优惠 ¥6\n\n这里没有读取你的真实账户。正式版会展示券的适用门店与使用条件。';
  if (/积分|兑换/.test(text)) return '演示账户有 1,024 积分。\n你可以继续问「有哪些可兑换商品」，体验兑换查询对话。\n\n实际积分、兑换库存和规则将在接入后查询，本版不会扣除积分。';
  if (/订单|下单|付款|支付|取消/.test(text)) return '这里是一份模拟订单状态：\n订单 DEMO-1024 · 待取餐\n鸡肉汉堡组合 × 1\n\n仅用于演示订单卡片信息，没有创建、支付或取消真实订单。';
  if (/新品/.test(text)) return '演示新品有秋日香烤鸡腿堡、桂香轻乳拿铁。\n你可以打开左侧「新品推荐」查看独立商品列表。\n\n这些是原型示例，不代表当前官方在售新品。';
  if (/帮|什么|能力/.test(text)) return '正式版计划支持：\n活动与新品、门店与菜单、营养信息、优惠券、点餐和订单、积分商城、积分抽奖，以及主题活动预约。\n\n这版只演示对话交互。你可以先试试优惠券、积分或订单问题。';
  return '收到你的想法。当前是本地脚本演示，不能实际处理这项请求。\n\n可以试试「我的优惠券」「查询积分」「查看订单」；正式版会由 MAgent 调用相应服务。';
}
