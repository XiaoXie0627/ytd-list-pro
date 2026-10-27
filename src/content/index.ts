import { MESSAGE_TYPES, type CollectSubscriptionsResponse } from "../shared/messages";
import {
  addCategory,
  addChannelsToCategory,
  deleteCategory,
  findChannelByIdOrHandle,
  getChannelsForCategory,
  importChannelsToCategories,
  mergeSubscriptions,
  moveChannelInCategory,
  moveChannels,
  nextCategoryColor,
  removeChannelFromCategory,
  renameCategory,
  reorderCategories,
  refreshDefaultColors,
  searchAllChannels,
  setCategoryAppearance,
  setChannelCategories,
  setManagerLayout,
  setManagerSortMode,
  setSidebarMode,
  setThemePreference,
  toggleCategoryExpanded,
  toggleChannelPin,
  upsertChannelToCategory
} from "../shared/state";
import {
  activateAccount,
  activeStateStorageKey,
  DEFAULT_ACCOUNT_ID,
  isExtensionContextInvalidated,
  loadLegacyBackupState,
  loadOrImportInitialState,
  restoreLegacyBackup,
  updateState
} from "../shared/storage";
import type { Channel, ChannelOrderZone, ChannelSortMode, ExtensionState, ManagerLayout, SidebarMode, ThemePreference } from "../shared/types";
import { UNCATEGORIZED_ID } from "../shared/constants";
import { buildCategoriesCsv, parseCategoriesCsv } from "../shared/transfer";
import { parseSubscriptionsFromDocument } from "../shared/youtube-parser";
import { type CategoryDraft, MANAGER_STYLES, type ManagerUiState, type PickerMode, renderManager } from "./manager";
import {
  findQuickAddAnchor,
  QUICK_ADD_ROOT_ID,
  QUICK_ADD_STYLES,
  quickAddSignature,
  readPageChannel,
  renderQuickAdd
} from "./quick-add";
import { collectNewnessChannelIds } from "./newness";
import { renderSidebar, SIDEBAR_STYLES } from "./sidebar";
import { applyTheme, isPageDark, resolveTheme, THEME_STYLES, watchPageTheme } from "./theme";
import { readSubscriptionsFromPageSession } from "./session-bridge";
import { navigateWithinYouTube } from "./spa-navigate";

const ROOT_ID = "ytdlp-sidebar-root";
const MANAGER_ROOT_ID = "ytdlp-manager-root";
const STYLE_ID = "ytdlp-sidebar-style";
const CLEANUP_KEY = "__YTDLP_CLEANUP__";

type CleanupWindow = Window & {
  [CLEANUP_KEY]?: () => void;
};

let currentState: ExtensionState | undefined;
let originalSubscriptionsSection: HTMLElement | undefined;
let mountTimer: number | undefined;
let guideObserver: MutationObserver | undefined;
let managerOpen = false;
let draggedCategoryId: string | undefined;
let quickAddTimer: number | undefined;
let newnessTimer: number | undefined;
let lastNewnessKey: string | undefined;
let activatedAccountId: string | undefined;

// YouTube exposes a per-account DATASYNC_ID in inline page config; switching
// accounts always reloads the page, so one successful detection is stable for
// the lifetime of this content script.
const detectYouTubeAccountId = (): string | undefined => {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text || !text.includes("DATASYNC_ID")) {
      continue;
    }
    const match = text.match(/"DATASYNC_ID"\s*:\s*"([^"|]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
};

const ensureAccountActive = async () => {
  const found = detectYouTubeAccountId();
  if (found === undefined && activatedAccountId !== undefined) {
    return;
  }
  const target = found ?? DEFAULT_ACCOUNT_ID;
  if (activatedAccountId === target) {
    return;
  }
  activatedAccountId = target;
  await activateAccount(target);
};
let managerUi: ManagerUiState = {
  selectedCategoryId: UNCATEGORIZED_ID,
  selectedChannelIds: [],
  search: "",
  sortMode: "manual",
  status: "准备就绪"
};

