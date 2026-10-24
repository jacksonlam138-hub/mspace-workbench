# 来源与素材（SOURCES）

## 官方来源

| 内容 | 来源 | 说明 |
| --- | --- | --- |
| MCP Server 接入（传输/认证/限流/工具文档） | https://github.com/M-China/mcd-mcp-server （README 2026-10-01，版本日志 1.0.9） | 接入依据；实时以 tools/list 为准（35 个） |
| MCP Token 申请 | https://open.mcd.cn/mcp | 用户自行申请，本项目不代管 |
| 比赛规则 | https://github.com/M-China/mcd-developer-innovation-challenge/blob/main/activityGuidelines.md | 2026-10-25 核对 |
| 活动内容/图片 URL、营养数据 | mcp.mcd.cn 实时返回 | 展示时标注来源与获取时间 |

## 第三方依赖

- react / react-dom 18（MIT）
- vite 5（MIT）、@vitejs/plugin-react（MIT）、typescript 5（Apache-2.0）
- vitest 2（MIT）、@playwright/test（Apache-2.0）
- ajv 8（MIT）、pnpm（MIT）
- 字体：Noto Sans SC、Space Mono — Google Fonts CDN（OFL 1.1），加载失败回退系统字体

完整版本锁定见 `app/pnpm-lock.yaml`。

## 项目自产素材

- 视觉设计（青绿/金黄/像素元素）：原创
- 全部内联 SVG 插画（汉堡/薯条/饮品/鸡块/套餐）：项目内原创绘制
- 演示数据（demo 模式的活动/商品/组合）：虚构示意，UI 标注「演示」
- 精选组合目录（COMBO_SPECS）：项目自配，品名与官方营养表精确名核对（2026-10-25，158 条）

## 示例数据边界

- 演示模式所有价格/活动为虚构，不代表官方供应
- 新品以选定门店菜单的上新标签为准；不推断上市日期
- 营养表仅用于营养，价格另从门店菜单及 calculate-price 获取
