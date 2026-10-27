import { CATEGORY_ICONS, PRESET_COLORS, UNCATEGORIZED_CATEGORY, UNCATEGORIZED_ID } from "../shared/constants";
import {
  getChannelCategoryIds,
  getCategoryChannelView,
  getChannelsForCategory,
  searchAllChannels
} from "../shared/state";
import type {
  Category,
  CategoryIconId,
  Channel,
  ChannelOrderZone,
  ChannelSortMode,
  ExtensionState,
  ManagerLayout,
  ThemePreference
} from "../shared/types";
import { createSvgIcon } from "./sidebar";

export type CategoryDraft = {
  mode: "create" | "edit";
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
};

export type PickerMode = "add" | "move";

export type ManagerUiState = {
  selectedCategoryId: string;
  selectedChannelIds: string[];
  search: string;
  sortMode: ChannelSortMode;
  status: string;
  draft?: CategoryDraft;
  canRestoreLegacy?: boolean;
  picker?: { mode: PickerMode };
  flashCategoryId?: string;
};

export type ManagerHandlers = {
  onClose(): void;
  onRefresh(): void;
  onCreateCategory(): void;
  onRefreshColors(): void;
  onSelectCategory(categoryId: string): void;
  onEditCategory(categoryId: string): void;
  onDeleteCategory(categoryId: string): void;
  onSearch(query: string): void;
  onToggleChannel(channelId: string): void;
  onSelectAll(): void;
  onClearSelected(): void;
  onOpenPicker(mode: PickerMode): void;
  onClosePicker(): void;
  onPickerConfirm(mode: PickerMode, categoryIds: string[]): void;
  onRemoveChannelMembership(channelId: string, categoryId: string): void;
  onExport(): void;
  onImport(): void;
  onRestoreLegacy(): void;
  onOpenChannel(channel: Channel): void;
  onSortChange(sortMode: ChannelSortMode): void;
  onTogglePin(channelId: string): void;
  onReorderChannel(channelId: string, zone: ChannelOrderZone, index: number): void;
  onLayoutChange(layout: Partial<ManagerLayout>): void;
  onSetTheme(theme: ThemePreference): void;
  onDragCategoryStart(categoryId: string): void;
  onDropOnCategory(categoryId: string, event: DragEvent): void;
  onDragChannelStart(channelId: string, event: DragEvent): void;
  onDraftChange(patch: Partial<CategoryDraft>): void;
  onDraftSave(): void;
  onDraftCancel(): void;
};

type CategoryRow = {
  category: Category;
  count: number;
};

type SvgPathNode = [keyof SVGElementTagNameMap, Record<string, string>];

const SORT_OPTIONS: Array<{ id: ChannelSortMode; label: string }> = [
  { id: "manual", label: "手动排序" },
  { id: "added-desc", label: "最近关注" },
  { id: "added-asc", label: "最早关注" },
  { id: "name-asc", label: "名称 A-Z" },
  { id: "name-desc", label: "名称 Z-A" }
];

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; title: string }> = [
  { id: "auto", label: "自动", title: "跟随 YouTube 明暗" },
  { id: "light", label: "亮", title: "始终亮色" },
  { id: "dark", label: "暗", title: "始终暗色（橘色系）" }
];

// HTML5 DnD can't read dataTransfer payload during dragover, so the channel
// being dragged inside the channel list is tracked here instead.
let draggingChannelId: string | undefined;

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const categoryRows = (state: ExtensionState): CategoryRow[] => [
  {
    category: state.categories[UNCATEGORIZED_ID],
    count: getChannelsForCategory(state, UNCATEGORIZED_ID).length
  },
  ...state.categoryOrder
    .map((id) => state.categories[id])
    .filter(Boolean)
    .map((category) => ({ category, count: category.channelIds.length }))
];

const channelInitial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

const channelSortTime = (channel: Channel): number => channel.subscribedAt ?? channel.discoveredAt ?? 0;

const sortChannels = (channels: Channel[], sortMode: ChannelSortMode): Channel[] =>
  channels
    .map((channel, index) => ({ channel, index }))
    .sort((left, right) => {
      if (sortMode === "manual") {
        return left.index - right.index;
      }
      if (sortMode === "name-asc" || sortMode === "name-desc") {
        const comparison = left.channel.name.localeCompare(right.channel.name, undefined, { sensitivity: "base" });
        return sortMode === "name-asc" ? comparison : -comparison;
      }

      const comparison = channelSortTime(left.channel) - channelSortTime(right.channel);
      if (comparison !== 0) {
        return sortMode === "added-asc" ? comparison : -comparison;
      }
      return left.index - right.index;
    })
    .map((item) => item.channel);

const renderCategoryIcon = (category: Pick<Category, "color" | "icon">, sizeClass = "ytdlp-manager-category-icon") => {
  const icon = createElement("span", sizeClass);
  icon.style.backgroundColor = category.color;
  icon.append(createSvgIcon(category.icon));
  return icon;
};

const createActionIcon = (name: "edit" | "trash" | "external" | "pin") => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", name);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  let paths: SvgPathNode[];
  if (name === "external") {
    paths = [
      ["path", { d: "M15 3h6v6" }],
      ["path", { d: "M10 14 21 3" }],
      ["path", { d: "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" }]
    ];
  } else if (name === "pin") {
    paths = [
      ["path", { d: "M12 17v5" }],
      ["path", { d: "M9 3h6l-1 8 3 3v2H7v-2l3-3-1-8Z" }]
    ];
  } else if (name === "edit") {
    paths = [
      ["path", { d: "M12 20h9" }],
      ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }]
    ];
  } else {
    paths = [
      ["path", { d: "M3 6h18" }],
      ["path", { d: "M8 6V4h8v2" }],
      ["path", { d: "M19 6l-1 14H6L5 6" }],
      ["path", { d: "M10 11v6" }],
      ["path", { d: "M14 11v6" }]
    ];
  }

  for (const [tagName, attributes] of paths) {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [attribute, value] of Object.entries(attributes)) {
      child.setAttribute(attribute, value);
    }
    svg.append(child);
  }

  return svg;
};