const safeAsync = async <T>(operation: () => Promise<T>, fallback?: T): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return fallback;
    }
    console.warn("[YTD List Pro]", error);
    return fallback;
  }
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${THEME_STYLES}\n${SIDEBAR_STYLES}\n${MANAGER_STYLES}\n${QUICK_ADD_STYLES}`;
  document.head.append(style);
};

const findGuideContainer = (): HTMLElement | undefined => {
  const selectors = [
    "ytd-guide-renderer #sections",
    "#guide-content #sections",
    "tp-yt-app-drawer #sections",
    "ytd-mini-guide-renderer"
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
  }
  return undefined;
};

const findSubscriptionsSection = (container: HTMLElement): HTMLElement | undefined => {
  const children = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  return children.find((child) => /subscriptions|订阅/i.test(child.textContent ?? ""));
};

const placeSidebarRoot = (container: HTMLElement, root: HTMLElement) => {
  originalSubscriptionsSection = findSubscriptionsSection(container);
  if (originalSubscriptionsSection) {
    container.insertBefore(root, originalSubscriptionsSection);
  } else {
    container.prepend(root);
  }
};

const getOrCreateRoot = (container: HTMLElement): HTMLElement => {
  const existing = document.getElementById(ROOT_ID);
  if (existing instanceof HTMLElement) {
    if (existing.parentElement !== container) {
      placeSidebarRoot(container, existing);
    }
    return existing;
  }
  const root = document.createElement("div");
  root.id = ROOT_ID;
  placeSidebarRoot(container, root);
  return root;
};

const syncOriginalListVisibility = (state: ExtensionState) => {
  if (!originalSubscriptionsSection) {
    return;
  }
  originalSubscriptionsSection.style.display = state.ui.sidebarMode === "categorized" ? "none" : "";
};

const saveMode = (mode: SidebarMode) => {
  void safeAsync(async () => {
    currentState = await updateState((state) => setSidebarMode(state, mode));
    mountSidebar(currentState);
  });
};

const toggleSection = (categoryId: string) => {
  void safeAsync(async () => {
    currentState = await updateState((state) => toggleCategoryExpanded(state, categoryId));
    mountSidebar(currentState);
  });
};

const openChannel = (channel: Channel) => {
  // window.location.href forces a full reload; drive YouTube's SPA router
  // first and reload only when both soft paths fail (spa-navigate.ts).
  void navigateWithinYouTube(channel).catch(() => {
    window.location.href = channel.url;
  });
};

const makeCategoryId = () => `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getOrCreateManagerRoot = (): HTMLElement => {
  const existing = document.getElementById(MANAGER_ROOT_ID);
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const root = document.createElement("div");
  root.id = MANAGER_ROOT_ID;
  document.body.append(root);
  return root;
};

const categoryExists = (state: ExtensionState, categoryId: string): boolean =>
  categoryId === UNCATEGORIZED_ID || Boolean(state.categories[categoryId]);

const normalizeManagerUi = (state: ExtensionState) => {
  if (!categoryExists(state, managerUi.selectedCategoryId)) {
    managerUi.selectedCategoryId = UNCATEGORIZED_ID;
  }
  managerUi.selectedChannelIds = managerUi.selectedChannelIds.filter((id) => state.channels[id]);
  // A picker without a selection has nothing to act on.
  if (managerUi.picker && managerUi.selectedChannelIds.length === 0) {
    managerUi.picker = undefined;
  }
};

const mountManager = (state: ExtensionState) => {
  if (!managerOpen) {
    return;
  }
  ensureStyles();
  normalizeManagerUi(state);
  renderManager(getOrCreateManagerRoot(), state, managerUi, managerHandlers);
};

const quickAddHandlers = {
  // Toggle: joining a category the channel is not in, leaving one it is in.
  onToggleCategory(channel: Channel, categoryId: string) {
    void safeAsync(async () => {
      currentState = await updateState((state) => {
        const existing = findChannelByIdOrHandle(state, channel.id, channel.handle);
        const channelId = existing?.id ?? channel.id;
        const isMember =
          categoryId !== UNCATEGORIZED_ID && (state.memberships[channelId] ?? []).includes(categoryId);
        return isMember
          ? removeChannelFromCategory(state, channelId, categoryId)
          : upsertChannelToCategory(state, channel, categoryId);
      });
      refreshViews(currentState);
    });
  },
  onOpenManager() {
    openManager();
  }
};

