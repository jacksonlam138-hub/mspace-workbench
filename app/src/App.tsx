import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, FoodArt, type FoodType } from './icons';
import { Modal, type ModalState } from './components/Modal';
import { CalendarPage } from './modules/CalendarPage';
import { NewProductsPage } from './modules/NewProductsPage';
import { NutritionPage } from './modules/NutritionPage';
import { BlindBoxPage } from './modules/BlindBoxPage';
import { TeamMealPage } from './modules/TeamMealPage';
import { LiveMealsPage } from './modules/LiveMealsPage';
import type { StoreSelection } from './domain/menu';
import { AgentPage } from './modules/AgentPage';
import { DEMO_EVENTS, type DemoProduct, type DemoCombo } from './data/demo';
import { comboTotals } from './domain/combo';
import { parseReminderDetails, type ReminderTiming, type ReminderDetails } from './domain/reminders';
import type { RecommendResult } from './domain/recommend';
import type { NewProductLead, ResolvedCombo } from './domain/mcd-mapping';
import { fetchStatus, type McpStatus } from './api/mcp';

type PageId = 'calendar' | 'new' | 'nutrition' | 'blind' | 'team' | 'agent';

const MODULES: Array<[PageId, string, string, string]> = [
  ['calendar', '活动日历', 'YOUR MCD MOMENTS', '把期待的日子，提前圈起来。'],
  ['new', '新品推荐', 'FRESH FINDS', '新鲜灵感上桌，发现下一口喜欢。'],
  ['nutrition', '营养套餐', 'FEEL GOOD, EAT GOOD', '搭配已经想好，你只管选喜欢的。'],
  ['blind', '盲盒推荐', 'A LITTLE SURPRISE', '今天吃什么？让快乐转一圈。'],
  ['team', '团餐选择', 'BETTER TOGETHER', '一群人的快乐，一次安排明白。'],
  ['agent', 'MAgent', 'YOUR MCD COPILOT', '一句话，聊聊你的麦当劳日常。']
];

interface ConfirmItem {
  label: string;
  quantity: number;
  price: number;
  art?: FoodType;
}

const REMINDER_KEY = 'mspace-reminders-v3';
const REMINDER_DETAILS_KEY = 'mspace-reminder-details-v1';