const renderCategoryList = (
  rows: CategoryRow[],
  selectedCategoryId: string,
  handlers: ManagerHandlers,
  flashCategoryId?: string
): HTMLElement => {
  const list = createElement("div", "ytdlp-manager-categories");
  for (const { category, count } of rows) {
    const row = createElement(
      "button",
      category.id === selectedCategoryId ? "ytdlp-manager-category is-active" : "ytdlp-manager-category"
    );
    if (category.id === flashCategoryId) {
      row.classList.add("is-drop-flash");
    }
    row.type = "button";
    row.draggable = !category.isSystem;
    row.addEventListener("click", () => handlers.onSelectCategory(category.id));
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-ytdlp-category", category.id);
      handlers.onDragCategoryStart(category.id);
    });
    // Drag feedback: outline + darken the row under the cursor; channel drags
    // additionally show a「松开移入」hint badge.
    const dropHint = createElement("span", "ytdlp-manager-drop-hint", "松开移入");
    const clearDropState = () => {
      row.classList.remove("is-drop-target", "is-channel-drop");
    };
    row.addEventListener("dragover", (event) => {
      const types = event.dataTransfer?.types;
      if (!types) {
        return;
      }
      const isChannelDrag = types.includes("application/x-ytdlp-channel");
      if (!isChannelDrag && !types.includes("application/x-ytdlp-category")) {
        return;
      }
      event.preventDefault();
      event.dataTransfer!.dropEffect = "move";
      row.classList.add("is-drop-target");
      row.classList.toggle("is-channel-drop", isChannelDrag);
    });
    row.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) {
        return;
      }
      clearDropState();
    });
    row.addEventListener("drop", (event) => {
      clearDropState();
      handlers.onDropOnCategory(category.id, event);
    });
    row.addEventListener("dragend", clearDropState);

    const name = createElement("span", "ytdlp-manager-category-name", category.name);
    const badge = createElement("span", "ytdlp-manager-category-count", String(count));
    const actions = createElement("span", "ytdlp-manager-category-actions");

    if (!category.isSystem) {
      const edit = createElement("button", "ytdlp-manager-icon-button", "");
      edit.type = "button";
      edit.title = "编辑分类";
      edit.append(createActionIcon("edit"));
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onEditCategory(category.id);
      });

      const remove = createElement("button", "ytdlp-manager-icon-button is-danger", "");
      remove.type = "button";
      remove.title = "删除分类";
      remove.append(createActionIcon("trash"));
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onDeleteCategory(category.id);
      });
      actions.append(edit, remove);
    }

    row.append(renderCategoryIcon(category), name, badge, actions, dropHint);
    list.append(row);
  }
  return list;
};

const renderChannelAvatar = (channel: Channel): HTMLElement => {
  const avatar = createElement("span", "ytdlp-manager-avatar");
  if (channel.avatarUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.src = channel.avatarUrl;
    image.addEventListener("error", () => {
      image.remove();
      avatar.textContent = channelInitial(channel.name);
    });
    avatar.append(image);
  } else {
    avatar.textContent = channelInitial(channel.name);
  }
  return avatar;
};

export type MembershipBadge = {
  categoryId: string;
  name: string;
  color: string;
};

export interface ChannelViewOptions {
  pinnedIds?: Set<string>;
  canPin: boolean;
  canReorder: boolean;
}

const renderChannels = (
  channels: Channel[],
  selectedChannelIds: Set<string>,
  handlers: ManagerHandlers,
  membershipBadges?: Map<string, MembershipBadge[]>,
  view?: ChannelViewOptions
): HTMLElement => {
  const list = createElement("div", view?.canReorder ? "ytdlp-manager-channels is-reorderable" : "ytdlp-manager-channels");
  const zoneOf = (id: string): ChannelOrderZone =>
    view?.pinnedIds?.has(id) ? "pinned" : "normal";
  for (const channel of channels) {
    const selected = selectedChannelIds.has(channel.id);
    const isPinned = view?.pinnedIds?.has(channel.id) ?? false;
    const classes = ["ytdlp-manager-channel"];
    if (selected) {
      classes.push("is-selected");
    }
    if (isPinned) {
      classes.push("is-pinned");
    }
    if (view?.canPin) {
      classes.push("has-pin");
    }
    const row = createElement("div", classes.join(" "));
    row.dataset.channelId = channel.id;
    row.draggable = true;
    row.addEventListener("dblclick", () => handlers.onOpenChannel(channel));
    row.addEventListener("dragstart", (event) => {
      draggingChannelId = channel.id;
      handlers.onDragChannelStart(channel.id, event);
    });
    row.addEventListener("dragend", () => {
      draggingChannelId = undefined;
    });
    if (view?.canReorder) {
      // Intra-list reorder (manual mode only). The zone is always the dragged
      // channel's own zone — crossing zones is pin-button-only by design.
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dragged = draggingChannelId;
        if (!dragged || dragged === channel.id) {
          return;
        }
        const rows = Array.from(list.querySelectorAll<HTMLElement>(".ytdlp-manager-channel"));
        const targetIndex = rows.indexOf(row);
        const after = event.offsetY > row.offsetHeight / 2;
        const insertAt = targetIndex + (after ? 1 : 0);
        const zone = zoneOf(dragged);
        const zoneIndex = rows
          .slice(0, insertAt)
          .filter((item) => zoneOf(item.dataset.channelId ?? "") === zone).length;
        handlers.onReorderChannel(dragged, zone, zoneIndex);
      });
    }

    const checkbox = createElement("button", "ytdlp-manager-check", selected ? "✓" : "");
    checkbox.type = "button";
    checkbox.title = selected ? "取消选择" : "选择频道";
    checkbox.addEventListener("click", () => handlers.onToggleChannel(channel.id));

    const text = createElement("span", "ytdlp-manager-channel-text");
    text.append(createElement("strong", undefined, channel.name));
    text.append(createElement("small", undefined, channel.handle ?? channel.id));

    const badges = membershipBadges?.get(channel.id) ?? [];
    if (badges.length > 0) {
      const badgeRow = createElement("span", "ytdlp-manager-channel-badges");
      for (const badge of badges) {
        const chip = createElement("span", "ytdlp-manager-channel-badge");
        chip.title = "点击 × 从该分类移除";
        const dot = createElement("span", "ytdlp-manager-channel-badge-dot");
        dot.style.backgroundColor = badge.color;
        const remove = createElement("button", "ytdlp-manager-badge-remove", "×");
        remove.type = "button";
        remove.title = `从「${badge.name}」移除`;
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          handlers.onRemoveChannelMembership(channel.id, badge.categoryId);
        });
        chip.append(dot, createElement("span", undefined, badge.name), remove);
        badgeRow.append(chip);
      }
      text.append(badgeRow);
    }

    if (view?.canPin) {
      const pin = createElement(
        "button",
        isPinned ? "ytdlp-manager-icon-button ytdlp-manager-pin is-active" : "ytdlp-manager-icon-button ytdlp-manager-pin",
        ""
      );
      pin.type = "button";
      pin.title = isPinned ? "取消置顶" : "置顶";
      pin.append(createActionIcon("pin"));
      pin.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onTogglePin(channel.id);
      });
      row.append(checkbox, renderChannelAvatar(channel), text, pin);
    } else {
      row.append(checkbox, renderChannelAvatar(channel), text);
    }

    const open = createElement("button", "ytdlp-manager-icon-button", "");
    open.type = "button";
    open.title = "打开频道";
    open.append(createActionIcon("external"));
    open.addEventListener("click", () => handlers.onOpenChannel(channel));
    row.append(open);

    list.append(row);
  }
  return list;
};