const mountQuickAdd = (state: ExtensionState) => {
  const anchor = findQuickAddAnchor();
  const pageChannel = anchor ? readPageChannel() : undefined;
  const existingRoot = document.getElementById(QUICK_ADD_ROOT_ID);
  if (!anchor || !pageChannel) {
    existingRoot?.remove();
    return;
  }
  const signature = quickAddSignature(state, pageChannel);
  let root = existingRoot instanceof HTMLElement ? existingRoot : undefined;
  if (root && root.parentElement === anchor && root.dataset.signature === signature) {
    return;
  }
  if (!root || root.parentElement !== anchor) {
    root?.remove();
    root = document.createElement("div");
    root.id = QUICK_ADD_ROOT_ID;
    anchor.append(root);
  }
  root.dataset.signature = signature;
  ensureStyles();
  renderQuickAdd(root, state, pageChannel, quickAddHandlers);
};

const scheduleQuickAddMount = () => {
  if (quickAddTimer !== undefined) {
    window.clearTimeout(quickAddTimer);
  }
  quickAddTimer = window.setTimeout(() => {
    quickAddTimer = undefined;
    if (currentState) {
      mountQuickAdd(currentState);
    }
  }, 300);
};

const newnessKey = (ids: ReadonlySet<string>): string => Array.from(ids).sort().join(",");

// YouTube refreshes its own newness dots inside the hidden native list; mirror
// them into the categorized sidebar, debounced. Re-render only when the
// mirrored set actually changed — YouTube mutates its DOM constantly and our
// own re-render feeds the observer, so rebuilding on every tick would loop
// forever and keep resetting the avatars mid-load (0.5.0 regression: they
// fell back to initials).
const scheduleNewnessRefresh = () => {
  if (newnessTimer !== undefined) {
    window.clearTimeout(newnessTimer);
  }
  newnessTimer = window.setTimeout(() => {
    newnessTimer = undefined;
    if (!currentState || currentState.ui.sidebarMode !== "categorized") {
      return;
    }
    const key = newnessKey(collectNewnessChannelIds(currentState));
    if (key !== lastNewnessKey) {
      lastNewnessKey = key;
      mountSidebar(currentState);
    }
  }, 500);
};

const THEME_ROOT_IDS = [ROOT_ID, MANAGER_ROOT_ID, QUICK_ADD_ROOT_ID];

// Re-resolve the theme (preference x page attribute) and stamp it on every
// mounted UI root; the CSS tokens react to the root attribute, no re-render.
const refreshTheme = () => {
  const theme = resolveTheme(currentState?.ui.theme, isPageDark());
  for (const id of THEME_ROOT_IDS) {
    const root = document.getElementById(id);
    if (root instanceof HTMLElement) {
      applyTheme(root, theme);
    }
  }
};

const refreshViews = (state: ExtensionState) => {
  mountSidebar(state);
  mountManager(state);
  mountQuickAdd(state);
  refreshTheme();
};

const mountSidebar = (state: ExtensionState) => {
  const container = findGuideContainer();
  if (!container) {
    return;
  }
  ensureStyles();
  const root = getOrCreateRoot(container);
  syncOriginalListVisibility(state);
  const freshIds = collectNewnessChannelIds(state);
  lastNewnessKey = newnessKey(freshIds);
  renderSidebar(
    root,
    state,
    {
      onModeChange: saveMode,
      onToggleCategory: toggleSection,
      onOpenChannel: openChannel,
      onOpenManager: openManager
    },
    freshIds
  );
};

const scheduleMount = () => {
  if (mountTimer !== undefined) {
    window.clearTimeout(mountTimer);
  }
  mountTimer = window.setTimeout(() => {
    void safeAsync(async () => {
      await ensureAccountActive();
      currentState = await loadOrImportInitialState();
      refreshViews(currentState);
    });
  }, 250);
};

const addGuideObserver = () => {
  guideObserver?.disconnect();
  guideObserver = new MutationObserver(() => {
    if (typeof document === "undefined") {
      return;
    }
    scheduleQuickAddMount();
    scheduleNewnessRefresh();
    const container = findGuideContainer();
    const root = document.getElementById(ROOT_ID);
    if (!container || root?.parentElement === container) {
      return;
    }
    scheduleMount();
  });
  guideObserver.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    guideObserver?.disconnect();
    guideObserver = undefined;
  };
};