function loadReminders(): Record<string, ReminderTiming> {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => {
    const hash = location.hash.slice(1);
    return (MODULES.some(m => m[0] === hash) ? hash : 'calendar') as PageId;
  });
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState('');
  const [reminders, setReminders] = useState<Record<string, ReminderTiming>>(loadReminders);
  const [reminderDetails, setReminderDetails] = useState<Record<string, ReminderDetails>>(() => {
    try { return parseReminderDetails(localStorage.getItem(REMINDER_DETAILS_KEY) || '{}'); }
    catch { return {}; }
  });
  const [storeSelection, setStoreSelection] = useState<StoreSelection | null>(null);
  const [mcp, setMcp] = useState<McpStatus>({ mode: 'loading' });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onHash = () => {
      const hash = location.hash.slice(1);
      setPage((MODULES.some(m => m[0] === hash) ? hash : 'calendar') as PageId);
      document.querySelector('.shell')?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal).then(s => !controller.signal.aborted && setMcp(s));
    return () => controller.abort();
  }, []);

  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);

  const toggleReminder = useCallback((eventId: string, timing: ReminderTiming, details?: ReminderDetails) => {
    if (details) setReminderDetails(previous => {
      const next = { ...previous, [eventId]: details };
      try { localStorage.setItem(REMINDER_DETAILS_KEY, JSON.stringify(next)); } catch { /* 本地存储不可用 */ }
      return next;
    });
    setReminders(prev => {
      const next = { ...prev };
      if (next[eventId]) delete next[eventId];
      else next[eventId] = timing;
      try { localStorage.setItem(REMINDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      notify(next[eventId] ? '已加入站内提醒 · 不会发送外部通知' : '已取消提醒');
      return next;
    });
  }, [notify]);

  const openConfirm = useCallback((title: string, items: ConfirmItem[], total: number) => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    setModal({
      title,
      body: (
        <>
          <p className="dialog-copy">已一次选中 {count} 件商品。以下是模拟清单，不会创建真实订单。</p>
          {items.map((i, idx) => (
            <div key={idx} className="order-line">
              <div>
                <strong>{i.label}</strong>
                <small>演示单价 ¥{i.price}</small>
              </div>
              <span>× {i.quantity}</span>
              <b>¥{i.price * i.quantity}</b>
            </div>
          ))}
          <div className="team-summary" style={{ marginTop: 12 }}>
            <strong>合计</strong>
            <span className="price">¥{total}</span>
          </div>
        </>
      ),
      actions: (
        <>
          <button className="secondary" onClick={() => setModal(null)}>再看看</button>
          <button className="primary" onClick={() => setModal({
            title: '选好啦，快乐已就位 ✦',
            body: <p className="dialog-copy">本次选择已完成演示。没有提交订单，也没有产生付款。</p>,
            actions: <button className="primary" onClick={() => setModal(null)}>继续逛逛</button>
          })}>确认选择（演示）</button>
        </>
      )
    });
  }, []);

  const openRemindersList = useCallback(() => {
    const entries = Object.entries(reminders);
    setModal({
      title: '我的站内提醒',
      body: entries.length ? (
        <>
          {entries.map(([key, timing]) => {
            const demo = DEMO_EVENTS.find(e => String(e.id) === key);
            const details = reminderDetails[key];
            return (
              <div key={key} className="order-line">
                <div>
                  <strong>{details?.title ?? demo?.title ?? '此前关注的活动（请重新选择以更新信息）'}</strong>
                  <small>{details?.date ?? demo?.startDay ?? '日期待确认'} · {timing === 'day-before' ? '日历日期前一天' : '日历日期当天'} · 仅保存在本浏览器</small>
                </div>
                <button className="text-button" onClick={() => { toggleReminder(key, timing); setModal(null); }}>取消</button>
              </div>
            );
          })}
        </>
      ) : (
        <p className="dialog-copy">还没有关注的活动。到日历里点击「提醒我」试试。</p>
      ),
      actions: <button className="primary" onClick={() => setModal(null)}>知道了</button>
    });
  }, [reminders, reminderDetails, toggleReminder]);

  const openAbout = useCallback(() => {
    setModal({
      title: '关于这个工作台',
      body: (
        <p className="dialog-copy">
          M·SPACE · 1024 创意工作台，六个独立模块。<br /><br />
          数据模式：{mcp.mode === 'live' ? `已连接麦当劳 MCP（${mcp.toolCount} 个工具，实时 tools/list）` : '演示模式（未连接 MCP）'}。
          演示模式下活动、商品、营养与价格均为模拟内容，不会提交真实订单；提醒仅保存在当前浏览器。<br /><br />
          独立参赛原型 · 非官方应用。
        </p>
      ),
      actions: <button className="primary" onClick={() => setModal(null)}>开始体验</button>
    });
  }, [mcp]);

  const selectProduct = useCallback((p: DemoProduct | NewProductLead) => {
    if ('sourceTitle' in p) {
      setModal({
        title: p.name,
        body: <>
          {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />}
          <p className="dialog-copy">{p.desc}</p>
          <p className="source-line">来源活动：{p.sourceTitle}<br />日期组：{p.sourceDays.join('、')}</p>
          <p className="dialog-copy">售价与门店供应待确认。此处展示活动中的新品线索。</p>
        </>,
        actions: <button className="primary" onClick={() => setModal(null)}>知道了</button>
      });
      return;
    }
    setModal({
      title: p.name,
      body: (
        <>
          <div className="dialog-art"><FoodArt type={p.art} /></div>
          <p className="dialog-copy">{p.desc}<br />创意商品示例 · 当前演示价 ¥{p.price} · {p.source}</p>
        </>
      ),
      actions: (
        <>
          <button className="secondary" onClick={() => setModal(null)}>再看看</button>
          <button className="primary" onClick={() => openConfirm('确认新品选择', [{ label: p.name, quantity: 1, price: p.price }], p.price)}>选这件</button>
        </>
      )
    });
  }, [openConfirm]);

  const selectCombo = useCallback((combo: DemoCombo | ResolvedCombo) => {
    if ('spec' in combo) {
      setModal({
        title: combo.spec.name,
        body: <>
          <p className="dialog-copy">已选好组合内容，营养值来自实时查询。门店供应与售价待确认。</p>
          {combo.items.map(item => <div key={item.skuId} className="order-line">
            <div><strong>{item.label}</strong><small>单份 {item.kcal} 千卡 · 蛋白质 {item.protein}g</small></div>
            <span>× {item.quantity}</span>
          </div>)}
          <p className="dialog-copy">合计 {combo.kcal} 千卡 · 蛋白质 {combo.protein}g<br />价格待确认</p>
        </>,
        actions: <button className="primary" onClick={() => setModal(null)}>继续逛逛</button>
      });
      return;
    }
    const totals = comboTotals(combo.items);
    openConfirm(
      combo.name,
      combo.items.map(i => ({ label: i.label, quantity: i.quantity, price: i.price })),
      totals.price
    );
  }, [openConfirm]);

  const pickRecommendation = useCallback((result: Extract<RecommendResult, { ok: true }>) => {
    openConfirm(
      '确认选择',
      result.items.map(i => ({ label: i.label, quantity: i.quantity, price: i.price })),
      result.total
    );
  }, [openConfirm]);

  const current = MODULES.find(m => m[0] === page) ?? MODULES[0];
  const reminderCount = Object.keys(reminders).length;

  const modePill =
    mcp.mode === 'live' ? { cls: 'live', text: `MCP 已连接 · ${mcp.toolCount} 工具` }
    : mcp.mode === 'error' ? { cls: 'error', text: `MCP 连接失败（${mcp.error?.code}）` }
    : mcp.mode === 'offline' ? { cls: '', text: '演示模式 · 适配服务未启动' }
    : mcp.mode === 'unconfigured' ? { cls: '', text: '演示模式 · 未配置 Token' }
    : { cls: '', text: '正在检测 MCP…' };

  let content: ReactNode;
  switch (page) {
    case 'calendar':
      content = <CalendarPage reminders={reminders} reminderDetails={reminderDetails} onToggleReminder={toggleReminder} notify={notify} mcp={mcp} />;
      break;
    case 'new':
      content = mcp.mode === 'live' ? <LiveMealsPage key="new" mode="new" selection={storeSelection} onSelectStore={setStoreSelection} /> : <NewProductsPage onSelect={selectProduct} mcp={mcp} />;
      break;
    case 'nutrition':
      content = mcp.mode === 'live' ? <LiveMealsPage key="nutrition" mode="nutrition" selection={storeSelection} onSelectStore={setStoreSelection} /> : <NutritionPage onSelect={selectCombo} mcp={mcp} notify={notify} />;
      break;
    case 'blind':
      content = mcp.mode === 'live' ? <LiveMealsPage key="blind" mode="blind" selection={storeSelection} onSelectStore={setStoreSelection} /> : <BlindBoxPage onPick={pickRecommendation} notify={notify} mcp={mcp} />;
      break;
    case 'team':
      content = mcp.mode === 'live' ? <LiveMealsPage key="team" mode="team" selection={storeSelection} onSelectStore={setStoreSelection} /> : <TeamMealPage onPick={pickRecommendation} notify={notify} mcp={mcp} />;
      break;
    case 'agent':
      content = <AgentPage mcp={mcp} notify={notify} />;
      break;
  }

  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="#calendar">
          <span className="brand-mark">M<i>✦</i></span>
          <span>M·SPACE<small>麦当劳灵感工作台</small></span>
        </a>
        <div className="workspace-tag">1024 CREATIVE LAB <span>↗</span></div>
        <div className="nav-label">发现你的麦时刻</div>
        <nav aria-label="工作台模块" className="nav">
          {MODULES.map(([id, name]) => (
            <a key={id} className={`nav-item ${page === id ? 'active' : ''}`} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>
              <Icon name={id} />
              <span>{name}</span>
              <span className="nav-end">{id === 'agent' ? 'AI' : '↗'}</span>
            </a>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="tiny-computer">
            <span>&gt; hello, 麦友_</span>
            <b>吃点好的，<br />灵感就来了。</b>
            <i>● ● ●</i>
          </div>
          <p>独立参赛原型 · 非官方应用</p>
        </div>
      </aside>

      <div className="shell">
        <header className="topbar">
          <span className="breadcrumb">工作台 <span>/</span> <strong>{current[1]}</strong></span>
          <div className="top-actions">
            <span className={`demo-pill ${modePill.cls}`}><i /> {modePill.text}</span>
            <button className="icon-button" onClick={openRemindersList} aria-label="查看我的提醒">
              <Icon name="bell" />
              {reminderCount > 0 && <span className="dot-badge">{reminderCount}</span>}
            </button>
            <button className="avatar" onClick={openAbout} aria-label="查看工作台说明">麦</button>
          </div>
        </header>
        <main>
          <div className="fade-in" key={page}>
            <div className="page-head">
              <div>
                <span className="eyebrow">{current[2]}</span>
                <h1>{current[1]}</h1>
                <p className="subtitle">{current[3]}</p>
              </div>
              <div className="head-note">{page === 'calendar' ? new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }) : <><b>创意体验站</b> · 演示内容已标注</>}</div>
            </div>
            {content}
          </div>
        </main>
        <footer>
          <span>为每一种麦时刻，留一个入口。</span>
          <span>{mcp.mode === 'live' ? '真实数据来自官方 MCP · 仅查询与选餐，不创建订单' : '当前为演示数据 · 未执行真实查询或订单'}</span>
        </footer>
      </div>

      <Modal modal={modal} onClose={() => setModal(null)} />
      <div id="toast" role="status" aria-live="polite" className={toast ? 'show' : ''}>{toast}</div>
    </>
  );
}
