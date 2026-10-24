import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, validateArguments } from './agent.mjs';
const tool = { name:'query-nearby-stores', inputSchema:{type:'object',properties:{beType:{type:'integer',enum:[1,5]},searchType:{type:'integer',enum:[1,2]},city:{type:'string'},keyword:{type:'string'}},required:['beType','searchType']} };
const allowed = new Set([tool.name]);
const call = args => ({role:'assistant',content:null,tool_calls:[{id:'call1',type:'function',function:{name:tool.name,arguments:JSON.stringify(args)}}]});
test('schema and conditional fields reject invalid arguments before upstream', () => {
 assert.ok(validateArguments(tool,{beType:'1',searchType:2}).length);
 assert.ok(validateArguments(tool,{beType:1,searchType:2}).length);
 assert.deepEqual(validateArguments(tool,{beType:1,searchType:2,city:'北京',keyword:'王府井'}),[]);
 assert.ok(validateArguments(tool,null).length);
});
test('missing arguments yield a resumable tool request without calling MCP',async()=>{
 let count=0;
 const result=await runAgent({messages:[{role:'user',content:'附近门店'}],tools:[tool],allowed,complete:async()=>call({beType:1,searchType:2}),execute:async()=>{count++;}});
 assert.equal(count,0); assert.equal(result.needsInput.tool,tool.name); assert.equal(result.needsInput.arguments.beType,1);
});
test('tool loop preserves call ID and passes result into final answer',async()=>{
 let count=0;
 const result=await runAgent({messages:[{role:'user',content:'北京王府井门店'}],tools:[tool],allowed,complete:async(messages)=>{
   count++; if(count===1)return call({beType:1,searchType:2,city:'北京',keyword:'王府井'});
   assert.equal(messages.at(-1).tool_call_id,'call1');assert.match(messages.at(-1).content,/门店A/);return {role:'assistant',content:'找到门店A'};
 },execute:async()=>({content:[{type:'text',text:'门店A'}]})});
 assert.equal(result.text,'找到门店A');assert.equal(result.calls.length,1);
});
test('unknown or write tool is never executed, even when model requests it',async()=>{
 let count=0;
 const result=await runAgent({messages:[],tools:[tool],allowed,complete:async()=>({tool_calls:[{id:'x',function:{name:'create-order',arguments:'{}'}}]}),execute:async()=>{count++;}});
 assert.equal(count,0);assert.match(result.text,/拒绝/);
});
test('tool loop ends at a fixed call limit',async()=>{
 let count=0;
 const result=await runAgent({messages:[],tools:[tool],allowed,complete:async()=>call({beType:1,searchType:1}),execute:async()=>{count++;return {content:[{type:'text',text:'结果'}]};}});
 assert.equal(count,5);assert.equal(result.limited,true);
});
test('invalid model JSON and upstream failures never become success',async()=>{
 const invalid=await runAgent({messages:[],tools:[tool],allowed,complete:async()=>({tool_calls:[{id:'x',function:{name:tool.name,arguments:'not-json'}}]}),execute:async()=>assert.fail()});
 assert.match(invalid.text,/参数/);
 const failed=await runAgent({messages:[],tools:[tool],allowed,complete:async()=>call({beType:1,searchType:1}),execute:async()=>{throw new Error('失败');}});
 assert.equal(failed.calls[0].ok,false);
});

import { createAdapterServer } from './mcp-adapter.mjs';
import http from 'node:http';
import { createCompletion } from './agent.mjs';
async function listen(server) { await new Promise(r=>server.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${server.address().port}`; }
async function stop(server) { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
test('HTTP adapter validates schema, accepts completed parameters and refuses client system messages', async()=>{
 let calls=0;
 const server=createAdapterServer({env:{MCD_MCP_TOKEN:'fake-mcp-only'},clientFactory:()=>({listTools:async()=>[tool],callTool:async()=>{calls++;return {content:[{type:'text',text:'门店'}]};}})});
 const base=await listen(server);
 try {
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post('/api/mcp/call',{name:tool.name,arguments:{beType:1,searchType:2}})).status,400);
 assert.equal(calls,0);
 assert.equal((await post('/api/mcp/call',{name:tool.name,arguments:{beType:1,searchType:2,city:'北京',keyword:'王府井'}})).status,200);
 assert.equal(calls,1);
 assert.equal((await (await fetch(base+'/api/mcp/agent/status')).json()).configured,false);
 assert.equal((await post('/api/mcp/agent',{messages:[{role:'user',content:'你好'}]})).status,503);
 } finally {await stop(server);}
});
test('compatible HTTP model receives only its own credential and matching function schema',async()=>{
 const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer fake-model-only');assert.equal(body.parallel_tool_calls,false);assert.equal(body.tools[0].function.name,tool.name);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'已收到'}}]}));});
 const base=await listen(server);
 try {const complete=createCompletion({M_AGENT_BASE_URL:base+'/v1',M_AGENT_API_KEY:'fake-model-only',M_AGENT_MODEL:'test'});assert.equal((await complete([{role:'user',content:'你好'}],[tool])).content,'已收到');}finally{await stop(server);}
});

test('explicit MCP business failure is rejected and both secrets are redacted',async()=>{
 const server=createAdapterServer({env:{MCD_MCP_TOKEN:'fake-mcd-secret',M_AGENT_API_KEY:'fake-model-secret',M_AGENT_BASE_URL:'https://example.invalid/v1',M_AGENT_MODEL:'test'},clientFactory:()=>({listTools:async()=>[{name:'now-time-info',inputSchema:{type:'object',properties:{}}}],callTool:async()=>({content:[{type:'text',text:'Original Response\n{"success":false,"code":400,"message":"fake-mcd-secret fake-model-secret"}'}]})})});
 const base=await listen(server);
 try{
 const res=await fetch(base+'/api/mcp/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'now-time-info',arguments:{}})});const body=await res.text();
 assert.equal(res.status,502);assert.ok(!body.includes('fake-mcd-secret'));assert.ok(!body.includes('fake-model-secret'));
 const injection=await fetch(base+'/api/mcp/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'override'}]})});assert.equal(injection.status,400);
 }finally{await stop(server);}
});

test('every model request redacts credentials from history and tool descriptions',async()=>{
 const secret='fake-private-credential';let count=0;
 await runAgent({messages:[{role:'user',content:secret}],tools:[{...tool,description:secret}],allowed,redact:s=>s.replaceAll(secret,'[redacted]'),complete:async(messages,offered)=>{
 assert.ok(!JSON.stringify({messages,offered}).includes(secret));count++;
 if(count===1)return {...call({beType:1,searchType:1}),content:secret};
 assert.equal(messages.at(-1).tool_call_id,'call1');return {content:'完成'};
 },execute:async()=>({text:secret})});assert.equal(count,2);
});
test('menu arguments reject blank identities, invalid components and mismatched fulfilment',()=>{
 const price={name:'calculate-price',inputSchema:{type:'object',required:['storeCode'],properties:{storeCode:{type:'string'}}}};
 const valid={storeCode:'store',beType:1,orderType:1,items:[{productCode:'sku',quantity:1}]};
 assert.deepEqual(validateArguments(price,valid),[]);
 for(const args of [{...valid,storeCode:' '},{...valid,beType:5,orderType:2,beCode:'drive'},{...valid,items:[{productCode:' ',quantity:1}]},{...valid,items:[{productCode:'sku',quantity:1,roundList:[{comboItemList:[{code:'x',quantity:-2}]}]}]}])assert.ok(validateArguments(price,args).length);
});