const collectAndSaveSubscriptions = async (): Promise<CollectSubscriptionsResponse> => {
  await ensureAccountActive();
  const sessionResult = await readSubscriptionsFromPageSession();
  if (!sessionResult.ok) {
    const visibleCount = parseSubscriptionsFromDocument(document).length;
    return {
      ok: false,
      error:
        visibleCount > 0
          ? `${sessionResult.error} 页面上只能看到 ${visibleCount} 个频道，未用这部分数据覆盖完整列表。`
          : sessionResult.error
    };
  }
  const channels = sessionResult.channels;
  const nextState = await updateState((state) => mergeSubscriptions(state, channels));
  currentState = nextState;
  refreshViews(nextState);
  return { ok: true, channels, source: "youtube-session" };
};

// Offer legacy-backup recovery when this account has no categories yet but a
// pre-account backup with categories exists (i.e. another account adopted the
// data during the per-account migration).
const computeCanRestoreLegacy = async (): Promise<boolean> => {
  if (!activatedAccountId || activatedAccountId === DEFAULT_ACCOUNT_ID) {
    return false;
  }
  if (currentState && currentState.categoryOrder.length > 0) {
    return false;
  }
  const backup = await loadLegacyBackupState();
  return Boolean(backup && backup.categoryOrder.length > 0);
};

function openManager() {
  void safeAsync(async () => {
    await ensureAccountActive();
    currentState = currentState ?? (await loadOrImportInitialState());
    managerOpen = true;
    managerUi.sortMode = currentState.ui.managerSortMode ?? "manual";
    managerUi.status = "准备就绪";
    managerUi.canRestoreLegacy = await computeCanRestoreLegacy();
    mountManager(currentState);
    refreshTheme();
  });
}

const closeManager = () => {
  managerOpen = false;
  document.getElementById(MANAGER_ROOT_ID)?.remove();
};

const refreshFromManager = () => {
  void safeAsync(async () => {
    managerUi.status = "正在刷新订阅";
    if (currentState) {
      mountManager(currentState);
    }
    const response = await collectAndSaveSubscriptions();
    managerUi.selectedChannelIds = [];
    managerUi.status = response.ok
      ? `已通过 YouTube 登录态刷新 ${response.channels?.length ?? 0} 个频道`
      : response.error ?? "刷新失败";
    if (currentState) {
      mountManager(currentState);
    }
  });
};

const createCategoryFromManager = () => {
  if (!currentState) {
    return;
  }
  managerUi.draft = {
    mode: "create",
    id: makeCategoryId(),
    name: "新分类",
    color: nextCategoryColor(currentState),
    icon: "default"
  };
  mountManager(currentState);
};

const editCategoryFromManager = (categoryId: string) => {
  const category = currentState?.categories[categoryId];
  if (!currentState || !category || category.isSystem) {
    return;
  }
  managerUi.selectedCategoryId = categoryId;
  managerUi.draft = {
    mode: "edit",
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon
  };
  mountManager(currentState);
};

const deleteCategoryFromManager = (categoryId: string) => {
  if (!currentState || categoryId === UNCATEGORIZED_ID) {
    return;
  }
  void safeAsync(async () => {
    currentState = await updateState((state) => deleteCategory(state, categoryId));
    managerUi.selectedCategoryId = UNCATEGORIZED_ID;
    managerUi.selectedChannelIds = [];
    managerUi.draft = managerUi.draft?.id === categoryId ? undefined : managerUi.draft;
    refreshViews(currentState);
  });
};

const refreshColorsFromManager = () => {
  if (!currentState) {
    return;
  }
  if (!window.confirm("按默认色板顺序重刷全部分类颜色？未分类将保持灰色。")) {
    return;
  }
  void safeAsync(async () => {
    currentState = await updateState((state) => refreshDefaultColors(state));
    refreshViews(currentState);
  });
};

