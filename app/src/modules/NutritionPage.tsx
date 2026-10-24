import { useMemo, useState } from 'react';
import { DEMO_COMBOS, type ComboCategory, type DemoCombo } from '../data/demo';
import { comboTotals, isVerifiedCombo } from '../domain/combo';
import { resolveCombos, type ResolvedCombo } from '../domain/mcd-mapping';
import { useLiveNutrition, type McpStatus } from '../api/mcp';
import { FoodArt } from '../icons';

interface Props {
  onSelect: (combo: DemoCombo | ResolvedCombo) => void;
  mcp: McpStatus;
  notify: (text: string) => void;
}

const FILTERS: Array<'全部' | ComboCategory> = ['全部', '500 大卡内', '蛋白质优选', '主食配蔬果'];

export function NutritionPage({ onSelect, mcp }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');
  const isLive = mcp.mode === 'live';
  const live = useLiveNutrition(isLive);

  // live：精选组合映射到真实营养数据；demo：演示组合
  const liveResolved = useMemo(() => (isLive && live.foods.length ? resolveCombos(live.foods) : []), [isLive, live.foods]);

  const demoList = DEMO_COMBOS.filter(m => filter === '全部' || m.category === filter);
  const liveList = liveResolved.filter(r => filter === '全部' || r.spec.category === filter);

  return (
    <div>
      <div className="notice">
        {isLive
          ? '已连接麦当劳 MCP：下列组合的营养数值由 list-nutrition-foods 实时数据按实际份数汇总（千卡/蛋白质），来源逐项标注；价格未联调，不含售价信息，不以热量单指标宣称健康。'
          : '搭配先选好，营养看得见。演示模式下数值为示意、未经核验，不作为饮食建议；连接 MCP 后按真实营养数据汇总。'}
      </div>

      {isLive && (
        <div className="mode-banner">
          <span className="badge">真实数据</span>
          {live.loading && '正在获取营养表…'}
          {!live.loading && live.error && <span style={{ color: '#8c3a2e' }}>营养表获取失败：{live.error}　</span>}
          {!live.loading && !live.error && `营养表 ${live.foods.length} 条（已去重）；${liveResolved.length} 个精选组合完成真实映射。`}
          {!live.loading && (
            <button className="text-button" onClick={() => void live.reload()}>重新获取 ↻</button>
          )}
        </div>
      )}

      <div className="chips module-tabs" style={{ marginBottom: 18 }}>
        {FILTERS.map(f => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="grid">
        {isLive && liveList.map(rc => (
          <article key={rc.spec.id} className="product card">
            <div className="product-art mint">
              <span className="badge">{rc.spec.category}</span>
              <FoodArt type={rc.spec.mealType === '正餐' ? 'meal' : 'nuggets'} />
            </div>
            <div className="product-body">
              <h3>{rc.spec.name}</h3>
              <p>{rc.spec.desc}</p>
              <div className="nutrients">
                <span><b>{rc.kcal ?? '—'}</b> 千卡{rc.kcal != null ? ' · 真实' : ' · 缺项'}</span>
                <span><b>{rc.protein ?? '—'}g</b> 蛋白质</span>
                <span><b>{rc.spec.mealType}</b> · {rc.items.reduce((s, i) => s + i.quantity, 0)} 件</span>
              </div>
              <p className="source-line">
                营养来源：list-nutrition-foods（实时，按份汇总）· {rc.spec.reason}
                {rc.unmatched.length > 0 && ` · 未匹配组件：${rc.unmatched.join('、')}（不强行配）`}
                {' '}· 价格未联调
              </p>
              <div className="price-row">
                <span className="price">—<small>价格未联调</small></span>
                <button className="primary" disabled={rc.unmatched.length > 0} onClick={() => onSelect(rc)}>
                  {rc.unmatched.length > 0 ? '营养信息待补全' : '选这套 +'}
                </button>
              </div>
            </div>
          </article>
        ))}

        {!isLive && demoList.map(m => {
          const totals = comboTotals(m.items);
          const verified = isVerifiedCombo(m.items);
          return (
            <article key={m.id} className="product card">
              <div className={`product-art ${m.tone}`}>
                <span className="badge">{m.category}</span>
                <FoodArt type={m.art} />
              </div>
              <div className="product-body">
                <h3>{m.name}</h3>
                <p>{m.desc}</p>
                <div className="nutrients">
                  <span><b>{totals.kcal ?? '—'}</b> 千卡{verified ? '' : '（缺项）'}</span>
                  <span><b>{totals.protein ?? '—'}g</b> 蛋白质</span>
                  <span><b>{m.mealType}</b> · {totals.itemCount} 件</span>
                </div>
                <p className="source-line">{m.sourceType} · {m.reason} · 营养为示意值</p>
                <div className="price-row">
                  <span className="price">¥{totals.price}<small>演示价</small></span>
                  <button className="primary" onClick={() => onSelect(m)}>选这套 +</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {isLive && !live.loading && !live.error && live.foods.length > 0 && (
        <>
          <div className="section-line">
            <h2>营养数据全文<small>list-nutrition-foods · {live.foods.length} 条（去重后）</small></h2>
          </div>
          <div className="card" style={{ padding: 18, maxHeight: 360, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line)' }}>
                  <th style={{ padding: 8 }}>品名</th><th>千卡</th><th>蛋白质 g</th><th>脂肪 g</th><th>碳水 g</th><th>钠 mg</th>
                </tr>
              </thead>
              <tbody>
                {live.foods.slice(0, 60).map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px dashed var(--line)' }}>
                    <td style={{ padding: 8 }}>{f.productName}</td>
                    <td>{f.energyKcal ?? '—'}</td><td>{f.protein ?? '—'}</td>
                    <td>{f.fat ?? '—'}</td><td>{f.carbohydrate ?? '—'}</td><td>{f.sodium ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {live.foods.length > 60 && <p className="help" style={{ marginTop: 8 }}>仅展示前 60 条，共 {live.foods.length} 条。</p>}
          </div>
        </>
      )}
      {!isLive && <p className="help" style={{ marginTop: 10 }}>连接 MCP 后本页组合将按实时营养数据重算，未命中组件会明确标注。</p>}
    </div>
  );
}
