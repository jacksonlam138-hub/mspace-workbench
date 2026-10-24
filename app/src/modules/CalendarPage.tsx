import { useMemo, useState } from 'react';
import { DEMO_EVENTS, type DemoEvent } from '../data/demo';
import { beijingToday, statusOf, type McpEvent } from '../domain/mcd-parsers';
import { useLiveCalendar, useLiveTime, type McpStatus } from '../api/mcp';
import { FoodArt, Icon } from '../icons';
import { Modal } from '../components/Modal';
import type { ReminderDetails } from '../domain/reminders';

interface Props {
  reminders: Record<string, 'start' | 'day-before'>;
  reminderDetails: Record<string, ReminderDetails>;
  onToggleReminder: (eventId: string, timing: 'start' | 'day-before', details?: ReminderDetails) => void;
  notify: (text: string) => void;
  mcp: McpStatus;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
/** 真实活动无分类字段，用关键词做轻量归类（仅影响筛选展示，不改数据） */
function liveKind(ev: McpEvent): string {
  if (/上新|开售|新品/.test(ev.title + ev.description)) return '上新/开售';
  if (/会员|券|优惠|省/.test(ev.title)) return '会员/优惠';
  return '品牌/其他';
}

export function CalendarPage({ reminders, reminderDetails, onToggleReminder, mcp }: Props) {
  const isLive = mcp.mode === 'live';
  const live = useLiveCalendar(isLive);
  const time = useLiveTime(isLive);
  const [month, setMonth] = useState<number>(Number(beijingToday().slice(5, 7)));
  const [detail, setDetail] = useState<DemoEvent | McpEvent | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [filter, setFilter] = useState('全部');
  const filters = isLive ? ['全部', '今日收录', '后续日历'] : ['全部', '进行中', '即将开始'];

  // 北京时间今天：live 时优先用服务端日期，兜底本地换算（不依赖系统时区）
  const todayIso = isLive ? (time.date ?? beijingToday()) : beijingToday();
  const liveEvents = live.events;

  // 日历点标记：live 用活动出现日期（跨天活动每天都有点）；demo 沿用区间
  const dayHasEvent = (iso: string) => {
    if (isLive) return liveEvents.some(e => e.days.includes(iso));
    return DEMO_EVENTS.some(e => e.startDay <= iso && e.endDay >= iso);
  };

  const year = Number(todayIso.slice(0, 4));
  const detailsFor = (event: DemoEvent | McpEvent): ReminderDetails => {
    const selected = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    return { title: event.title, date: 'days' in event
      ? (event.days.includes(selected) ? selected : event.days.find(date => date >= todayIso) ?? event.days[0] ?? '')
      : event.startDay };
  };
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    const valid = d > 0 && d <= count;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Math.max(d, 1), count)).padStart(2, '0')}`;
    const has = valid && dayHasEvent(iso);
    const isToday = valid && iso === todayIso;
    if (!valid) return <span key={i} className="day muted" />;
    return (
      <button
        key={i}
        aria-label={`${month}月${d}日`}
        aria-pressed={day === d}
        className={`day ${isToday ? 'today' : ''} ${day === d ? 'selected' : ''}`}
        onClick={() => setDay(d)}
      >
        {d}
        {has && <span className="dot"><i /></span>}
      </button>
    );
  });

  // 列表：live 时按选中日过滤（跨天活动在其出现的每天都会列出），未选日显示全部近期
  const list = useMemo(() => {
    if (isLive) {
      const dayIso = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
      return liveEvents
        .filter(ev => (dayIso ? ev.days.includes(dayIso) : true))
        .map(ev => ({ ev, status: statusOf(ev, todayIso) }))
        .filter(({ status }) => filter === '全部' || status === filter)
        .sort((a, b) => a.ev.days[0].localeCompare(b.ev.days[0]));
    }
    return DEMO_EVENTS
      .filter(e => {
        const dayIso = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
        return !dayIso || (e.startDay <= dayIso && e.endDay >= dayIso);
      })
      .map(ev => ({ ev, status: ev.status as string }))
      .filter(({ status }) => filter === '全部' || status === filter);
  }, [isLive, liveEvents, day, month, filter, todayIso, year]);

  const dueTitles = useMemo(() => {
    const out: string[] = [];
    for (const [id, timing] of Object.entries(reminders)) {
      const saved = reminderDetails[id];
      if (saved) {
        const due = timing === 'day-before' ? addDays(saved.date, -1) : saved.date;
        if (due === todayIso) out.push(saved.title);
        continue;
      }
      const demoEv = !isLive ? DEMO_EVENTS.find(e => String(e.id) === id) : undefined;
      const liveEv = isLive ? liveEvents.find(e => e.id === id) : undefined;
      if (!demoEv && !liveEv) continue;
      const start = liveEv ? liveEv.days[0] : demoEv!.startDay;
      const end = liveEv ? liveEv.days[liveEv.days.length - 1] : demoEv!.endDay;
      if (end < todayIso) continue;
      const dueDay = timing === 'day-before' ? addDays(start, -1) : start;
      if (dueDay === todayIso) out.push(liveEv ? liveEv.title : demoEv!.title);
    }
    return [...new Set(out)];
  }, [reminders, reminderDetails, isLive, liveEvents, todayIso]);

  const loading = isLive && live.loading;

  return (
    <div>
      {dueTitles.length > 0 && (
        <div className="due-banner" role="status">
          <Icon name="bell" />
          <span>今天到期提醒：{dueTitles.join('、')}（站内提醒，仅保存在本浏览器）</span>
        </div>
      )}
      {isLive && (
        <div className="mode-banner">
          <span className="badge">真实数据</span>
          已连接麦当劳 MCP（{mcp.toolCount} 工具）。日历与列表由 campaign-calendar 实时数据驱动
          {time.date ? `，服务器日期 ${time.date}` : ''}。
          {loading && ' 正在加载…'}
          {live.error && <span style={{ color: '#8c3a2e' }}>（实时活动获取失败：{live.error}，本月无实时标注）</span>}
        </div>
      )}
      {mcp.mode === 'error' && (
        <div className="mode-banner error">
          实时连接失败（{mcp.error?.code}：{mcp.error?.message}），当前展示演示数据。
        </div>
      )}
      {!isLive && mcp.mode !== 'error' && mcp.mode !== 'loading' && (
        <div className="mode-banner">演示模式：活动为演示数据，未连接麦当劳 MCP。</div>
      )}

      <div className="calendar-top">
        <section className="calendar card" aria-label="月度日历">
          <div className="calendar-toolbar">
            <div className="month-label">
              {year} / {String(month).padStart(2, '0')}
              <small>{isLive ? (live.error ? '实时数据获取失败' : `${liveEvents.length} 个实时活动`) : '演示数据'}</small>
            </div>
            <div className="calendar-controls">
              <button aria-label="上个月" disabled={month <= 1} onClick={() => { setMonth(m => m - 1); setDay(null); }}>‹</button>
              <button onClick={() => { setMonth(todayIso ? Number(todayIso.slice(5, 7)) : month); setDay(todayIso ? Number(todayIso.slice(8)) : null); }}>今天</button>
              <button aria-label="下个月" disabled={month >= 12} onClick={() => { setMonth(m => m + 1); setDay(null); }}>›</button>
            </div>
          </div>
          <div className="week">{WEEK.map(d => <span key={d}>{d}</span>)}</div>
          <div className="days">{cells}</div>
          <div className="calendar-legend">
            <span>· 有活动的日子</span>
            <span>· 今天</span>
            <span style={{ marginLeft: 'auto' }}>
              {isLive ? `实时 ${liveEvents.length} 个活动` : '演示数据'}
            </span>
          </div>
        </section>
        <section className="feature card">
          <span className="eyebrow">SPECIAL DAY</span>
          <h2>把期待的日子<br />提前圈起来</h2>
          <div className="feature-code">M✦</div>
          <p>{isLive && liveEvents.length ? '活动来自麦当劳实时日历。' : '日历与活动列表，一站看全。'}</p>
          <div className="feature-illustration"><FoodArt type="meal" /></div>
          <div className="feature-bottom">
            <span>活动日历 · 六场景之一</span>
          </div>
        </section>
      </div>

      <div className="section-line">
        <h2>
          {day ? `${month} 月 ${day} 日` : '近期活动'}
          <small>{list.length} 个活动 · {isLive ? '实时' : '演示'}</small>
        </h2>
        <div className="chips">
          {filters.map(f => (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
          {day && <button className="text-button" onClick={() => { setDay(null); setFilter('全部'); }}>显示全部</button>}
        </div>
      </div>

      {list.length === 0 && (
        <div className="card empty">
          {isLive ? (live.error ? `实时查询失败：${live.error}` : loading ? '正在加载实时活动…' : '这一天没有活动，或当前日历未覆盖。') : '这一天还没有演示活动。'}
          {day && <br />}
          {day && <button className="text-button" onClick={() => { setDay(null); setFilter('全部'); }}>查看全部活动 →</button>}
        </div>
      )}

      {list.map(({ ev, status }) => isLive ? (
        <article key={(ev as McpEvent).id} className="event-row card">
          <div className="event-date">{Number((ev as McpEvent).days[0].slice(-2))}<small>{MONTHS[(ev as McpEvent).days[0].slice(5, 7)]}</small></div>
          <div className="event-info">
            <span className={`badge ${status === '今日收录' ? '' : status === '历史收录' ? 'grey' : 'amber'}`}>{status}</span>
            <h3>{(ev as McpEvent).title}</h3>
            <p>{(ev as McpEvent).description.split('\n')[0].slice(0, 80)}</p>
            <p className="source-line">
              日期组：{(ev as McpEvent).days.join('、')} · 来源：campaign-calendar · {liveKind(ev as McpEvent)}
            </p>
            <button className="text-button" onClick={() => setDetail(ev)}>查看详情</button>
          </div>
          <button
            className={`remind ${reminders[(ev as McpEvent).id] ? 'saved' : ''}`}
            onClick={() => onToggleReminder((ev as McpEvent).id, reminders[(ev as McpEvent).id] ?? 'start', detailsFor(ev))}
          >
            <Icon name="bell" />
            {reminders[(ev as McpEvent).id] ? '已设提醒' : '提醒我'}
          </button>
        </article>
      ) : (
        <article key={(ev as DemoEvent).id} className="event-row card">
          <div className="event-date">{Number((ev as DemoEvent).startDay.slice(-2))}<small>OCT</small></div>
          <div className="event-thumb"><FoodArt type={(ev as DemoEvent).art} /></div>
          <div className="event-info">
            <span className={`badge ${(ev as DemoEvent).status === '进行中' ? '' : 'amber'}`}>{(ev as DemoEvent).status}</span>
            <h3>{(ev as DemoEvent).title}</h3>
            <p>{(ev as DemoEvent).desc}</p>
            <button className="text-button" onClick={() => setDetail(ev)}>查看详情</button>
          </div>
          <button
            className={`remind ${reminders[String((ev as DemoEvent).id)] ? 'saved' : ''}`}
            onClick={() => onToggleReminder(String((ev as DemoEvent).id), reminders[String((ev as DemoEvent).id)] ?? 'start', detailsFor(ev))}
          >
            <Icon name="bell" />
            {reminders[String((ev as DemoEvent).id)] ? '已设提醒' : '提醒我'}
          </button>
        </article>
      ))}
      {isLive && live.fetchedAt && (
        <p className="help" style={{ marginTop: 12 }}>
          实时数据获取于 {new Date(live.fetchedAt).toLocaleTimeString('zh-CN')}；活动按服务返回日期归属展示，正文提及的开售日与日历分组日分别处理，不虚构结束日期。
        </p>
      )}
      <Modal onClose={() => setDetail(null)} modal={detail ? {
        title: detail.title,
        body: <>
          <p className="dialog-copy" style={{ whiteSpace: 'pre-wrap' }}>{'description' in detail ? detail.description : detail.desc}</p>
          {'imageUrls' in detail && detail.imageUrls.map(url => <img key={url} src={url} alt={detail.title} style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain' }} />)}
          <p className="source-line">{'days' in detail ? `日历收录日期：${detail.days.join('、')}。以正文活动说明为准，收录日不代表起止时间。` : `演示活动：${detail.startDay} 至 ${detail.endDay}`}</p>
          <p className="dialog-copy">提醒日期：{detailsFor(detail).date || '未提供'} · 仅在当前浏览器内提醒。</p>
        </>,
        actions: reminders[String(detail.id)]
          ? <button className="secondary" onClick={() => { onToggleReminder(String(detail.id), reminders[String(detail.id)]); setDetail(null); }}>取消提醒</button>
          : <>
            <button className="secondary" disabled={!detailsFor(detail).date} onClick={() => { onToggleReminder(String(detail.id), 'day-before', detailsFor(detail)); setDetail(null); }}>提前一天提醒</button>
            <button className="primary" disabled={!detailsFor(detail).date} onClick={() => { onToggleReminder(String(detail.id), 'start', detailsFor(detail)); setDetail(null); }}>当天提醒</button>
          </>
      } : null} />
    </div>
  );
}

const MONTHS: Record<string, string> = { '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC' };

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