const saveCategoryDraftFromManager = () => {
  if (!currentState || !managerUi.draft) {
    return;
  }
  const draft = managerUi.draft;
  void safeAsync(async () => {
    const name = draft.name.trim() || "新分类";
    currentState = await updateState((state) => {
      if (draft.mode === "create") {
        return addCategory(state, {
          id: draft.id,
          name,
          color: draft.color,
          icon: draft.icon
        });
      }
      const renamed = renameCategory(state, draft.id, name);
      return setCategoryAppearance(renamed, draft.id, {
        color: draft.color,
        icon: draft.icon
      });
    });
    managerUi.selectedCategoryId = draft.id;
    managerUi.draft = undefined;
    managerUi.status = "已保存分类";
    refreshViews(currentState);
  });
};

const getVisibleManagerChannels = (state: ExtensionState): Channel[] =>
  managerUi.search.trim()
    ? searchAllChannels(state, managerUi.search).map((hit) => hit.channel)
    : getChannelsForCategory(state, managerUi.selectedCategoryId);

let flashClearTimer: number | undefined;

const scheduleFlashClear = (categoryId: string) => {
  if (flashClearTimer !== undefined) {
    window.clearTimeout(flashClearTimer);
  }
  flashClearTimer = window.setTimeout(() => {
    flashClearTimer = undefined;
    if (managerUi.flashCategoryId !== categoryId) {
      return;
    }
    managerUi.flashCategoryId = undefined;
    if (currentState) {
      mountManager(currentState);
    }
  }, 480);
};

const closePickerFromManager = () => {
  managerUi.picker = undefined;
  if (currentState) {
    mountManager(currentState);
  }
};

const confirmPickerFromManager = (mode: PickerMode, categoryIds: string[]) => {
  if (!currentState || managerUi.selectedChannelIds.length === 0) {
    closePickerFromManager();
    return;
  }
  const channelCount = managerUi.selectedChannelIds.length;
  void safeAsync(async () => {
    currentState = await updateState((state) =>
      mode === "add"
        ? categoryIds.reduce(
            (accumulated, categoryId) => addChannelsToCategory(accumulated, managerUi.selectedChannelIds, categoryId),
            state
          )
        : setChannelCategories(state, managerUi.selectedChannelIds, categoryIds)
    );
    managerUi.picker = undefined;
    managerUi.selectedChannelIds = [];
    managerUi.status =
      mode === "add"
        ? `已添加 ${channelCount} 个频道到 ${categoryIds.length} 个分类`
        : categoryIds.length > 0
          ? `已移动 ${channelCount} 个频道`
          : "已移出所有分类";
    refreshViews(currentState);
  });
};

const removeChannelMembershipFromManager = (channelId: string, categoryId: string) => {
  void safeAsync(async () => {
    currentState = await updateState((state) => removeChannelFromCategory(state, channelId, categoryId));
    refreshViews(currentState);
  });
};

const dropOnCategoryFromManager = (categoryId: string, event: DragEvent) => {
  event.preventDefault();
  if (!currentState) {
    return;
  }
  const channelId = event.dataTransfer?.getData("application/x-ytdlp-channel");
  if (channelId) {
    managerUi.flashCategoryId = categoryId;
    void safeAsync(async () => {
      currentState = await updateState((state) => moveChannels(state, [channelId], categoryId));
      managerUi.selectedChannelIds = [];
      refreshViews(currentState);
      scheduleFlashClear(categoryId);
    });
    return;
  }

  const sourceCategoryId = draggedCategoryId || event.dataTransfer?.getData("application/x-ytdlp-category");
  if (!sourceCategoryId || sourceCategoryId === categoryId || sourceCategoryId === UNCATEGORIZED_ID) {
    return;
  }

  managerUi.flashCategoryId = categoryId;
  void safeAsync(async () => {
    currentState = await updateState((state) => {
      const nextOrder = [...state.categoryOrder];
      const sourceIndex = nextOrder.indexOf(sourceCategoryId);
      const targetIndex = nextOrder.indexOf(categoryId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return state;
      }
      nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, sourceCategoryId);
      return reorderCategories(state, nextOrder);
    });
    refreshViews(currentState);
    scheduleFlashClear(categoryId);
  });
};

