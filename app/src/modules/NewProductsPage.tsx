import { useMemo } from 'react';
import { DEMO_PRODUCTS, type DemoProduct } from '../data/demo';
import { extractNewProductLeads, type NewProductLead } from '../domain/mcd-mapping';
import { useLiveCalendar, type McpStatus } from '../api/mcp';
import { FoodArt } from '../icons';

interface Props {
  onSelect: (product: DemoProduct | NewProductLead) => void;
  mcp: McpStatus;
}

export function NewProductsPage({ onSelect, mcp }: Props) {
  const isLive = mcp.mode === 'live';
  const live = useLiveCalendar(isLive);

  const leads = useMemo(() => (isLive && live.events.length ? extractNewProductLeads(live.events) : []), [isLive, live.events]);

  return (
    <div>
      <div className="notice">
        {isLive
          ? '官方 MCP 没有独立的新品列表工具。以下新品线索由 campaign-calendar 活动正文中的「上新/开售」信号提取，逐条保留来源活动与日期组；无来源依据的不会出现在这里。'
          : '官方 MCP 没有独立的新品列表工具。演示模式下为维护目录示意；真实模式从活动日历提取有来源的新品线索。'}
      </div>

      {isLive && (
        <div className="mode-banner">
          <span className="badge">真实数据</span>
          {live.loading && '正在从活动日历提取新品线索…'}
          {!live.loading && live.error && <span style={{ color: '#8c3a2e' }}>活动日历获取失败：{live.error}</span>}
          {!live.loading && !live.error && `从 ${live.events.length} 个实时活动提取到 ${leads.length} 条新品线索。`}
        </div>
      )}
      {!isLive && mcp.mode !== 'error' && mcp.mode !== 'loading' && (
        <div className="mode-banner">演示模式：新品为维护目录示意，不代表官方在售。</div>
      )}

      <div className="section-line module-tabs">
        <span className="subtitle">{isLive ? `${leads.length} 条有来源的新品线索 · 来源 campaign-calendar` : `上新目录示意 · ${DEMO_PRODUCTS.length} 件灵感新品`}</span>
      </div>

      <div className="grid">
        {isLive && leads.map(l => (
          <article key={l.id} className="product card">
            <div className="product-art rose">
              <span className="badge">新品线索</span>
              {l.imageUrl ? (
                <img
                  src={l.imageUrl}
                  alt={l.name}
                  loading="lazy"
                  style={{ maxHeight: 140, maxWidth: '86%', objectFit: 'contain', background: '#fbeae4', borderRadius: 8 }}
                />
              ) : (
                <div style={{ fontSize: 40 }} aria-hidden="true">🆕</div>
              )}
            </div>
            <div className="product-body">
              <h3>{l.name}</h3>
              <p>{l.desc}</p>
              <p className="source-line">
                来源活动：{l.sourceTitle.slice(0, 40)}{l.sourceTitle.length > 40 ? '…' : ''}
                <br />
                日历日期组：{l.sourceDays.join('、')}
                {l.launchHint ? ` · 正文开售线索：${l.launchHint}` : ' · 正文未见明确开售时间，不虚构日期'}
              </p>
              <div className="price-row">
                <span className="price">—<small>价格需门店联调</small></span>
                <button className="primary" onClick={() => onSelect(l)}>看看新品 ↗</button>
              </div>
            </div>
          </article>
        ))}

        {!isLive && DEMO_PRODUCTS.map(p => (
          <article key={p.id} className="product card">
            <div className={`product-art ${p.tone}`}>
              <span className="badge">{p.tag}</span>
              <FoodArt type={p.art} />
            </div>
            <div className="product-body">
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
              <p className="source-line">{p.source}</p>
              <div className="price-row">
                <span className="price">¥{p.price}<small>演示价</small></span>
                <button className="primary" onClick={() => onSelect(p)}>看看新品 ↗</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
