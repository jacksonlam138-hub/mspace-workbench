import { callTool, extractText } from './mcp';
import { extractOriginalJson } from '../domain/mcd-parsers';
import { defaultItem, parseQuote, type BasketLine, type StoreSelection } from '../domain/menu';

export async function readToolData(name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await callTool(name, args);
  if (!response.ok) throw new Error(response.error?.message ?? '查询失败');
  const body = extractOriginalJson(extractText(response.result) ?? '');
  if (!body || body.success === false || (typeof body.code === 'number' && ![0, 200].includes(body.code))) throw new Error(typeof body?.message === 'string' ? body.message : '响应格式无法识别');
  if (!('data' in body)) throw new Error('响应缺少数据');
  return body.data;
}
export function menuContext(selection: StoreSelection): Record<string, unknown> {
  return { storeCode: selection.store.code, beType: 1, orderType: 1, ...(selection.reservationDate ? { reservationDate: selection.reservationDate.replace('T', ' ') } : {}) };
}
export async function quoteBasket(selection: StoreSelection, lines: BasketLine[], budgetCents?: number) {
  const context = menuContext(selection);
  const details = await Promise.all(lines.map(line => readToolData('query-meal-detail', { ...context, code: line.code })));
  const items = details.map((detail, index) => defaultItem(detail, lines[index].quantity));
  const result = await readToolData('calculate-price', { ...context, items });
  return parseQuote(result, items, budgetCents);
}
