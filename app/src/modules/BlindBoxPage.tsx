import { useRef, useState } from 'react';
import { recommend, resolveConditions, type RecommendResult } from '../domain/recommend';
import type { McpStatus } from '../api/mcp';

interface Props {
  onPick: (result: Extract<RecommendResult, { ok: true }>) => void;
  notify: (text: string) => void;
  mcp: McpStatus;
}

const BUDGET_PRESETS = [20, 30, 50];
const WHEEL_EMOJIS = ['🍔', '🍟', '🥛', '🍗', '🌽', '🥤'];

export function BlindBoxPage({ onPick, notify, mcp }: Props) {
  const [budgetText, setBudgetText] = useState('30');
  const [budgetTouched, setBudgetTouched] = useState(true);
  const [people, setPeople] = useState(1);
  const [perPerson, setPerPerson] = useState(30);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const spin = () => {
    if (spinning) return;
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
    const lastName = result?.ok ? result.name : undefined;
    // 先在候选集中确定不重复的结果，再播动画
    const probe = recommend({ budget: conditions.totalBudget, people: conditions.people, mode: 'meal', variation: 0 });
    if (!probe.ok) {
      setResult(probe);
      return;
    }
    const randomVariation = Math.floor(Math.random() * probe.candidateCount);
    const next = recommend({
      budget: conditions.totalBudget,
      people: conditions.people,
      mode: 'meal',
      variation: randomVariation,
      excludeName: lastName
    });
    if (!next.ok) {
      setResult(next);
      return;
    }
    setSpinning(true);
    setRotation(r => r + 1080 + Math.floor(Math.random() * 360));
    timer.current = setTimeout(() => {
      setSpinning(false);
      setResult(next);
    }, 1450);
  };

  const resetFor = (message: string) => {
    setResult(null);
    setAssumptions([]);
    void message;
  };

  return (
    <div className="split">
      <section className="form-card card">
        <h2>给惊喜划个范围</h2>
        <label className="field">
          <span>总预算 / 元</span>
          <input
            type="number" min={1} max={10000} value={budgetText} inputMode="decimal"
            disabled={spinning}
            onChange={e => { setBudgetText(e.target.value); setBudgetTouched(e.target.value.trim() !== ''); resetFor(''); }}
          />
          <div className="chips">
            {BUDGET_PRESETS.map(n => (
              <button key={n} type="button" className={`chip ${budgetTouched && Number(budgetText) === n ? 'active' : ''}`}
                disabled={spinning}
                onClick={() => { setBudgetText(String(n)); setBudgetTouched(true); resetFor(''); }}>
                ¥{n}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>用餐人数 / 人</span>
          <input type="number" min={1} max={100} step={1} value={people} inputMode="numeric"
            disabled={spinning}
            onChange={e => { setPeople(Number(e.target.value)); resetFor(''); }} />
        </label>
        <label className="field">
          <span>人均预算预设 / 元（清空总预算时生效）</span>
          <input type="number" min={1} max={500} value={perPerson} inputMode="decimal"
            disabled={spinning}
            onChange={e => { setPerPerson(Number(e.target.value)); setBudgetTouched(false); resetFor(''); }} />
        </label>
        {!budgetTouched && (
          <p className="assumption-list">当前未设总预算，将按人均 ¥{perPerson} × {people} 人 = ¥{perPerson * people} 计算。</p>
        )}
        <button className="primary yellow full" onClick={spin} disabled={spinning}>
          {spinning ? '快乐正在转动…' : result?.ok ? '再转一次 ↻' : '转一转，今天就吃它'}
        </button>
        <p className="help">默认 1 人，预算可修改。<br />免费推荐，不扣积分，不产生订单。{mcp.mode === 'live' ? '（MCP 已连接，本页组合仍为演示目录，门店核价待联调）' : ''}</p>
      </section>

      <section className="stage card">
        <span className="eyebrow">SPIN FOR A HAPPY MEAL</span>
        <div className="wheel-wrap">
          <div className="pointer" />
          <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
            {WHEEL_EMOJIS.map(x => <span key={x} className="wheel-label">{x}</span>)}
          </div>
          <div className="wheel-centre">M?</div>
        </div>
        <div className="result-box">
          {!result && (
            <>
              <h2>把选择，交给一点运气</h2>
              <p>预算之内，每一次都有新期待。</p>
            </>
          )}
          {result && !result.ok && (
            <>
              <h2>先调整一下条件</h2>
              <p>{result.message}</p>
            </>
          )}
          {result?.ok && (
            <>
              <span className="badge">这次的快乐已揭晓</span>
              <h2>{result.name.replace('开饭局', '组合')}</h2>
              <p>
                {result.items.map(i => `${i.label} × ${i.quantity}`).join(' · ')}<br />
                合计 <strong>¥{result.total}</strong> · {result.people} 人份 · 演示价
              </p>
              {assumptions.length > 0 && <p className="assumption-list">{assumptions.join(' ')}</p>}
              <button className="primary" onClick={() => onPick(result)}>就选这份 →</button>
              <p>{result.candidateCount > 1 ? '不心动？再转一次试试。' : '当前预算只有这一种演示组合，可提高预算增加选择。'}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