const managerHandlers = {
  onClose: closeManager,
  onRefresh: refreshFromManager,
  onCreateCategory: createCategoryFromManager,
  onRefreshColors: refreshColorsFromManager,
  onSelectCategory(categoryId: string) {
    managerUi.selectedCategoryId = categoryId;
    managerUi.selectedChannelIds = [];
    managerUi.search = "";
    if (currentState) {
      mountManager(currentState);
    }
  },
  onEditCategory: editCategoryFromManager,
  onDeleteCategory: deleteCategoryFromManager,
  onSearch(query: string) {
    managerUi.search = query;
    managerUi.selectedChannelIds = [];
    if (currentState) {
      mountManager(currentState);
    }
  },
  onToggleChannel(channelId: string) {
    const selected = new Set(managerUi.selectedChannelIds);
    if (selected.has(channelId)) {
      selected.delete(channelId);
    } else {
      selected.add(channelId);
    }
    managerUi.selectedChannelIds = Array.from(selected);
    if (currentState) {
      mountManager(currentState);
    }
  },
  onSelectAll() {
    if (!currentState) {
      return;
    }
    managerUi.selectedChannelIds = getVisibleManagerChannels(currentState).map((channel) => channel.id);
    mountManager(currentState);
  },
  onClearSelected() {
    managerUi.selectedChannelIds = [];
    if (currentState) {
      mountManager(currentState);
    }
  },
  onOpenPicker(mode: PickerMode) {
    managerUi.picker = { mode };
    if (currentState) {
      mountManager(currentState);
    }
  },
  onClosePicker: closePickerFromManager,
  onPickerConfirm: confirmPickerFromManager,
  onRemoveChannelMembership: removeChannelMembershipFromManager,
  onExport() {
    if (!currentState) {
      return;
    }
    const csv = buildCategoriesCsv(currentState);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ytd-list-pro-categories-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    managerUi.status = "已导出 CSV 文件（可用 Excel 打开）";
    mountManager(currentState);
  },
  onImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      void safeAsync(async () => {
        const text = await file.text();
        const { items, errors } = parseCategoriesCsv(text);
        if (items.length === 0) {
          managerUi.status =
            errors[0] ?? "没有可导入的数据。CSV 需要三列：分类,频道名称,频道链接（频道名称可留空）";
          if (currentState) {
            mountManager(currentState);
          }
          return;
        }
        let importedCount = 0;
        let createdCount = 0;
        currentState = await updateState((state) => {
          const outcome = importChannelsToCategories(state, items, makeCategoryId);
          importedCount = outcome.importedCount;
          createdCount = outcome.createdCategories.length;
          return outcome.state;
        });
        const parts = [`已导入 ${importedCount} 个频道`];
        if (createdCount > 0) {
          parts.push(`新建 ${createdCount} 个分类`);
        }
        if (errors.length > 0) {
          parts.push(`跳过 ${errors.length} 行（${errors[0]}）`);
        }
        managerUi.status = parts.join("，");
        refreshViews(currentState);
      });
    });
    input.click();
  },
  onRestoreLegacy() {
    void safeAsync(async () => {
      const restored = await restoreLegacyBackup();
      if (!restored) {
        managerUi.status = "没有找到可恢复的旧数据";
        managerUi.canRestoreLegacy = false;
        if (currentState) {
          mountManager(currentState);
        }
        return;
      }
      currentState = restored;
      managerUi.canRestoreLegacy = false;
      managerUi.selectedChannelIds = [];
      managerUi.status = `已恢复旧数据：${restored.categoryOrder.length} 个分类、${Object.keys(restored.channels).length} 个频道。建议点击「刷新频道」同步最新订阅。`;
      refreshViews(currentState);
    });
  },
  onOpenChannel: openChannel,
  onSortChange(sortMode: ChannelSortMode) {
    managerUi.sortMode = sortMode;
    if (currentState) {
      mountManager(currentState);
      void safeAsync(async () => {
        currentState = await updateState((state) => setManagerSortMode(state, sortMode));
      });
    }
  },
  onTogglePin(channelId: string) {
    if (!currentState) {
      return;
    }
    const categoryId = managerUi.selectedCategoryId;
    const name = currentState.channels[channelId]?.name ?? channelId;
    void safeAsync(async () => {
      currentState = await updateState((state) => toggleChannelPin(state, categoryId, channelId));
      const pinnedNow = currentState.categories[categoryId]?.pinnedChannelIds?.includes(channelId) ?? false;
      managerUi.status = pinnedNow ? `已置顶「${name}」` : `已取消置顶「${name}」`;
      refreshViews(currentState);
    });
  },
  onReorderChannel(channelId: string, zone: ChannelOrderZone, index: number) {
    if (!currentState) {
      return;
    }
    void safeAsync(async () => {
      currentState = await updateState((state) =>
        moveChannelInCategory(state, managerUi.selectedCategoryId, channelId, zone, index)
      );
      refreshViews(currentState);
    });
  },
  onLayoutChange(layout: Partial<ManagerLayout>) {
    if (!currentState) {
      return;
    }
    void safeAsync(async () => {
      currentState = await updateState((state) => setManagerLayout(state, layout));
    });
  },
  onSetTheme(theme: ThemePreference) {
    void safeAsync(async () => {
      currentState = await updateState((state) => setThemePreference(state, theme));
      refreshViews(currentState);
    });
  },
  onDragCategoryStart(categoryId: string) {
    draggedCategoryId = categoryId;
  },
  onDropOnCategory: dropOnCategoryFromManager,
  onDragChannelStart(channelId: string, event: DragEvent) {
    event.dataTransfer?.setData("application/x-ytdlp-channel", channelId);
  },
  onDraftChange(patch: Partial<CategoryDraft>) {
    if (!managerUi.draft || !currentState) {
      return;
    }
    managerUi.draft = { ...managerUi.draft, ...patch };
    if (Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, "name")) {
      return;
    }
    mountManager(currentState);
  },
  onDraftSave: saveCategoryDraftFromManager,
  onDraftCancel() {
    managerUi.draft = undefined;
    if (currentState) {
      mountManager(currentState);
    }
  }
};

