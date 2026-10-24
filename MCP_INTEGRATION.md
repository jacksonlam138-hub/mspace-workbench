# MCP 接入说明

更新：2026-10-25。Server 为麦当劳中国官方 `https://mcp.mcd.cn`，Streamable HTTP / JSON-RPC，Bearer Token 只在 Node 服务端使用。

## 接入路径

前端 → 本机 `/api/mcp/call` → Host / Origin 校验 → 只读名单 → 实时 JSON Schema 与条件参数校验 → MCP → 业务错误识别 → 结构化解析 → 页面。

模型模式另经 `/api/mcp/agent`，使用服务端模型凭证。每次请求前对历史及工具描述脱敏；工具结果截长后进入下一轮。最多五次调用，每轮仅一个只读工具。缺参返回表单，不猜门店、地址或规格。AJV 验证 JSON Schema；不自动强转或填默认参数。

## 实际使用

| 工具 | 页面价值 | 实测 |
| --- | --- | --- |
| now-time-info | 北京时间和日历今天 | 成功 |
| campaign-calendar | 月历、分组筛选、详情、站内提醒 | 14 个去重活动 / 10 日期组 |
| list-nutrition-foods | 精选组合营养汇总 | 160 行 / 去重后 158 条 |
| query-nearby-stores | 用户明确城市地点后选店 | 北京王府井 5 家；MAgent 补参成功 |
| query-meals | 门店当前或预约菜单、新品标签 | 样本门店 95 项 / 13 上新 |
| query-meal-detail | 规格确认、默认组件、营养精确名称 | 玉米杯解析为小杯玉米杯 |
| calculate-price | 真实商品份数的整单核价 | 新品、营养、盲盒、6 人团餐均成功 |

样本：公开门店 1950526，北京新东安二号餐厅；预约 2026-10-25 12:00，到店自取。结果为当时证据，不能保证其他门店或时段价格相同。

- 龙焰鸡腿堡 ×1：1590 分。
- 板烧鸡腿堡 + 小杯玉米杯：3650 分，444 千卡 / 蛋白质 25g。
- 酥酥多笋卷 + 纯悦：2850 分；换一套得到牛肉堡单品精选 + 中薯条，2850 分。
- 麦辣鸡腿汉堡 ×6 + 纯悦 ×6：18000 分，总预算留空按 6×30 元处理。

核价使用详情的默认规格、组件与特调选项；默认数量缺失或非法直接拒绝。API 的菜单价为元字符串，整单价为整数分，领域计算统一使用分。明细编码和份数必须与请求一致，超预算拒绝成功。

## 能力与安全边界

实时 tools/list 共 35 项，详见 `docs/workbuddy/live-tools-2026-10-25.json`。MAgent 展示全部能力；28 个只读工具允许填参，7 个写操作固定拒绝：create-order、cancel-order、auto-bind-coupons、mall-create-order、draw-lottery、party-order-create、delivery-create-address。不存在写入绕过开关。

客户端支持分页、SSE 请求 ID 匹配、会话失效重建一次、响应体超时；HTTP 200 但 isError 或显式业务失败仍判失败。无凭证进入明确演示模式；真实请求失败不静默替换示例数据。

个人账号、券、订单、商城、派对等其余查询未逐一真实验证。外部对话模型未配置，仅本地协议及工具循环测试通过；默认直连模式已实测。

配置示例中的 `${MCD_MCP_TOKEN}` 由所使用的 MCP 客户端按其环境变量语法解析；本应用直接读取 `server/.env`，不读取该 JSON 示例。

证据及最终范围见 [ACCEPTANCE.md](docs/ACCEPTANCE.md)。