const renderDraftEditor = (draft: CategoryDraft, handlers: ManagerHandlers): HTMLElement => {
  const backdrop = createElement("div", "ytdlp-manager-editor-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      handlers.onDraftCancel();
    }
  });

  const editor = createElement("section", "ytdlp-manager-editor");
  editor.setAttribute("role", "dialog");
  editor.setAttribute("aria-modal", "true");

  const header = createElement("div", "ytdlp-manager-editor-header");
  header.append(createElement("h3", undefined, draft.mode === "create" ? "新建分类" : "编辑分类"));
  const close = createElement("button", "ytdlp-manager-icon-button", "×");
  close.type = "button";
  close.title = "关闭";
  close.addEventListener("click", handlers.onDraftCancel);
  header.append(close);

  const nameLabel = createElement("label", "ytdlp-manager-field");
  nameLabel.append(createElement("span", undefined, "名称"));
  const name = document.createElement("input");
  name.name = "category-name";
  name.value = draft.name;
  const preview = createElement("div", "ytdlp-manager-preview");
  const previewName = createElement("strong", undefined, draft.name.trim() || "新分类");
  preview.append(renderCategoryIcon(draft), previewName);

  name.addEventListener("input", () => {
    previewName.textContent = name.value.trim() || "新分类";
    handlers.onDraftChange({ name: name.value });
  });
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.onDraftSave();
    }
  });
  nameLabel.append(name);

  const colorSection = createElement("div", "ytdlp-manager-editor-section");
  colorSection.append(createElement("span", "ytdlp-manager-label", "颜色"));
  const colors = createElement("div", "ytdlp-manager-color-grid");
  for (const color of PRESET_COLORS) {
    const swatch = createElement("button", color === draft.color ? "ytdlp-manager-swatch is-active" : "ytdlp-manager-swatch");
    swatch.type = "button";
    swatch.title = color;
    swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () => handlers.onDraftChange({ color }));
    colors.append(swatch);
  }
  const custom = createElement("label", "ytdlp-manager-custom-color");
  custom.append(createElement("span", undefined, "自定义"));
  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.value = draft.color;
  customInput.addEventListener("input", () => handlers.onDraftChange({ color: customInput.value }));
  custom.append(customInput, createElement("code", undefined, draft.color));
  colorSection.append(colors, custom);

  const iconSection = createElement("div", "ytdlp-manager-editor-section");
  iconSection.append(createElement("span", "ytdlp-manager-label", "图标"));
  const icons = createElement("div", "ytdlp-manager-icon-grid");
  for (const item of CATEGORY_ICONS) {
    const option = createElement(
      "button",
      item.id === draft.icon ? "ytdlp-manager-icon-choice is-active" : "ytdlp-manager-icon-choice"
    );
    option.type = "button";
    option.title = item.label;
    option.dataset.iconChoice = item.id;
    option.append(createSvgIcon(item.id), createElement("span", undefined, item.label));
    option.addEventListener("click", () => handlers.onDraftChange({ icon: item.id }));
    icons.append(option);
  }
  iconSection.append(icons);

  const actions = createElement("div", "ytdlp-manager-editor-actions");
  const cancel = createElement("button", "ytdlp-manager-secondary", "取消");
  cancel.type = "button";
  cancel.addEventListener("click", handlers.onDraftCancel);
  const save = createElement("button", "ytdlp-manager-primary", "保存");
  save.type = "button";
  save.addEventListener("click", handlers.onDraftSave);
  actions.append(cancel, save);

  editor.append(header, nameLabel, preview, colorSection, iconSection, actions);
  backdrop.append(editor);

  window.setTimeout(() => {
    name.focus();
    name.select();
  }, 0);

  return backdrop;
};

type PickerCategoryRow = {
  category: Category;
  ownedCount: number;
  common: boolean;
};