const addMessageListener = () => {
  const listener = (message: { type?: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    if (message?.type === MESSAGE_TYPES.OPEN_MANAGER) {
      openManager();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== MESSAGE_TYPES.COLLECT_SUBSCRIPTIONS) {
      return false;
    }

    void safeAsync(collectAndSaveSubscriptions, { ok: false, error: "Extension context invalidated" }).then(
      (response) => sendResponse(response)
    );
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
};

const addStorageListener = () => {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    const stateKey = activeStateStorageKey();
    if (areaName !== "local" || !changes[stateKey]?.newValue) {
      return;
    }
    currentState = changes[stateKey].newValue as ExtensionState;
    refreshViews(currentState);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};

const addNavigationListeners = () => {
  const trigger = () => scheduleMount();
  window.addEventListener("popstate", trigger);
  window.addEventListener("yt-navigate-finish", trigger);

  const originalPushState = history.pushState;
  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    trigger();
    return result;
  };

  return () => {
    window.removeEventListener("popstate", trigger);
    window.removeEventListener("yt-navigate-finish", trigger);
    history.pushState = originalPushState;
  };
};

const cleanupPrevious = () => {
  const targetWindow = window as CleanupWindow;
  targetWindow[CLEANUP_KEY]?.();
};

const start = () => {
  cleanupPrevious();
  const navigationCleanup = addNavigationListeners();
  const messageCleanup = addMessageListener();
  const storageCleanup = addStorageListener();
  const guideObserverCleanup = addGuideObserver();
  const themeCleanup = watchPageTheme(refreshTheme);
  scheduleMount();

  (window as CleanupWindow)[CLEANUP_KEY] = () => {
    navigationCleanup();
    messageCleanup();
    storageCleanup();
    guideObserverCleanup();
    themeCleanup();
    if (mountTimer !== undefined) {
      window.clearTimeout(mountTimer);
    }
    if (quickAddTimer !== undefined) {
      window.clearTimeout(quickAddTimer);
    }
    if (flashClearTimer !== undefined) {
      window.clearTimeout(flashClearTimer);
    }
    if (newnessTimer !== undefined) {
      window.clearTimeout(newnessTimer);
    }
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(MANAGER_ROOT_ID)?.remove();
    document.getElementById(QUICK_ADD_ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (originalSubscriptionsSection) {
      originalSubscriptionsSection.style.display = "";
    }
  };
};

start();
