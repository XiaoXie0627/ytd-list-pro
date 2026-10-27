# 多归属改造计划（Plan）

> 2026-10-26 经 grilling 决策流程定案。来源：三轮 HTML 决策页（已归档回收站）+ 最终共识确认。

## 目标

把「一个频道只能属于一个分类」改造为「一个频道可同时属于任意多个分类」，并按定案模型对项目做整体重构。

## 领域术语

- **归属（membership）**：频道与分类之间的多对多关系，唯一事实。
- **展示顺序（order）**：频道在某分类内的排列，仅影响显示（手动拖拽排序写它），不是归属事实。
- **未分类（uncategorized）**：隐式状态——不属于任何用户分类的频道。不是可显式挂靠的桶。

## 定案决策

| # | 决策 | 结论 |
|---|---|---|
| S1 | 实施范围 | 按定案模型整体重构：state 层重写 + 迁移 + 侧边栏/管理面板/快加按钮全部适配 |
| Q1+Q9 | 数据模型 | 归一化：`state.memberships: Record<频道id, 分类id[]>` 为唯一归属事实，只存非空条目；`category.channelIds` 降级为该分类展示顺序；删除 `uncategorizedChannelIds`（派生）；`schemaVersion` 1→2 迁移，旧键保留一版备份 |
| Q2 | 未分类语义 | 隐式：零归属即在未分类；加入任一分类自动离开；从所有分类移除自动回来；不能显式挂在未分类同时又属于别的分类 |
| Q3 | 管理面板 | 「添加到」与「移动到」并存（移动 = 清空全部归属再加入目标）；频道行显示所属分类徽章，徽章可单独 × 移除 |
| Q4 | 快加按钮 | toggle：按钮显示全部所属分类徽章；菜单里点未加入的分类 = 加入，再点已加入的 = 移除 |
| Q5 | 展示与搜索 | 侧边栏在每个所属分类下都显示该频道；跨分类搜索按频道去重，命中项列出全部所属分类名 |
| Q6 | CSV | 导出每个「分类 × 频道」对一行；导入改为幂等添加（同一频道多行 = 加入多个分类）；README 同步更新 |
| S2 | 滚动 bug | **本次不动**（保持 MVP）：点频道整页刷新的现状保留，记入 backlog |
| S3 | popup | **最小适配**：保证 typecheck/测试通过，不同步新交互；popup 定位（留/删/转正/重做）留作后续专题 |

## 数据模型（v2）

```ts
interface ExtensionState {
  schemaVersion: 2;
  channels: Record<string, Channel>;
  categories: Record<string, Category>;      // channelIds = 展示顺序（仅存成员）
  categoryOrder: string[];
  memberships: Record<string, string[]>;     // 频道id -> 分类id[]（唯一归属事实，非空才存）
  ui: { sidebarMode; expandedCategoryIds };
  importedLegacyData: boolean;
  lastSyncedAt?: number;
}
```

不变量：

1. `memberships[ch]` 中的每个分类 id 必须存在于 `categories`，且 `ch` 必须存在于 `channels`。
2. `category.channelIds` 的集合 == `{ ch | memberships[ch] 含该分类 }`（顺序自由）。
3. 未分类永不入 `memberships`；`categories.uncategorized.channelIds` 恒为空。

## 迁移（v1 → v2）

加载时若读到 v1 结构（含 `uncategorizedChannelIds`、无 `memberships`）：

1. 遍历各分类（除未分类）的 `channelIds`，构建 `memberships`（旧数据每频道至多一桶，转换无歧义；若遇重复桶则全部收入，天然合法）。
2. `uncategorizedChannelIds` 丢弃（这些频道零归属 = 未分类，隐式表达）。
3. 各分类 `channelIds` 原样保留为展示顺序。
4. 写回 `schemaVersion: 2`。旧版存储键（legacy 备份机制）不受影响。

## 实施顺序

1. **state 层**：`types.ts` / `constants.ts`（schemaVersion 2）/ `state.ts` 全量重写（memberships 事实 + 顺序数组维护 + 增/移/移动三组原语 + 派生查询 + 搜索去重 + legacy import 适配）
2. **storage 层**：`storage.ts` 加载时 v1→v2 迁移并回写
3. **内容脚本 UI**：`quick-add.ts`（toggle + 多徽章）、`manager.ts`（添加到/移动到 + 频道行徽章 ×）、`sidebar.ts`（无结构变化）、`content/index.ts`（handler 接线）
4. **popup 最小适配**（S3）
5. **CSV**：`transfer.ts` 适配；导入幂等（`upsertChannelToCategory` 语义 = 确保归属）
6. **文档**：README.md / README.en.md / 仓库 CLAUDE.md 同步
7. **测试**：迁移、多归属原语、toggle、幂等导入；全部测试 + typecheck 通过