const renderPickerDialog = (state: ExtensionState, ui: ManagerUiState, handlers: ManagerHandlers): HTMLElement => {
  const mode = ui.picker!.mode;
  const selectedIds = ui.selectedChannelIds;
  const categories = state.categoryOrder
    .map((id) => state.categories[id])
    .filter((category): category is Category => Boolean(category));
  const rows: PickerCategoryRow[] = categories.map((category) => {
    const ownedCount = selectedIds.filter((channelId) => state.memberships[channelId]?.includes(category.id)).length;
    return { category, ownedCount, common: selectedIds.length > 0 && ownedCount === selectedIds.length };
  });

  const backdrop = createElement("div", "ytdlp-manager-editor-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      handlers.onClosePicker();
    }
  });

  const dialog = createElement("section", "ytdlp-manager-picker");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;

  const header = createElement("div", "ytdlp-manager-editor-header");
  header.append(createElement("h3", undefined, mode === "add" ? "添加到分类" : "移动到分类"));
  const close = createElement("button", "ytdlp-manager-icon-button", "×");
  close.type = "button";
  close.title = "关闭";
  close.addEventListener("click", handlers.onClosePicker);
  header.append(close);

  const subtitle = createElement("p", "ytdlp-manager-picker-sub", `已选 ${selectedIds.length} 个频道`);

  const list = createElement("div", "ytdlp-manager-picker-list");
  const confirm = createElement("button", "ytdlp-manager-picker-confirm", "");
  confirm.type = "button";
  // Confirm copy follows the live check count. In move mode an empty set is
  // meaningful (remove from all categories), in add mode it stays disabled.
  const updateConfirm = () => {
    const checked = Array.from(
      list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')
    ).filter((box) => box.checked);
    if (mode === "add") {
      confirm.textContent = `添加到 ${checked.length} 个分类`;
      confirm.disabled = checked.length === 0;
      confirm.classList.remove("is-danger");
    } else if (checked.length === 0) {
      confirm.textContent = "确认移出所有分类";
      confirm.disabled = false;
      confirm.classList.add("is-danger");
    } else {
      confirm.textContent = `移动到 ${checked.length} 个分类`;
      confirm.disabled = false;
      confirm.classList.remove("is-danger");
    }
  };

  for (const { category, ownedCount, common } of rows) {
    const locked = mode === "add" && common;
    const row = createElement("label", locked ? "ytdlp-manager-picker-row is-locked" : "ytdlp-manager-picker-row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = category.id;
    box.checked = mode === "add" ? common : selectedIds.length === 1 && ownedCount === 1;
    box.disabled = locked;
    box.addEventListener("change", updateConfirm);
    const name = createElement("span", "ytdlp-manager-picker-name", category.name);
    const note = createElement("span", "ytdlp-manager-picker-note");
    if (locked) {
      note.textContent = "已在该分类";
    } else if (selectedIds.length > 1) {
      note.textContent = `${ownedCount}/${selectedIds.length} 已在该分类`;
    }
    row.append(
      box,
      renderCategoryIcon(category, "ytdlp-manager-category-icon ytdlp-manager-picker-icon"),
      name,
      note
    );
    list.append(row);
  }
  updateConfirm();

  const actions = createElement("div", "ytdlp-manager-picker-actions");
  if (mode === "move") {
    const clear = createElement("button", "ytdlp-manager-picker-clear", "移出所有分类");
    clear.type = "button";
    clear.title = "清空勾选；确认后选中频道将退出所有分类";
    clear.addEventListener("click", () => {
      for (const box of list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
        if (!box.disabled) {
          box.checked = false;
        }
      }
      updateConfirm();
    });
    actions.append(clear);
  }
  const actionsRight = createElement("span", "ytdlp-manager-picker-actions-right");
  const cancel = createElement("button", "ytdlp-manager-secondary", "取消");
  cancel.type = "button";
  cancel.addEventListener("click", handlers.onClosePicker);
  confirm.addEventListener("click", () => {
    const checked = Array.from(
      list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)')
    ).map((box) => box.value);
    handlers.onPickerConfirm(mode, checked);
  });
  actionsRight.append(cancel, confirm);
  actions.append(actionsRight);

  dialog.append(header, subtitle, list, actions);
  backdrop.append(dialog);

  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handlers.onClosePicker();
      return;
    }
    if (event.key === "Enter" && (event.target === dialog || event.target === backdrop)) {
      event.preventDefault();
      confirm.click();
    }
  });

  window.setTimeout(() => {
    dialog.focus();
  }, 0);

  return backdrop;
};

