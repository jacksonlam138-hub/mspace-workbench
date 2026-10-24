import { useEffect, useRef, useState } from 'react';
import { QUICK_CHATS, scriptedReply } from '../data/demo';
import { callTool, fetchTools, type McpStatus, type McpTool } from '../api/mcp';
import { formArguments, toolSummary } from '../domain/agent';
import { record } from '../domain/menu';

interface Message { role: 'user' | 'agent'; text: string; raw?: string }
const INTENTS: [RegExp,string][] = [
  [/时间|几点|日期/,'now-time-info'],[/活动|日历|新品|上新/,'campaign-calendar'],[/营养|热量|卡路里/,'list-nutrition-foods'],
  [/附近|门店/,'query-nearby-stores'],[/菜单|餐品/,'query-meals'],[/优惠券|我的券/,'query-my-coupons'],[/积分/,'query-my-account'],[/订单/,'order-list']
];
const LABELS: Record<string,string> = {city:'城市',keyword:'商圈或地点',beType:'取餐方式',searchType:'查询方式',storeCode:'门店编号',beCode:'门店业务编码',orderType:'订单类型',reservationDate:'预约时间',code:'商品编码',items:'商品清单（JSON）'};
const ENUM_LABELS: Record<string,Record<string,string>> = {beType:{1:'到店自取',2:'麦乐送',5:'得来速',6:'企业团餐'},searchType:{1:'收藏餐厅',2:'按城市地点'},orderType:{1:'到店',2:'外送'}};

