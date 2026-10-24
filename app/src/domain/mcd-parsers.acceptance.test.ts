import { expect, test } from 'vitest';
import { parseNutritionFoods, parseTimeInfo, parseCampaignCalendar, statusOf, type McpEvent } from './mcd-parsers';

const nutrition = (kcal: number, protein: number) =>
  `[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n餐品,null,0,${kcal},${protein},0,0,0,0`;

test('明确失败的响应不能借旧数据或日期文本恢复成功', () => {
  for (const failure of [{ success: false, code: 200 }, { success: true, code: 500 }]) {
    expect(parseTimeInfo('2026-10-25 12:00\nOriginal Response\n' + JSON.stringify({
      ...failure, data: { date: '2026-10-25' }
    }))).toBeNull();
    expect(parseNutritionFoods(JSON.stringify({ ...failure, data: nutrition(200, 10) }))).toEqual([]);
  }
});

test('负数营养视为缺失，零值仍为有效数据', () => {
  const invalid = parseNutritionFoods(JSON.stringify({ success: true, code: 200, data: nutrition(-24, -3) }));
  expect(invalid[0]).toMatchObject({ energyKcal: null, protein: null });
  const zero = parseNutritionFoods(JSON.stringify({ success: true, code: 200, data: nutrition(0, 0) }));
  expect(zero[0]).toMatchObject({ energyKcal: 0, protein: 0 });
});

test('不连续日期组不冒充连续活动时间，末次收录不等于活动结束', () => {
  const event: McpEvent = { id: 'test', title: '日历条目', description: '', imageUrls: [], days: ['2026-10-25', '2026-10-28'] };
  expect(statusOf(event, '2026-10-25')).toBe('今日收录');
  expect(statusOf(event, '2026-10-26')).toBe('后续日历');
  expect(statusOf(event, '2026-10-29')).toBe('历史收录');
});

test('未知日历格式和明确失败不能伪装成成功的空活动列表', () => {
  expect(parseCampaignCalendar('服务暂时异常').error).toBeTruthy();
  expect(parseCampaignCalendar('{"success":false,"data":[]}').error).toBeTruthy();
  expect(parseCampaignCalendar('### 活动列表：\n#### 2026年10月25日 今日\n- **活动标题**：新活动').error).toBeNull();
});

test('明确的成功空列表与格式失败区分，未来新增格式不盲猜', () => {
  expect(parseCampaignCalendar('{"success":true,"code":200,"data":[]}')).toMatchObject({ events: [], error: null });
  expect(parseCampaignCalendar('### 活动列表：\n未知新格式')).toMatchObject({ events: [] });
  expect(parseCampaignCalendar('### 活动列表：\n未知新格式').error).toBeTruthy();
});