export function renderManager(
  root: HTMLElement,
  state: ExtensionState,
  ui: ManagerUiState,
  handlers: ManagerHandlers
): void {
  const previousSearch = root.querySelector<HTMLInputElement>(".ytdlp-manager-search");
  const searchWasFocused = previousSearch !== null && document.activeElement === previousSearch;
  root.replaceChildren();
  root.className = "ytdlp-manager-root";

  const rows = categoryRows(state);
  const currentCategory = state.categories[ui.selectedCategoryId] ?? state.categories[UNCATEGORIZED_ID];
  const searchHits = ui.search.trim() ? searchAllChannels(state, ui.search) : undefined;
  // Pin/reorder only exist for real categories in the plain category view;
  // search results and 未分类 keep the previous behavior. The pinned block
  // always sorts first; the dropdown applies to the normal section only.
  const channelView =
    !searchHits && currentCategory.id !== UNCATEGORIZED_ID
      ? getCategoryChannelView(state, currentCategory.id)
      : undefined;
  const visibleChannels = channelView
    ? [...channelView.pinned, ...sortChannels(channelView.rest, ui.sortMode)]
    : sortChannels(
        searchHits ? searchHits.map((hit) => hit.channel) : getChannelsForCategory(state, currentCategory.id),
        ui.sortMode
      );
  const channelOptions: ChannelViewOptions | undefined = channelView
    ? {
        pinnedIds: new Set(channelView.pinned.map((channel) => channel.id)),
        canPin: true,
        canReorder: ui.sortMode === "manual"
      }
    : undefined;
  const membershipBadges = new Map<string, MembershipBadge[]>();
  for (const channel of visibleChannels) {
    membershipBadges.set(
      channel.id,
      getChannelCategoryIds(state, channel.id).map((categoryId) => ({
        categoryId,
        name: state.categories[categoryId]?.name ?? categoryId,
        color: state.categories[categoryId]?.color ?? UNCATEGORIZED_CATEGORY.color
      }))
    );
  }
  const selectedChannelIds = new Set(ui.selectedChannelIds);

  const shell = createElement("div", "ytdlp-manager-shell");
  shell.addEventListener("click", (event) => {
    if (event.target === shell) {
      handlers.onClose();
    }
  });
  const drawer = createElement("aside", "ytdlp-manager-drawer");
  drawer.addEventListener("click", (event) => event.stopPropagation());

  // Remembered manager layout (Q7): drawer width/height + left pane width,
  // clamped to the viewport so a stale size can never brick the panel.
  const layoutPrefs = state.ui.managerLayout ?? {};
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 800;
  const drawerWidth = layoutPrefs.drawerWidth
    ? Math.min(Math.max(layoutPrefs.drawerWidth, 480), Math.max(480, viewportWidth - 32))
    : undefined;
  const drawerHeight = layoutPrefs.drawerHeight
    ? Math.min(Math.max(layoutPrefs.drawerHeight, 320), Math.max(320, viewportHeight - 32))
    : undefined;
  if (drawerWidth) {
    drawer.style.width = `${drawerWidth}px`;
  }
  if (drawerHeight) {
    drawer.style.height = `${drawerHeight}px`;
  }
  const effectiveDrawerWidth = drawerWidth ?? Math.min(960, Math.max(480, viewportWidth - 48));

  const layout = createElement("div", "ytdlp-manager-layout");
  const left = createElement("section", "ytdlp-manager-left");
  const leftHeader = createElement("div", "ytdlp-manager-pane-header");
  leftHeader.append(createElement("strong", undefined, "分类"));
  const leftHeaderActions = createElement("div", "ytdlp-manager-pane-actions");
  const add = createElement("button", "ytdlp-manager-primary", "新建");
  add.type = "button";
  add.addEventListener("click", handlers.onCreateCategory);
  const repaint = createElement("button", "ytdlp-manager-secondary", "重刷颜色");
  repaint.type = "button";
  repaint.title = "按默认色板顺序重刷全部分类颜色（未分类保持灰色）";
  repaint.addEventListener("click", handlers.onRefreshColors);
  const themeToggle = createElement("div", "ytdlp-manager-theme-toggle");
  const currentTheme: ThemePreference = state.ui.theme ?? "auto";
  for (const item of THEME_OPTIONS) {
    const option = createElement("button", item.id === currentTheme ? "is-active" : "", item.label);
    option.type = "button";
    option.title = item.title;
    option.addEventListener("click", () => handlers.onSetTheme(item.id));
    themeToggle.append(option);
  }
  leftHeaderActions.append(themeToggle, add, repaint);
  leftHeader.append(leftHeaderActions);
  left.append(leftHeader, renderCategoryList(rows, currentCategory.id, handlers, ui.flashCategoryId));

  const right = createElement("section", "ytdlp-manager-right");
  const toolbar = createElement("div", "ytdlp-manager-toolbar");
  const refresh = createElement("button", "ytdlp-manager-primary ytdlp-manager-refresh", "刷新频道");
  refresh.type = "button";
  refresh.addEventListener("click", handlers.onRefresh);
  const searchWrap = createElement(
    "div",
    ui.search.trim() ? "ytdlp-manager-search-wrap has-value" : "ytdlp-manager-search-wrap"
  );
  const search = createElement("input", "ytdlp-manager-search");
  search.placeholder = "搜索全部分类";
  search.value = ui.search;
  let composing = false;
  search.addEventListener("compositionstart", () => {
    composing = true;
  });
  search.addEventListener("compositionend", () => {
    composing = false;
    handlers.onSearch(search.value);
  });
  search.addEventListener("input", () => {
    if (!composing) {
      handlers.onSearch(search.value);
    }
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value) {
      event.preventDefault();
      handlers.onSearch("");
    }
  });
  const searchClear = createElement("button", "ytdlp-manager-search-clear", "×");
  searchClear.type = "button";
  searchClear.title = "清空搜索";
  searchClear.tabIndex = -1;
  searchClear.setAttribute("aria-label", "清空搜索");
  searchClear.addEventListener("mousedown", (event) => event.preventDefault());
  searchClear.addEventListener("click", () => {
    search.focus();
    handlers.onSearch("");
  });
  searchWrap.append(search, searchClear);
  const sort = document.createElement("select");
  sort.className = "ytdlp-manager-sort";
  sort.title = "排序";
  sort.addEventListener("change", () => handlers.onSortChange(sort.value as ChannelSortMode));
  for (const item of SORT_OPTIONS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    sort.append(option);
  }
  sort.value = ui.sortMode;
  const selectAll = createElement("button", "ytdlp-manager-secondary", "全选");
  selectAll.type = "button";
  selectAll.addEventListener("click", handlers.onSelectAll);
  const clear = createElement("button", "ytdlp-manager-secondary", "取消");
  clear.type = "button";
  clear.addEventListener("click", handlers.onClearSelected);
  const exportButton = createElement("button", "ytdlp-manager-secondary ytdlp-manager-export", "导出");
  exportButton.type = "button";
  exportButton.title = "导出全部分类为 CSV（可用 Excel 打开）";
  exportButton.addEventListener("click", handlers.onExport);
  const importButton = createElement("button", "ytdlp-manager-secondary ytdlp-manager-import", "导入");
  importButton.type = "button";
  importButton.title = "从 CSV 导入分类（三列：分类,频道名称,频道链接）";
  importButton.addEventListener("click", handlers.onImport);
  toolbar.append(refresh, searchWrap, sort, selectAll, clear, exportButton, importButton);

  const summary = createElement("div", "ytdlp-manager-summary");
  const summaryText = createElement("div");
  summaryText.append(
    createElement("h3", undefined, searchHits ? "搜索结果" : currentCategory.name),
    createElement(
      "p",
      undefined,
      searchHits
        ? `全部分类中找到 ${visibleChannels.length} 个频道，已选 ${selectedChannelIds.size} 个`
        : `${visibleChannels.length} 个频道，已选 ${selectedChannelIds.size} 个`
    )
  );
  const moveTools = createElement("div", "ytdlp-manager-move-tools");
  const addTo = createElement("button", "ytdlp-manager-secondary", "添加");
  addTo.type = "button";
  addTo.title = "把选中频道加入分类（保留其他分类归属）";
  addTo.disabled = selectedChannelIds.size === 0;
  addTo.addEventListener("click", () => handlers.onOpenPicker("add"));
  const move = createElement("button", "ytdlp-manager-secondary", "移动");
  move.type = "button";
  move.title = "把选中频道移入分类（勾选即最终归属，未勾选的会移出）";
  move.disabled = selectedChannelIds.size === 0;
  move.addEventListener("click", () => handlers.onOpenPicker("move"));
  moveTools.append(addTo, move);
  summary.append(summaryText, moveTools);

  if (ui.canRestoreLegacy) {
    const restoreBar = createElement("div", "ytdlp-manager-restore");
    restoreBar.append(
      createElement("span", undefined, "检测到升级前的分类数据备份，可以恢复到当前账号。")
    );
    const restore = createElement("button", "ytdlp-manager-primary ytdlp-manager-restore-button", "恢复旧数据");
    restore.type = "button";
    restore.addEventListener("click", handlers.onRestoreLegacy);
    restoreBar.append(restore);
    right.append(restoreBar);
  }
  right.append(
    toolbar,
    summary,
    renderChannels(visibleChannels, selectedChannelIds, handlers, membershipBadges, channelOptions),
    createElement("div", "ytdlp-manager-status", ui.status)
  );

  // Draggable divider between the category and channel panes (Q7).
  const splitter = createElement("div", "ytdlp-manager-splitter");
  splitter.title = "拖动调整分类栏宽度";
  if (layoutPrefs.leftPaneWidth) {
    const pane = Math.min(
      Math.max(layoutPrefs.leftPaneWidth, 180),
      Math.max(180, effectiveDrawerWidth - 360)
    );
    layout.style.gridTemplateColumns = `${pane}px 7px minmax(0, 1fr)`;
  }
  splitter.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = left.getBoundingClientRect().width || 268;
    const maxWidth = Math.max(180, effectiveDrawerWidth - 360);
    const applyPaneWidth = (clientX: number): number => {
      const width = Math.min(Math.max(startWidth + (clientX - startX), 180), maxWidth);
      layout.style.gridTemplateColumns = `${width}px 7px minmax(0, 1fr)`;
      return width;
    };
    const onMove = (moveEvent: MouseEvent) => applyPaneWidth(moveEvent.clientX);
    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handlers.onLayoutChange({ leftPaneWidth: Math.round(applyPaneWidth(upEvent.clientX)) });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  layout.append(left, splitter, right);

  // Drawer outer-frame resize: left edge adjusts width, top edge height (Q7).
  const resizeWidth = createElement("div", "ytdlp-manager-resize ytdlp-manager-resize-w");
  resizeWidth.title = "拖动调整面板宽度";
  resizeWidth.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = drawer.getBoundingClientRect().width || effectiveDrawerWidth;
    const applyWidth = (clientX: number): number => {
      const width = Math.min(Math.max(startWidth - (clientX - startX), 480), Math.max(480, viewportWidth - 32));
      drawer.style.width = `${width}px`;
      return width;
    };
    const onMove = (moveEvent: MouseEvent) => applyWidth(moveEvent.clientX);
    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handlers.onLayoutChange({ drawerWidth: Math.round(applyWidth(upEvent.clientX)) });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  const resizeHeight = createElement("div", "ytdlp-manager-resize ytdlp-manager-resize-h");
  resizeHeight.title = "拖动调整面板高度";
  resizeHeight.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = drawer.getBoundingClientRect().height || viewportHeight - 32;
    const applyHeight = (clientY: number): number => {
      const height = Math.min(Math.max(startHeight - (clientY - startY), 320), Math.max(320, viewportHeight - 32));
      drawer.style.height = `${height}px`;
      return height;
    };
    const onMove = (moveEvent: MouseEvent) => applyHeight(moveEvent.clientY);
    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handlers.onLayoutChange({ drawerHeight: Math.round(applyHeight(upEvent.clientY)) });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  drawer.append(layout, resizeWidth, resizeHeight);
  shell.append(drawer);
  root.append(shell);

  if (ui.draft) {
    root.append(renderDraftEditor(ui.draft, handlers));
  }

  if (ui.picker) {
    root.append(renderPickerDialog(state, ui, handlers));
  }

  if (searchWasFocused) {
    const caret = search.value.length;
    search.focus();
    search.setSelectionRange(caret, caret);
  }
}