## Backlog（本次明确不做）

- 滚动 bug：点频道整页刷新致滚动/侧边栏重置（S2，后续专门处理，候选方案见决策记录：新标签页 / SPA 导航 / 恢复滚动）
- popup 定位专题：删除 / 转正为工具栏轻量入口 / 以 React 为主重做（S3）

---

# 管理面板置顶与拖拽排序（v0.3.0）

> 2026-10-26 经 grilling 决策流程定案（四轮 HTML 决策页 + 最终共识确认，已归档回收站）。

## 定案决策

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 置顶粒度 | 每分类独立置顶，互不影响 |
| Q2 | 置顶呈现 | 图钉按钮开关；置顶排最前 + 淡色高亮（无分隔线、无跨区拖拽） |
| Q3 | 生效范围 | 置顶与自定义顺序**仅管理大面板生效**；订阅侧栏维持加入先后顺序不变 |
| Q4 | 操作入口 | 拖拽排序与图钉仅在管理大面板；侧边栏只读 |
| Q5 | 拖拽与排序下拉 | 仅「手动排序」模式允许拖拽重排，其他模式禁用 |
| Q6 | 未分类 | 不支持置顶/排序，保持同步顺序 |
| Q7 | 面板调整大小 | 分类/频道栏间分割线可拖 + 抽屉外框可调宽高，均记住尺寸 |
| Q8 | 排序记忆 | 排序模式持久化（state.ui.managerSortMode），新装默认「手动排序」 |
| Q9 | 多选拖拽 | 一期仅单个频道拖拽；多选保留给移动/加入分类 |
| Q10 | 置顶与排序 | 置顶区永远置顶，排序下拉只作用于普通区 |

## 数据模型（schemaVersion 2 不变，字段可选）

```ts
interface Category {
  // ...
  pinnedChannelIds?: string[];  // 置顶块顺序（管理面板专用）
  manualChannelIds?: string[];  // 普通区手动顺序（管理面板专用；缺省回退 channelIds）
}

interface ExtensionState {
  ui: {
    // ...
    managerSortMode?: ChannelSortMode;  // 记忆排序模式，缺省视为 "manual"
    managerLayout?: ManagerLayout;      // { leftPaneWidth?; drawerWidth?; drawerHeight? }
  };
}
```

新增不变量（在 v2 三条之外）：

4. `pinnedChannelIds` / `manualChannelIds` 均为该分类成员集合的子集（无重复）；移出分类、退订（sync 剪枝）、handle 重映射都要同步维护。
5. `channelIds` 是侧边栏的加入顺序事实，置顶/拖拽操作**不得改写**它。
6. 管理面板展示 = 置顶块（`pinnedChannelIds` 顺序）+ 普通区（`manualChannelIds` ?? `channelIds` 去置顶，按当前排序模式排序）；读取时丢弃非成员 id（读时修复）。

新增状态原语（`state.ts`）：`toggleChannelPin`、`moveChannelInCategory(zone)`、`getCategoryChannelView`、`setManagerSortMode`、`setManagerLayout`。

---

# 频道更新聚合点与明暗主题（v0.4.1 主题 + v0.5.0 红点）

> 2026-10-27 经 grilling 决策流程定案（第 1 轮 HTML 决策页全 10 题作答；决策页在 `docs/dot-theme/`，已 gitignore）。

## 定案决策

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 「新内容」信号 | 镜像官方：读取隐藏原生订阅区块的官方 newness 小圆点，不自算、零网络请求 |
| Q2 | 红点形态 | 仅分类标题旁聚合点（频道行不加角点）；未分类区块同理 |
| Q3 | 红点颜色 | 橘色 #ff9142（放弃官方蓝） |
| Q4 | 覆盖范围 | 全部订阅频道，含未分类 |
| Q5 | 出现界面 | 仅 YouTube 侧边栏分类列表 |
| Q6 | 主题机制 | 自动跟随 YouTube（`html[dark]` 属性实时监听）+ 手动三态（自动/亮/暗），默认自动 |
| Q7 | 切换入口 | 仅管理面板头部三段钮；侧边栏零打扰只跟随 |
| Q8 | 暗色配色 | 暖橘棕整槽：面板底 #211b16 系 + 橙 accent（#e8934a/#ff9142）+ 暖米白文字；亮色保持现状仅 token 化 |
| Q9 | 偏好存储 | `state.ui.theme`（每账号），缺省视为 auto |
| Q10 | 交付顺序 | 主题先行（v0.4.1 修暗色不可见），红点随后单独一版（v0.5.0） |

