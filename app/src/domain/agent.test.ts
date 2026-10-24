import { expect, test } from 'vitest';
import { formArguments, toolSummary } from './agent';
test('表单保留已填参数、正确转换整数和数组，不将空值传给工具',()=>{
 expect(formArguments({beType:{type:'integer'},city:{type:'string'},items:{type:'array'},unused:{type:'string'}},{beType:'1',city:'北京',items:'[{"productCode":"1","quantity":2}]',unused:''})).toEqual({beType:1,city:'北京',items:[{productCode:'1',quantity:2}]});
 expect(()=>formArguments({beType:{type:'integer'}},{beType:'1.5'})).toThrow();
});
test('真实时间摘要不显示英文API说明，原始文本保留以便展开',()=>{
 const raw='API documentation\nOriginal Response\n{"success":true,"data":{"date":"2026-10-25","formatted":"2026-10-25 12:00:00"}}';
 const result=toolSummary('now-time-info',{content:[{type:'text',text:raw}]});
 expect(result.ok).toBe(true);expect(result.text).toBe('北京时间：2026-10-25 12:00:00');expect(result.raw).toBe(raw);
});
test('业务失败不标记查询成功',()=>{
 expect(toolSummary('query-meals',{content:[{type:'text',text:'Original Response\n{"success":false,"code":400,"message":"门店无效"}'}]})).toMatchObject({ok:false,text:'门店无效'});
});