export const MANAGER_STYLES = `
.ytdlp-manager-root {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  color: var(--ytdlp-text);
  font-family: Roboto, Arial, sans-serif;
}
.ytdlp-manager-shell {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: var(--ytdlp-backdrop);
  pointer-events: auto;
}
.ytdlp-manager-drawer {
  position: relative;
  width: min(960px, calc(100vw - 48px));
  height: calc(100% - 32px);
  margin: 16px 16px 16px 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  background: var(--ytdlp-surface);
  border: 1px solid var(--ytdlp-border);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.ytdlp-manager-pane-header,
.ytdlp-manager-toolbar,
.ytdlp-manager-summary,
.ytdlp-manager-editor-header,
.ytdlp-manager-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ytdlp-manager-summary h3,
.ytdlp-manager-editor h3 {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
}
.ytdlp-manager-pane-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ytdlp-manager-summary h3,
.ytdlp-manager-editor h3,
.ytdlp-manager-summary p {
  margin: 0;
}
.ytdlp-manager-summary p,
.ytdlp-manager-status,
.ytdlp-manager-channel small {
  color: var(--ytdlp-text-secondary);
  font-size: 12px;
}
.ytdlp-manager-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 268px 7px minmax(0, 1fr);
}
.ytdlp-manager-left,
.ytdlp-manager-right {
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 10px;
  padding: 12px;
}
.ytdlp-manager-left {
  grid-template-rows: auto minmax(0, 1fr);
}
.ytdlp-manager-right {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}
.ytdlp-manager-splitter {
  margin: 12px 0;
  border-radius: 4px;
  cursor: col-resize;
  background: var(--ytdlp-chip);
}
.ytdlp-manager-splitter:hover,
.ytdlp-manager-splitter:active {
  background: var(--ytdlp-chip-hover);
}
.ytdlp-manager-resize {
  position: absolute;
  z-index: 3;
}
.ytdlp-manager-resize-w {
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: ew-resize;
}
.ytdlp-manager-resize-h {
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
}
.ytdlp-manager-categories,
.ytdlp-manager-channels {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ytdlp-manager-channels {
  gap: 0;
}
.ytdlp-manager-category,
.ytdlp-manager-channel {
  display: grid;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
}
.ytdlp-manager-category {
  grid-template-columns: 30px minmax(0, 1fr) auto 76px;
  padding: 5px 7px;
  border-radius: 8px;
  text-align: left;
}
.ytdlp-manager-category.is-active,
.ytdlp-manager-channel.is-selected {
  border-color: transparent;
  background: var(--ytdlp-chip-strong);
}
.ytdlp-manager-category:hover,
.ytdlp-manager-channel:hover {
  background: var(--ytdlp-chip);
}
.ytdlp-manager-channel.is-pinned {
  background: var(--ytdlp-chip-strong);
}
.ytdlp-manager-pin {
  color: var(--ytdlp-text-secondary);
}
.ytdlp-manager-pin.is-active {
  color: var(--ytdlp-cta);
}
.ytdlp-manager-pin.is-active [data-icon="pin"] {
  fill: currentColor;
}
.ytdlp-manager-channels.is-reorderable .ytdlp-manager-channel {
  cursor: grab;
}
.ytdlp-manager-category-icon {
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  color: #fff;
}
.ytdlp-manager-category-icon svg,
.ytdlp-manager-icon-choice svg,
.ytdlp-manager-icon-button svg {
  width: 16px;
  height: 16px;
}
.ytdlp-manager-category-name,
.ytdlp-manager-channel-text strong,
.ytdlp-manager-channel-text small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-manager-category-count {
  color: var(--ytdlp-text-secondary);
  font-size: 12px;
}
.ytdlp-manager-restore {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ytdlp-chip);
  border: 1px solid var(--ytdlp-border);
  font-size: 13px;
}
.ytdlp-manager-restore-button {
  flex: none;
}
.ytdlp-manager-channel-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ytdlp-manager-channel-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--ytdlp-chip);
  color: var(--ytdlp-text-secondary);
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
}
.ytdlp-manager-channel-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: none;
}
.ytdlp-manager-badge-remove {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.ytdlp-manager-badge-remove:hover {
  color: var(--ytdlp-danger);
}
.ytdlp-manager-category-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}
.ytdlp-manager-primary,
.ytdlp-manager-secondary,
.ytdlp-manager-icon-button,
.ytdlp-manager-check,
.ytdlp-manager-search,
.ytdlp-manager-sort,
.ytdlp-manager-move-tools select {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: var(--ytdlp-chip);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ytdlp-manager-primary,
.ytdlp-manager-secondary {
  padding: 0 14px;
  font-weight: 500;
}
.ytdlp-manager-primary {
  background: var(--ytdlp-accent);
  color: var(--ytdlp-accent-contrast);
}
.ytdlp-manager-secondary:hover,
.ytdlp-manager-icon-button:hover,
.ytdlp-manager-check:hover {
  background: var(--ytdlp-chip-hover);
}
.ytdlp-manager-icon-button {
  width: 36px;
  display: inline-grid;
  place-items: center;
  padding: 0;
}
.ytdlp-manager-icon-button.is-danger:hover {
  color: var(--ytdlp-danger);
  background: var(--ytdlp-danger-soft);
}
.ytdlp-manager-search {
  min-width: 160px;
  flex: 1;
  padding: 0 14px;
  cursor: text;
  background: var(--ytdlp-surface);
  border-color: var(--ytdlp-border);
}
.ytdlp-manager-sort {
  min-width: 118px;
  padding: 0 12px;
}
.ytdlp-manager-move-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ytdlp-manager-move-tools select {
  max-width: 170px;
}
.ytdlp-manager-channel {
  grid-template-columns: 28px 38px minmax(0, 1fr) 36px;
  min-height: 58px;
  padding: 7px 8px;
  border-radius: 0;
  border-bottom-color: var(--ytdlp-border);
  background: transparent;
}
.ytdlp-manager-channel.has-pin {
  grid-template-columns: 28px 38px minmax(0, 1fr) 36px 36px;
}
.ytdlp-manager-check {
  width: 24px;
  height: 24px;
  min-height: 24px;
  border: 2px solid var(--ytdlp-cta);
  border-radius: 4px;
  background: transparent;
  color: var(--ytdlp-cta);
  font-weight: 800;
}
.ytdlp-manager-avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--ytdlp-chip-strong);
  color: var(--ytdlp-text-secondary);
  font-weight: 800;
}
.ytdlp-manager-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ytdlp-manager-channel-text {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.ytdlp-manager-editor-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--ytdlp-backdrop-strong);
  pointer-events: auto;
}
.ytdlp-manager-editor {
  width: min(380px, 100%);
  max-height: 100%;
  display: grid;
  gap: 13px;
  overflow: auto;
  border: 1px solid var(--ytdlp-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--ytdlp-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}
.ytdlp-manager-field,
.ytdlp-manager-editor-section {
  display: grid;
  gap: 7px;
}
.ytdlp-manager-field input {
  height: 36px;
  border: 1px solid var(--ytdlp-border);
  border-radius: 6px;
  padding: 0 10px;
  color: inherit;
  background: var(--ytdlp-surface);
}
.ytdlp-manager-label,
.ytdlp-manager-field span,
.ytdlp-manager-custom-color span {
  color: var(--ytdlp-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.ytdlp-manager-preview {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--ytdlp-border);
  border-radius: 8px;
  padding: 8px;
}
.ytdlp-manager-color-grid,
.ytdlp-manager-icon-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
}
.ytdlp-manager-swatch {
  width: 30px;
  height: 30px;
  border: 2px solid transparent;
  border-radius: 8px;
}
.ytdlp-manager-swatch.is-active,
.ytdlp-manager-icon-choice.is-active {
  border-color: currentColor;
}
.ytdlp-manager-custom-color {
  display: grid;
  grid-template-columns: auto 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.ytdlp-manager-custom-color input {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--ytdlp-border);
  border-radius: 8px;
  background: transparent;
}
.ytdlp-manager-custom-color code {
  color: var(--ytdlp-text-secondary);
}
.ytdlp-manager-icon-choice {
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ytdlp-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}
.ytdlp-manager-icon-choice span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-manager-editor-actions {
  justify-content: flex-end;
}
.ytdlp-manager-search-wrap {
  position: relative;
  flex: 1;
  min-width: 160px;
  display: flex;
}
.ytdlp-manager-search-wrap .ytdlp-manager-search {
  min-width: 0;
}
.ytdlp-manager-search-wrap.has-value .ytdlp-manager-search {
  padding-right: 38px;
}
.ytdlp-manager-search-clear {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  min-height: 26px;
  display: none;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--ytdlp-chip-hover);
  color: var(--ytdlp-text-secondary);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.ytdlp-manager-search-wrap.has-value .ytdlp-manager-search-clear {
  display: inline-grid;
}
.ytdlp-manager-search-clear:hover {
  background: var(--ytdlp-layer);
}
.ytdlp-manager-category {
  position: relative;
}
.ytdlp-manager-category.is-drop-target {
  border-color: var(--ytdlp-cta);
  background: var(--ytdlp-cta-soft);
}
.ytdlp-manager-category.is-drop-target .ytdlp-manager-category-actions {
  visibility: hidden;
}
.ytdlp-manager-drop-hint {
  display: none;
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--ytdlp-cta);
  color: var(--ytdlp-cta-contrast);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.ytdlp-manager-category.is-drop-target.is-channel-drop .ytdlp-manager-drop-hint {
  display: inline-flex;
}
.ytdlp-manager-category.is-drop-flash {
  animation: ytdlp-drop-flash 0.45s ease-out;
}
@keyframes ytdlp-drop-flash {
  0% {
    background: var(--ytdlp-cta-soft);
    border-color: var(--ytdlp-cta);
  }
  100% {
    background: transparent;
    border-color: transparent;
  }
}
.ytdlp-manager-picker {
  width: min(420px, 100%);
  max-height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  border: 1px solid var(--ytdlp-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--ytdlp-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  outline: none;
}
.ytdlp-manager-picker-sub {
  margin: -6px 0 0;
  color: var(--ytdlp-text-secondary);
  font-size: 12px;
}
.ytdlp-manager-picker-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 4px;
  align-content: start;
}
.ytdlp-manager-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.ytdlp-manager-picker-row:hover {
  background: var(--ytdlp-chip);
}
.ytdlp-manager-picker-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--ytdlp-cta);
}
.ytdlp-manager-picker-row.is-locked {
  cursor: default;
  opacity: 0.55;
}
.ytdlp-manager-picker-icon {
  width: 26px;
  height: 26px;
}
.ytdlp-manager-picker-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.ytdlp-manager-picker-note {
  flex: none;
  color: var(--ytdlp-text-secondary);
  font-size: 12px;
}
.ytdlp-manager-picker-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ytdlp-manager-picker-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.ytdlp-manager-picker-clear {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ytdlp-danger);
  border-radius: 18px;
  background: transparent;
  color: var(--ytdlp-danger);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.ytdlp-manager-picker-clear:hover {
  background: var(--ytdlp-danger-soft);
}
.ytdlp-manager-picker-confirm {
  min-height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 18px;
  background: var(--ytdlp-accent);
  color: var(--ytdlp-accent-contrast);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.ytdlp-manager-picker-confirm:hover {
  filter: brightness(1.08);
}
.ytdlp-manager-picker-confirm:disabled {
  opacity: 0.45;
  cursor: default;
  filter: none;
}
.ytdlp-manager-picker-confirm.is-danger {
  background: var(--ytdlp-danger);
}
.ytdlp-manager-theme-toggle {
  display: inline-grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
  border-radius: 18px;
  background: var(--ytdlp-chip);
}
.ytdlp-manager-theme-toggle button {
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--ytdlp-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.ytdlp-manager-theme-toggle button.is-active {
  background: var(--ytdlp-accent);
  color: var(--ytdlp-accent-contrast);
}
`;