export function AgentPage({ mcp }: { mcp: McpStatus; notify: (t: string) => void }) {
  const [chats,setChats] = useState<Message[]>([]);
  const [input,setInput] = useState('');
  const [busy,setBusy] = useState(false);
  const [tools,setTools] = useState<McpTool[]>([]);
  const [error,setError] = useState('');
  const [model,setModel] = useState(false);
  const [active,setActive] = useState('');
  const [values,setValues] = useState<Record<string,string>>({});
  const [outcomes,setOutcomes] = useState<Record<string,string>>({});
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(mcp.mode!=='live')return;
    fetchTools().then(setTools).catch(e=>setError(e.message));
    fetch('/api/mcp/agent/status').then(r=>r.json()).then((v:unknown)=>setModel(record(v)&&v.configured===true)).catch(()=>setModel(false));
  },[mcp.mode]);
  useEffect(()=>{if(messagesRef.current)messagesRef.current.scrollTop=messagesRef.current.scrollHeight;},[chats]);
  const tool = tools.find(t=>t.name===active);
  const properties = record(tool?.inputSchema?.properties) ? tool.inputSchema.properties : {};
  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const openTool = (name:string, args:Record<string,unknown> = {}) => {
    setActive(name); setError('');
    setValues(Object.fromEntries(Object.entries(args).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])));
  };
  const run = async (name:string,args:Record<string,unknown>) => {
    setBusy(true);setError('');
    try {
      const response=await callTool(name,args);
      if(!response.ok)throw new Error(response.error?.message??'查询失败');
      const summary=toolSummary(name,response.result);
      setOutcomes(o=>({...o,[name]:summary.ok?'本次查询成功':'本次查询失败'}));
      setChats(h=>[...h,{role:'agent',text:summary.text,raw:summary.raw}]);
      if(summary.ok)setActive('');
    } catch(e) {
      const message=e instanceof Error?e.message:'查询失败';setError(message);
      setOutcomes(o=>({...o,[name]:'调用受阻'}));
      setChats(h=>[...h,{role:'agent',text:`查询未完成：${message}。请在下方修正参数后继续。`}]);
    } finally {setBusy(false);}
  };
  const send = async(raw:string)=>{
    const text=raw.trim();if(!text||busy)return;
    const history:Message[]=[...chats,{role:'user',text}];setChats(history);setInput('');setError('');
    if(mcp.mode!=='live'){setChats([...history,{role:'agent',text:`模拟回复：${scriptedReply(text)}`}]);return;}
    if(model){
      setBusy(true);
      try{
        const response=await fetch('/api/mcp/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:history.slice(-20).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text}))})});
        const result:unknown=await response.json();
        if(!record(result)||result.ok!==true)throw new Error(record(result)&&record(result.error)&&typeof result.error.message==='string'?result.error.message:'模型服务调用失败');
        setChats(h=>[...h,{role:'agent',text:typeof result.text==='string'?result.text:'模型未返回文字'}]);
        if(Array.isArray(result.calls)) for(const c of result.calls.filter(record)) if(typeof c.name==='string')setOutcomes(o=>({...o,[String(c.name)]:c.ok?'本次查询成功':'本次查询失败'}));
        if(record(result.needsInput)&&typeof result.needsInput.tool==='string')openTool(result.needsInput.tool,record(result.needsInput.arguments)?result.needsInput.arguments:{});
      }catch(e){setError(e instanceof Error?e.message:'模型服务失败');}finally{setBusy(false);}return;
    }
    const name=INTENTS.find(([pattern])=>pattern.test(text))?.[1]??tools.find(t=>t.name===text)?.name;
    const match=tools.find(t=>t.name===name&&t.readOnly===true);
    if(!match){setChats([...history,{role:'agent',text:'当前未配置对话模型。请从下方选择查询工具并填写参数；已填参数会保留，不需要重新描述。'}]);return;}
    const fields=record(match.inputSchema?.properties)?Object.keys(match.inputSchema.properties):[];
    if(fields.length){openTool(match.name);setChats([...history,{role:'agent',text:'请在下方补充查询信息，再点击「按这些参数查询」。表单按官方实时参数生成，未提供的信息不会替你猜。'}]);}
    else await run(match.name,{});
  };
  return <div>
    <div className="mode-banner">{mcp.mode==='live'?(model?'模型工具模式 · 最多 5 次只读调用 · 工具结果会发给已配置的模型服务':'直连工具模式 · 未配置对话模型 · 参数表单可完成真实查询'):'本地脚本演示 · 尚未连接 MCP'}</div>
    <section className="chat card"><div className="chat-top"><span className="agent-symbol">M_</span><strong>MAgent</strong><button className="text-button" disabled={busy} style={{marginLeft:'auto'}} onClick={()=>{setChats([]);setActive('');setValues({});setError('');}}>新对话 +</button></div>
      <div className="chat-messages" ref={messagesRef}>{!chats.length?<div className="chat-welcome"><h2>今天有什么麦计划？</h2><p>活动、营养、门店，随时来问。</p><div className="suggestions">{QUICK_CHATS.map(q=><button key={q} disabled={busy} onClick={()=>send(q)}>{q} ↗</button>)}</div></div>:chats.map((m,i)=><div key={i} className={`bubble ${m.role}`}>{m.text}{m.raw&&<details><summary>查看工具原始结果</summary><pre className="dialog-copy">{m.raw}</pre></details>}</div>)}</div>
      <form className="chat-input" onSubmit={e=>{e.preventDefault();void send(input);}}><input aria-label="给 MAgent 发消息" value={input} maxLength={2000} onChange={e=>setInput(e.target.value)} placeholder="问问 MAgent…"/><button className="primary" disabled={busy}>{busy?'查询中…':'发送 ↑'}</button></form>
    </section>
    {error&&<p className="mode-banner error" role="alert">{error}</p>}
    {mcp.mode==='live'&&<section className="card quote-result"><h2>选择查询工具</h2><label className="field"><span>只读工具</span><select aria-label="只读工具" disabled={busy} value={active} onChange={e=>openTool(e.target.value)}><option value="">选择一个工具…</option>{tools.filter(t=>t.readOnly).map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
      {tool&&<form onSubmit={e=>{e.preventDefault();try{void run(tool.name,formArguments(properties,values));}catch(err){setError(err instanceof Error?err.message:'参数无效');}}}><p className="help">{tool.description?.split('\n')[0]}</p><fieldset disabled={busy} className="store-fields">{Object.entries(properties).filter(([,s])=>record(s)).map(([key,schema])=>{
        const s=record(schema)?schema:{};const choices=Array.isArray(s.enum)?s.enum:s.type==='boolean'?[true,false]:null;
        return <label className="field" key={key}><span>{LABELS[key]??key}{required.includes(key)?' *':''}</span>{choices?<select value={values[key]??''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}><option value="">请选择</option>{choices.map(v=><option key={String(v)} value={String(v)}>{ENUM_LABELS[key]?.[String(v)]??String(v)}</option>)}</select>:s.type==='array'||s.type==='object'?<textarea value={values[key]??''} rows={3} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>:<input value={values[key]??''} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>}<small className="help">{typeof s.description==='string'?s.description:''}</small></label>;
      })}<button className="primary">按这些参数查询</button><button type="button" className="secondary" onClick={()=>setActive('')}>取消</button></fieldset></form>}
    </section>}
    <section className="tool-matrix"><h2>工具能力矩阵 <small>{tools.length} 个实时工具</small></h2><div className="card" style={{padding:'6px 18px'}}>{tools.map(t=><div key={t.name} className="tool-row"><span className="mono">{t.name}</span><span className="desc">{t.description?.split('\n')[0]}</span><span className="badge">{!t.readOnly?'写入或未知 · 已拦截':outcomes[t.name]??'已注册 · 尚未查询'}</span>{t.readOnly&&<button disabled={busy} className="text-button" onClick={()=>openTool(t.name)}>填写参数</button>}</div>)}</div></section>
  </div>;
}
