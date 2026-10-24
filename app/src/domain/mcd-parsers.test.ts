import { describe, expect, test } from 'vitest';
import {
  parseTimeInfo, parseCampaignCalendar, parseNutritionFoods, findFoodByName,
  statusOf, beijingToday, extractOriginalJson
} from './mcd-parsers';

const CAL_SAMPLE = `### 当前时间：2026-10-25 01:25:24
### 活动列表：

#### 2026年10月25日 今日

-   **活动标题**：麦当劳「我就喜欢」限定丝巾正式开售🔥
    **活动内容介绍**：丝巾搭配棒球帽的潮流谁懂😎
任意餐品消费加 39.9 元即可得
10月22日10:45开售
    **活动图片介绍**：
    <img src="https://cms-cdn.mcd.cn/img/a.jpg" alt="" height="300" width="auto">

-   **活动标题**：韩式风味蘸酱上新❤️
    **活动内容介绍**：韩式辣椒黄油风味酱
    **活动图片介绍**：
    <img src="https://cms-cdn.mcd.cn/img/b.jpg" alt="" height="300">

#### 2026年10月26日

-   **活动标题**：韩式风味蘸酱上新❤️
    **活动内容介绍**：韩式辣椒黄油风味酱
    **活动图片介绍**：

#### 2026年10月30日

-   **活动标题**：麦当劳「我就喜欢」限定丝巾正式开售🔥
    **活动内容介绍**：丝巾搭配棒球帽的潮流谁懂😎
    **活动图片介绍**：
`;

const NUT_SAMPLE = `## 餐品营养数据

Original Response

{"success":true,"code":200,"message":"请求成功","datetime":"2026-10-25 01:25:48","data":"[4]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\\n  板烧鸡腿堡,null,1638,391,23,17,35,1041,93\\n  小杯玉米杯,null,223,53,2,1,7,1,6\\n  小杯玉米杯,null,223,53,2,1,7,1,6\\n  无糖可口可乐中杯,null,0,0,0,0,1,35,0"}`;

const TIME_SAMPLE = `## 当前时间信息

Original Response

{"success":true,"code":200,"data":{"timestamp":1792862775651,"datetime":"2026-10-25T01:26:15.651","formatted":"2026-10-25 01:26:15","date":"2026-10-25","year":2026,"month":10,"day":25,"dayOfWeek":"SUNDAY","timezone":"GMT+08:00"}}`;

describe('parseTimeInfo', () => {
  test('从 Original Response JSON 提取北京时间日期', () => {
    const t = parseTimeInfo(TIME_SAMPLE);
    expect(t?.date).toBe('2026-10-25');
    expect(t?.dayOfWeek).toBe('SUNDAY');
  });
  test('无 JSON 时从 Markdown 头部兜底', () => {
    expect(parseTimeInfo('### 当前时间：2026-10-25 01:25:24\n### 活动列表：')?.date).toBe('2026-10-25');
  });
});

describe('parseCampaignCalendar', () => {
  const { todayHint, events } = parseCampaignCalendar(CAL_SAMPLE);

  test('同标题跨组去重合并 days，不当作不同活动', () => {
    expect(events.length).toBe(2);
    const silk = events.find(e => e.title.includes('丝巾'))!;
    expect(silk.days).toEqual(['2026-10-25', '2026-10-30']);
    const sauce = events.find(e => e.title.includes('蘸酱'))!;
    expect(sauce.days).toEqual(['2026-10-25', '2026-10-26']);
  });

  test('解析内容介绍与图片、今日提示', () => {
    expect(todayHint).toBe('2026-10-25');
    const silk = events.find(e => e.title.includes('丝巾'))!;
    expect(silk.description).toContain('任意餐品消费加 39.9 元即可得');
    expect(silk.description).toContain('10月22日10:45开售');
    expect(silk.imageUrls).toEqual(['https://cms-cdn.mcd.cn/img/a.jpg']);
    expect(events.every(e => e.id)).toBe(true);
  });

  test('只标注日期收录归属，不推断活动起止', () => {
    const silk = events.find(e => e.title.includes('丝巾'))!;
    expect(statusOf(silk, '2026-10-25')).toBe('今日收录');
    expect(statusOf(silk, '2026-10-24')).toBe('后续日历');
    expect(statusOf(silk, '2026-10-31')).toBe('历史收录');
  });

  test('同一活动在多个日期组天数点标记齐全', () => {
    const silk = events.find(e => e.title.includes('丝巾'))!;
    expect(silk.days).toHaveLength(2);
  });
});

describe('parseNutritionFoods', () => {
  const foods = parseNutritionFoods(NUT_SAMPLE);
  test('解析 TOON 表并去除完全重复行', () => {
    expect(foods.length).toBe(3); // 4 行去掉 1 条重复
    expect(findFoodByName(foods, '板烧鸡腿堡')[0]).toMatchObject({ energyKcal: 391, protein: 23 });
    expect(findFoodByName(foods, '小杯玉米杯')[0]).toMatchObject({ energyKcal: 53, protein: 2 });
    expect(findFoodByName(foods, '无糖可口可乐中杯')[0]).toMatchObject({ energyKcal: 0, protein: 0 });
  });
  test('列数不符的行被丢弃，不强行配对', () => {
    const bad = 'x'.repeat(0) + '{"data":"[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\\n  名字不对,列数,不足"}';
    expect(parseNutritionFoods(bad)).toHaveLength(0);
  });
  test('同名不同规格不合并（返回全部匹配）', () => {
    const dup = '{"data":"[2]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\\n  薯条,大,1587,379,6,16,50,216,23\\n  薯条,小,877,210,3,9,28,120,13"}';
    const list = findFoodByName(parseNutritionFoods(dup), '薯条');
    expect(list.length).toBe(2);
    expect(list[0].energyKcal).toBe(379);
    expect(list[1].energyKcal).toBe(210);
  });
});

describe('beijingToday', () => {
  test('UTC 时间换算为北京时间日期', () => {
    expect(beijingToday(new Date('2026-10-24T17:30:00Z'))).toBe('2026-10-25'); // UTC 24 日 17:30 = 北京 25 日 01:30
    expect(beijingToday(new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-25');
    expect(beijingToday(new Date('2026-10-24T10:00:00Z'))).toBe('2026-10-24');
  });
});

describe('extractOriginalJson', () => {
  test('括号配对处理嵌套与字符串内花括号', () => {
    const text = '说明 {"a":"包含{花括号}","b":{"c":1}} 结尾';
    const json = extractOriginalJson(text);
    expect(json).toEqual({ a: '包含{花括号}', b: { c: 1 } });
  });
});
