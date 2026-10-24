import { extractOriginalJson, parseCampaignCalendar, parseNutritionFoods, parseTimeInfo } from './mcd-parsers';
import { record } from './menu';

export function formArguments(properties: Record<string, unknown>, values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties)) {
    const value = values[key]?.trim();
    if (!value || !record(schema)) continue;
    if (schema.type === 'integer' || schema.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n) || (schema.type === 'integer' && !Number.isInteger(n))) throw new Error(`${key} 需要${schema.type === 'integer' ? '整数' : '数字'}`);
      result[key] = n;
    } else if (schema.type === 'boolean') {
      if (!['true','false'].includes(value)) throw new Error(`${key} 需要选择是或否`);
      result[key] = value === 'true';
    } else if (schema.type === 'array' || schema.type === 'object') {
      try { const parsed: unknown = JSON.parse(value); result[key] = parsed; }
      catch { throw new Error(`${key} 需要有效 JSON`); }
    } else result[key] = value;
  }
  return result;
}
export function toolSummary(name: string, result: unknown): { ok: boolean; text: string; raw: string } {
  const raw = record(result) && Array.isArray(result.content) ? result.content.filter(record).filter(c=>c.type==='text' && typeof c.text==='string').map(c=>c.text).join('\n') : '';
  const json = extractOriginalJson(raw);
  if (!raw || (record(result) && result.isError) || json?.success === false || (typeof json?.code === 'number' && ![0,200].includes(json.code))) return {ok:false,text:typeof json?.message==='string'?json.message:'查询失败或返回为空',raw};
  let text = '';
  if (name === 'now-time-info') { const time = parseTimeInfo(raw); text = time ? `北京时间：${time.formatted ?? time.date}` : ''; }
  else if (name === 'campaign-calendar') { const calendar = parseCampaignCalendar(raw); text = calendar.error ? '' : `查到 ${calendar.events.length} 个活动：\n${calendar.events.slice(0,6).map(e=>`${e.title}（${e.days.join('、')}）`).join('\n')}`; }
  else if (name === 'list-nutrition-foods') { const foods = parseNutritionFoods(raw); text = foods.length ? `查到 ${foods.length} 条去重营养记录。可在「营养套餐」直接选择组合。` : ''; }
  else if (Array.isArray(json?.data)) {
    text = `查到 ${json.data.length} 条记录。\n` + json.data.slice(0,8).filter(record).map(item=>[item.storeName,item.name,item.productName,item.title,item.address,item.storeCode].filter(v=>typeof v==='string').join(' · ')).filter(Boolean).join('\n');
  } else if (record(json?.data)) {
    text = Object.entries(json.data).filter(([,v])=>typeof v==='string'||typeof v==='number').slice(0,8).map(([k,v])=>`${k}：${v}`).join('\n') || '查询已返回结构化结果，可展开查看详情。';
  } else text = '查询已返回结果，可展开查看详情。';
  return {ok:!!text,text:text || '返回格式无法识别，请查看详情或重试',raw};
}
