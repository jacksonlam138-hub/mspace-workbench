import { useEffect, useState } from 'react';
import { useLiveNutrition } from '../api/mcp';
import { menuContext, quoteBasket, readToolData } from '../api/menu';
import { beijingToday, findFoodByName } from '../domain/mcd-parsers';
import { candidateBaskets, parseMenu, parseStores, record, type BasketLine, type MenuItem, type Quote, type Store, type StoreSelection } from '../domain/menu';
import { resolveConditions } from '../domain/recommend';

type Mode = 'new' | 'nutrition' | 'blind' | 'team';
interface Props { mode: Mode; selection: StoreSelection | null; onSelectStore: (value: StoreSelection | null) => void }
interface NutritionChoice { name: string; lines: BasketLine[]; kcal: number; protein: number }
const yuan = (cents: number) => (cents / 100).toFixed(2);

export function LiveMealsPage({ mode, selection, onSelectStore }: Props) {
  const [city, setCity] = useState('');
  const [keyword, setKeyword] = useState('');
  const [time, setTime] = useState(selection?.reservationDate ?? '');
  const [stores, setStores] = useState<Store[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [detail, setDetail] = useState('');
  const [budget, setBudget] = useState(mode === 'team' ? '180' : '30');
  const [people, setPeople] = useState(mode === 'team' ? 6 : 1);
  const [perPerson, setPerPerson] = useState(30);
  const [mealMode, setMealMode] = useState<'meal' | 'snack'>('meal');
  const [last, setLast] = useState('');
  const [rotation, setRotation] = useState(0);
  const [nutrition, setNutrition] = useState<NutritionChoice[]>([]);
  const foods = useLiveNutrition(mode === 'nutrition');

  useEffect(() => {
    setMenu([]); setQuote(null); setDetail(''); setError(''); setLast('');
    if (!selection) return;
    let cancelled = false;
    setBusy(true);
    readToolData('query-meals', menuContext(selection)).then(value => {
      if (!cancelled) setMenu(parseMenu(value));
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selection]);

  useEffect(() => {
    setNutrition([]);
    if (mode !== 'nutrition' || !selection || !foods.foods.length || !menu.length) return;
    let cancelled = false;
    // The detail endpoint resolves generic menu names (e.g. 玉米杯) to an exact portion.
    const names = ['板烧鸡腿堡', '双层吉士汉堡', '麦香鱼', '玉米杯'];
    const choices = menu.filter(item => names.includes(item.name));
    Promise.all(choices.map(async item => ({ item, detail: await readToolData('query-meal-detail', { ...menuContext(selection), code: item.code }) }))).then(results => {
      const resolved = results.flatMap(({ item, detail: value }) => {
        if (!record(value) || typeof value.name !== 'string') return [];
        const matches = findFoodByName(foods.foods, value.name);
        if (matches.length !== 1) return [];
        const food = matches[0];
        return food.energyKcal != null && food.protein != null ? [{ item, kcal: food.energyKcal, protein: food.protein }] : [];
      });
      const corn = resolved.find(r => r.item.name === '玉米杯');
      const combos = corn ? resolved.filter(r => r !== corn).map(r => ({
        name: `${r.item.name} + 玉米杯`, lines: [{ code: r.item.code, quantity: 1 }, { code: corn.item.code, quantity: 1 }], kcal: r.kcal + corn.kcal, protein: r.protein + corn.protein
      })) : [];
      if (!cancelled) setNutrition(combos);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [mode, selection, menu, foods.foods]);

  const search = async (sample = false) => {
    const searchCity = sample ? '北京' : city.trim(), searchKeyword = sample ? '王府井' : keyword.trim();
    if (!searchCity || !searchKeyword) { setError('请填写城市与商圈或地点'); return; }
    if (sample) { setCity(searchCity); setKeyword(searchKeyword); setTime(`${beijingToday()}T12:00`); }
    setBusy(true); setError(''); setStores([]);
    try { setStores(parseStores(await readToolData('query-nearby-stores', { beType: 1, searchType: 2, city: searchCity, keyword: searchKeyword }))); }
    catch (e) { setError(e instanceof Error ? e.message : '门店查询失败'); }
    finally { setBusy(false); }
  };
  const quoteLines = async (lines: BasketLine[], ceiling?: number) => {
    if (!selection) return;
    setBusy(true); setError(''); setQuote(null); setDetail('');
    try { setQuote(await quoteBasket(selection, lines, ceiling)); }
    catch (e) { setError(e instanceof Error ? e.message : '核价失败'); }
    finally { setBusy(false); }
  };
  const recommend = async () => {
    const resolved = resolveConditions({ budget: budget.trim() ? Number(budget) : undefined, people, perPersonPreset: perPerson });
    if (!resolved.ok) { setError(resolved.message); return; }
    const candidates = candidateBaskets(menu, resolved.people, Math.round(resolved.totalBudget * 100), mealMode);
    const alternatives = candidates.filter(lines => JSON.stringify(lines) !== last);
    const pool = alternatives.length ? alternatives : candidates;
    if (!pool.length) { setError('当前门店与预算下没有符合条件的搭配，请调整预算或用餐时间'); setQuote(null); return; }
    const lines = pool[Math.floor(Math.random() * pool.length)];
    setLast(JSON.stringify(lines)); setRotation(n => n + 1080 + Math.floor(Math.random() * 360));
    await quoteLines(lines, Math.round(resolved.totalBudget * 100));
  };
  const inspect = async (item: MenuItem) => {
    if (!selection) return;
    setBusy(true); setError(''); setDetail('');
    try {
      const value = await readToolData('query-meal-detail', { ...menuContext(selection), code: item.code });
      if (!record(value)) throw new Error('商品详情无法识别');
      const rounds = Array.isArray(value.rounds) ? value.rounds.filter(record) : [];
      const selected = rounds.flatMap(r => Array.isArray(r.choices) ? r.choices.filter(record).filter(c => c.isDefault === 1).map(c => String(c.name)) : []);
      setDetail(`${String(value.name)}${value.supportModify ? '【可特调】' : ''}${selected.length ? `\n默认搭配：${selected.join('、')}` : '\n按门店默认规格。'}\n核价使用默认规格；修改规格请前往官方渠道。`);
    } catch (e) { setError(e instanceof Error ? e.message : '详情查询失败'); }
    finally { setBusy(false); }
  };
  return <div className="live-meals">
    <section className="card store-picker">
      <h2>{selection ? selection.store.name : '先选一家门店'}</h2>
      <p className="help">到店自取 · 团餐为组织者统一搭配与核价 · 不创建订单</p>
      {selection ? <><p>{selection.store.address} · 门店 {selection.store.code}<br />{selection.reservationDate ? `用餐时间 ${selection.reservationDate.replace('T', ' ')}` : '当前菜单'} · {selection.store.open ? '当前营业' : '当前休息，预约时段以门店为准'}</p><button className="text-button" disabled={busy} onClick={() => onSelectStore(null)}>更换门店或时间</button></> : <>
        <fieldset disabled={busy} className="store-fields">
          <label className="field"><span>城市</span><input value={city} placeholder="例如北京" onChange={e => setCity(e.target.value)} /></label>
          <label className="field"><span>商圈 / 地点</span><input value={keyword} placeholder="例如王府井" onChange={e => setKeyword(e.target.value)} /></label>
          <label className="field"><span>用餐时间（留空看当前菜单）</span><input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></label>
          <button className="primary" onClick={() => search()}>查找门店</button><button className="secondary" onClick={() => search(true)}>体验北京王府井示例</button>
        </fieldset>
        <p className="help">示例使用公开门店与今日午餐时间，不代表你的位置。</p>
        {stores.map(store => <article className="store-option" key={store.code}><strong>{store.name}</strong><p>{store.address} · 编码 {store.code} · {store.open ? '营业中' : '当前休息'}</p>{store.slots.map(slot => <p className="help" key={slot}>{slot}</p>)}<button className="secondary" disabled={busy || (!store.open && !time)} onClick={() => { onSelectStore({ store, reservationDate: time }); setStores([]); }}>选择此店</button>{!store.open && !time && <p className="help">请先填写可预约时间</p>}</article>)}
      </>}
    </section>
    {error && <p role="alert" className="mode-banner error">{error}</p>}
    {busy && <p role="status">正在查询真实门店数据…</p>}
    {selection && menu.length > 0 && <>
      <p className="help">真实菜单 {menu.length} 项 · 来源 query-meals · 页面价格为菜单参考价，最终以整单核价为准</p>
      {mode === 'new' && <div className="live-products">{menu.filter(m => m.tags.includes('上新')).map(item => <article className="card live-product" key={item.code}>
        <img src={item.image} alt="" loading="lazy" /><span className="badge">门店上新</span><h2>{item.name}</h2><p>{item.cents == null ? '价格待核实' : `菜单参考 ¥${yuan(item.cents)}`}</p><button className="secondary" disabled={busy} onClick={() => inspect(item)}>查看详情</button> <button className="primary" disabled={busy} onClick={() => quoteLines([{ code: item.code, quantity: 1 }])}>选这份并核价</button>
      </article>)}{!menu.some(m => m.tags.includes('上新')) && <p>此门店当前菜单没有标为上新的商品。</p>}</div>}
      {mode === 'nutrition' && <><p>精选主食配蔬菜，按具体规格核对热量与蛋白质。营养为选餐参考，不承诺减脂或增肌效果。</p>{foods.error && <p role="alert">{foods.error}</p>}<div className="live-products">{nutrition.map(combo => <article className="card live-product" key={combo.name}><span className="badge">{combo.kcal <= 500 ? '500 大卡内' : '主食配蔬菜'}</span><h2>{combo.name}</h2><p><b>{combo.kcal} 千卡</b> · 蛋白质 {combo.protein}g</p><p className="help">来源 list-nutrition-foods，与门店详情规格精确匹配</p><button className="primary" disabled={busy} onClick={() => quoteLines(combo.lines)}>选这套并核价</button></article>)}</div>{!nutrition.length && <p>{foods.loading ? '正在核对营养表…' : '正在核对规格；若此时段无完整匹配，则不展示已核实套餐。'}</p>}</>}
      {(mode === 'blind' || mode === 'team') && <div className="split"><section className="card form-card"><fieldset disabled={busy} className="store-fields">
        <label className="field"><span>总预算 / 元</span><input type="number" value={budget} onChange={e => { setBudget(e.target.value); setQuote(null); }} /></label>
        <label className="field"><span>用餐人数</span><input type="number" min="1" max="100" value={people} onChange={e => { setPeople(Number(e.target.value)); setQuote(null); }} /></label>
        <label className="field"><span>人均预算（总预算留空时使用）</span><input type="number" value={perPerson} onChange={e => { setPerPerson(Number(e.target.value)); setQuote(null); }} /></label>
        <label className="field"><span>用餐类型</span><select value={mealMode} onChange={e => { setMealMode(e.target.value === 'snack' ? 'snack' : 'meal'); setQuote(null); }}><option value="meal">正餐 · 每人一份主食</option><option value="snack">分享小食</option></select></label>
        <button className="primary yellow" onClick={recommend}>{busy ? '正在核价…' : last ? '换一套并核价 ↻' : mode === 'blind' ? '转一转，今天就吃它' : '帮我配好并核价'}</button>
      </fieldset><p className="help">优先主食配小食或饮品；预算不足时仅推荐主食。不凑单、不保证全局最低价。每次按实际份数整单核价。</p></section>{mode === 'blind' ? <section className="stage card"><div className="wheel-wrap"><div className="pointer"/><div className="wheel" style={{transform:`rotate(${rotation}deg)`}}>{['🍔','🍟','🥛','🍗','🌽','🥤'].map(x=><span className="wheel-label" key={x}>{x}</span>)}</div><div className="wheel-centre">M?</div></div><h2>预算内，来点小惊喜</h2></section> : <section className="stage card"><h2>一份清单，大家开饭</h2><p>组织者统一选择，无分账与成员邀请。</p></section>}</div>}
    </>}
    {detail && <section className="card quote-result"><h2>商品详情</h2><p style={{whiteSpace:'pre-wrap'}}>{detail}</p></section>}
    {quote && <section className="card quote-result" aria-label="真实整单核价"><span className="badge">整单核价成功</span><h2>这份清单 ¥{yuan(quote.cents)}</h2>{quote.lines.map(line=><p key={line.code}>{line.name || menu.find(m=>m.code===line.code)?.name} × {line.quantity}</p>)}<p className="help">来源 calculate-price · 已按实际商品与份数核价 · {new Date().toLocaleTimeString('zh-CN')}<br/>未下单、未付款；最终供应与价格以官方结算为准。</p><button className="secondary" onClick={()=>setQuote(null)}>继续选餐</button></section>}
  </div>;
}
