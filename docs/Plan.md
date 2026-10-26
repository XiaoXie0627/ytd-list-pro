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