实现默认（工程判断，可推翻）：三处 UI（侧边栏/管理面板/快加）统一走自持 token（含快加，否则暗色下同样不可见）；聚合点仅在「分类」模式渲染；「镜像」意味着不新增任何已读存储。

## 里程碑 1：主题（v0.4.1，先做）

根因：三处 UI 样式全部依赖 `--yt-spec-*` 变量 + 亮色兜底值，暗色下变量未按预期生效、兜底深字落在深底上 → 完全不可见。修复 = 自持 token（`data-ytdlp-theme` 属性作用在三个 UI root 上）。

1. `types.ts`：`ThemePreference = "auto" | "light" | "dark"`；`ui.theme?`（缺省 = auto）
2. `state.ts`：`cloneState` 保留 theme；新增 `setThemePreference`
3. 新 `content/theme.ts`：`THEME_STYLES`（token 表）+ `isPageDark` / `resolveTheme` / `applyTheme` / `watchPageTheme`
4. `sidebar.ts` / `manager.ts` / `quick-add.ts`：全部 `--yt-spec-*` 换 `--ytdlp-*`；管理面板左栏头部加「自动/亮/暗」三段钮
5. `content/index.ts`：`ensureStyles` 拼入 THEME_STYLES；`refreshTheme` 把解析结果打到三个 root；`watchPageTheme` 实时跟随；`onSetTheme` 接线
6. 测试：`setThemePreference`、`resolveTheme`、`watchPageTheme`；typecheck + 全测通过；版本双处 bump 0.4.1

token 表（亮 = 现状等值复刻；暗 = 暖橘棕）：

| token | 亮 | 暗 |
|---|---|---|
| `--ytdlp-text` / `--ytdlp-text-secondary` | #0f0f0f / #606060 | #f2e9dd / #bfae9c |
| `--ytdlp-accent` / `--ytdlp-accent-contrast` | #0f0f0f / #fff | #e8934a / #241a12 |
| `--ytdlp-cta` / `--ytdlp-cta-soft` / `--ytdlp-cta-contrast` | #065fd4 / rgba(6,95,212,.1) / #fff | #ff9142 / rgba(255,145,66,.16) / #241a12 |
| `--ytdlp-chip` / `--ytdlp-chip-strong` / `--ytdlp-chip-hover` | 黑 alpha .05/.08/.10 | 白 alpha .07/.10/.13 |
| `--ytdlp-border` / `--ytdlp-surface` | rgba(0,0,0,.12) / #fff | rgba(255,255,255,.12) / #262019 |
| `--ytdlp-panel` / `--ytdlp-panel-border` | transparent / transparent | #211b16 / rgba(255,255,255,.07) |
| `--ytdlp-backdrop` / `--ytdlp-backdrop-strong` | rgba(0,0,0,.18) / .24 | rgba(0,0,0,.5) / .55 |
| `--ytdlp-danger` / `--ytdlp-danger-soft` | #dc2626 / #fee2e2 | #ff8a7a / rgba(248,113,93,.18) |

## 里程碑 2：更新聚合点（v0.5.0，主题发版后）

- **信号采集**：直接扫描全文档 `ytd-guide-entry-renderer`（实测 2026-10 的 YouTube guide section 已无标题元素，按「订阅」文字找区块不可靠；newness 点只出现在订阅条目上）。dot 元素预置于每个条目、按频道切换可见性，故仅当 dot 当前显示（无 `hidden`、自身 `display/visibility` 非 none）才计入；按条目链接（`/channel/UC…` 或 `/@handle`）映射到频道 id/handle，得到「有新内容的频道集合」
- **渲染**：分类模式侧边栏每个分类标题旁，任一成员在集合中即点亮约 8px 橘点（#ff9142）；未分类标题同理；「原始」模式不渲染
- **时机**：侧边栏挂载时计算 + 复用现有 guide MutationObserver 节流复算；官方清除即自动消失（纯镜像，无已读状态）
- **风险**：YouTube DOM 改版会让点静默消失——做能力探测，读不到原生区块时保持无点不报错

## Backlog（本轮明确不做）

- RSS / InnerTube 自算新内容（Q1 备选，镜像失效时再启用）
- 频道行角点（Q2 未选）、管理面板/快加红点（Q5 未选）
- 滚动 bug、popup 定位（沿用既有 backlog）
