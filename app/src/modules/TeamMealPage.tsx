import { useState } from 'react';
import { recommend, resolveConditions, type RecommendMode, type RecommendResult } from '../domain/recommend';
import type { McpStatus } from '../api/mcp';
import { FoodArt } from '../icons';

interface Props {
  onPick: (result: Extract<RecommendResult, { ok: true }>) => void;
  notify: (text: string) => void;
  mcp: McpStatus;
}

const BUDGET_PRESETS = [100, 180, 300];

export function TeamMealPage({ onPick, notify, mcp }: Props) {
  const [budgetText, setBudgetText] = useState('180');
  const [budgetTouched, setBudgetTouched] = useState(true);
  const [people, setPeople] = useState(6);
  const [perPerson, setPerPerson] = useState(30);
  const [mode, setMode] = useState<RecommendMode>('meal');
  const [variation, setVariation] = useState(0);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [usedBudget, setUsedBudget] = useState<number | null>(null);

  const generate = () => {
    const conditions = resolveConditions({
      budget: budgetTouched ? Number(budgetText) : undefined,
      people,
      perPersonPreset: perPerson
    });
    if (!conditions.ok) {
      notify(conditions.message);
      return;
    }
    setAssumptions(conditions.assumptions);
    setUsedBudget(conditions.totalBudget);
    const r = recommend({ budget: conditions.totalBudget, people: conditions.people, mode, variation });
    setVariation(v => v + 1);
    setResult(r);
    if (!r.ok) notify(r.message);
  };

  const reset = () => { setResult(null); setVariation(0); setAssumptions([]); };

  return (
    <div className="split">
      <section className="form-card card">
        <h2>这次，几个人一起？</h2>
        <label className="field">
          <span>总预算 / 元</span>
          <input type="number" min={1} max={100000} value={budgetText} inputMode="decimal"
            onChange={e => { setBudgetText(e.target.value); setBudgetTouched(e.target.value.trim() !== ''); reset(); }} />
          <div className="chips">
            {BUDGET_PRESETS.map(n => (
              <button key={n} type="button" className={`chip ${budgetTouched && Number(budgetText) === n ? 'active' : ''}`}
                onClick={() => { setBudgetText(String(n)); setBudgetTouched(true); reset(); }}>
                ¥{n}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>用餐人数 / 人</span>
          <input type="number" min={1} max={100} step={1} value={people} inputMode="numeric"
            onChange={e => { setPeople(Number(e.target.value)); reset(); }} />
        </label>
        <label className="field">
          <span>人均预算预设 / 元（清空总预算时生效）</span>
          <input type="number" min={1} max={500} value={perPerson} inputMode="decimal"
            onChange={e => { setPerPerson(Number(e.target.value)); setBudgetTouched(false); reset(); }} />
        </label>
        {!budgetTouched && (
          <p className="assumption-list">当前未设总预算，将按人均 ¥{perPerson} × {people} 人 = ¥{perPerson * people} 计算。</p>
        )}
        <label className="field">
          <span>准备吃点什么</span>
          <select value={mode} onChange={e => { setMode(e.target.value as RecommendMode); reset(); }}>
            <option value="meal">正餐 · 每人一份</option>
            <option value="snack">分享小食 · 轻松聚一聚</option>
          </select>
        </label>
        <button className="primary full" onClick={generate}>
          {result ? '换一套组合 ↻' : '帮我配好 →'}
        </button>
        <p className="help">组织者统一选择，无需成员加入；无分账、邀请与多人购物车。<br />总预算为上限，不为花完预算凑单。{mcp.mode === 'live' ? '（MCP 已连接，整单核价待联调）' : ''}</p>
      </section>

      <section className="team-result card">
        {!result && (
          <>
            <div className="empty">
              <FoodArt type="meal" />
              <h2 style={{ marginTop: 12 }}>把配餐交给我，把快乐留给大家</h2>
              <p>设置人数与预算，生成一份完整的团建清单。</p>
            </div>
            <div className="notice">公司团建 / 部门午餐 / 下午茶<br />统一清单，统一确认，不需要分账。</div>
          </>
        )}
        {result && !result.ok && (
          <div className="empty">
            <h2>这个预算暂时配不齐</h2>
            <p>{result.message}</p>
          </div>
        )}
        {result?.ok && (
          <>
            <span className="eyebrow">YOUR TEAM MENU</span>
            <h2>{result.name}</h2>
            <div className="team-summary">
              <div>
                <span className="price">¥{result.total}</span>
                <p className="help">整单演示价{usedBudget != null ? ` · 预算剩余 ¥${(usedBudget - result.total).toFixed(0)}` : ''}</p>
              </div>
              <div>
                <strong>{result.people} 人</strong>
                <p className="help">人均 ¥{(result.total / result.people).toFixed(2)}</p>
              </div>
            </div>
            {assumptions.length > 0 && <p className="assumption-list" style={{ marginBottom: 12 }}>{assumptions.join(' ')}</p>}
            {result.items.map((i, idx) => (
              <div key={idx} className="order-line">
                <FoodArt type={i.art} />
                <div>
                  <strong>{i.label}</strong>
                  <small>每份 ¥{i.price} · 每人 1 份组合</small>
                </div>
                <b>× {i.quantity}</b>
              </div>
            ))}
            <div className="notice" style={{ marginTop: 18 }}>
              已按 {result.people} 人整理份数，整单未超过总预算。<br />商品、价格与分配为演示数据；多人订单需整单计价，不能把单人优惠价直接乘人数。
            </div>
            <button className="primary full" onClick={() => onPick(result)}>确认这份团餐清单 →</button>
          </>
        )}
      </section>
    </div>
  );
}
