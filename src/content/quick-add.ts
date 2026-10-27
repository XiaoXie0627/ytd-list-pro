import { UNCATEGORIZED_ID } from "../shared/constants";
import { findChannelByIdOrHandle, getChannelCategoryIds } from "../shared/state";
import type { Channel, ExtensionState } from "../shared/types";
import { channelFromUrl } from "../shared/youtube-parser";
import { createSvgIcon } from "./sidebar";

export const QUICK_ADD_ROOT_ID = "ytdlp-quick-add";

export type QuickAddHandlers = {
  // Toggle: joining a category the channel is not in, leaving one it is in.
  onToggleCategory(channel: Channel, categoryId: string): void;
  onOpenManager(): void;
};

const cleanText = (value: string | null | undefined): string => value?.replace(/\s+/g, " ").trim() ?? "";

const readWatchPageChannel = (root: ParentNode): Channel | undefined => {
  const owner = root.querySelector("ytd-watch-metadata #owner");
  if (!owner) {
    return undefined;
  }
  const anchor = owner.querySelector<HTMLAnchorElement>('a[href^="/@"], a[href^="/channel/"]');
  const href = anchor?.getAttribute("href");
  if (!href) {
    return undefined;
  }
  const name = cleanText(owner.querySelector("#channel-name")?.textContent);
  const avatar = owner.querySelector<HTMLImageElement>("img")?.src;
  return channelFromUrl(href, name, avatar);
};

const readChannelPageChannel = (root: ParentNode, pathname: string): Channel | undefined => {
  const header = root.querySelector("yt-page-header-renderer, ytd-c4-tabbed-header-renderer");
  if (!header) {
    return undefined;
  }
  const name = cleanText(header.querySelector("h1")?.textContent);
  const avatar = header.querySelector<HTMLImageElement>("yt-avatar-shape img, #avatar img, img")?.src;
  return channelFromUrl(pathname, name, avatar);
};

export const readPageChannel = (root: ParentNode = document, pathname = location.pathname): Channel | undefined =>
  readWatchPageChannel(root) ?? readChannelPageChannel(root, pathname);

export const findQuickAddAnchor = (root: ParentNode = document): HTMLElement | undefined => {
  const owner = root.querySelector<HTMLElement>("ytd-watch-metadata #owner");
  if (owner) {
    return owner;
  }
  const headerActions = root.querySelector<HTMLElement>("yt-page-header-renderer yt-flexible-actions-view-model");
  if (headerActions) {
    return headerActions;
  }
  const subscribe = root.querySelector<HTMLElement>(
    "yt-page-header-renderer yt-subscribe-button-view-model, ytd-c4-tabbed-header-renderer #subscribe-button"
  );
  return subscribe?.parentElement ?? undefined;
};

export const quickAddSignature = (state: ExtensionState, pageChannel: Channel): string => {
  const existing = findChannelByIdOrHandle(state, pageChannel.id, pageChannel.handle);
  const channelId = existing?.id ?? pageChannel.id;
  return JSON.stringify({
    channel: channelId,
    assigned: getChannelCategoryIds(state, channelId),
    categories: [UNCATEGORIZED_ID, ...state.categoryOrder].map((id) => {
      const category = state.categories[id];
      return category ? [category.id, category.name, category.color, category.icon] : undefined;
    })
  });
};

const renderMenuIcon = (color: string, icon: Parameters<typeof createSvgIcon>[0]): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.className = "ytdlp-quick-add-cat-icon";
  wrap.style.backgroundColor = color;
  wrap.append(createSvgIcon(icon));
  return wrap;
};

export function renderQuickAdd(
  root: HTMLElement,
  state: ExtensionState,
  pageChannel: Channel,
  handlers: QuickAddHandlers
): void {
  root.replaceChildren();
  root.className = "ytdlp-quick-add";

  const existing = findChannelByIdOrHandle(state, pageChannel.id, pageChannel.handle);
  const channelId = existing?.id ?? pageChannel.id;
  const assignedCategoryIds = getChannelCategoryIds(state, channelId).filter((id) => id !== UNCATEGORIZED_ID);
  const assignedCategories = assignedCategoryIds
    .map((id) => state.categories[id])
    .filter((category): category is NonNullable<typeof category> => Boolean(category));

  const button = document.createElement("button");
  button.type = "button";
  button.className = assignedCategories.length > 0 ? "ytdlp-quick-add-button is-assigned" : "ytdlp-quick-add-button";
  button.title =
    assignedCategories.length > 0
      ? `所属分类：${assignedCategories.map((category) => category.name).join("、")}（点击加入/移除）`
      : "把这个频道加入分类";
  if (assignedCategories.length > 0) {
    assignedCategories.forEach((category, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "ytdlp-quick-add-sep";
        separator.textContent = "·";
        button.append(separator);
      }
      button.append(renderMenuIcon(category.color, category.icon));
      const label = document.createElement("span");
      label.textContent = category.name;
      button.append(label);
    });
  } else {
    const plus = document.createElement("span");
    plus.className = "ytdlp-quick-add-plus";
    plus.textContent = "+";
    const label = document.createElement("span");
    label.textContent = "加入分类";
    button.append(plus, label);
  }

  const menu = document.createElement("div");
  menu.className = "ytdlp-quick-add-menu";
  menu.hidden = true;

  const closeMenu = () => {
    menu.hidden = true;
    document.removeEventListener("click", onDocumentClick, true);
  };
  const onDocumentClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node) || !root.contains(event.target)) {
      closeMenu();
    }
  };
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) {
      menu.hidden = false;
      document.addEventListener("click", onDocumentClick, true);
    } else {
      closeMenu();
    }
  });

  for (const categoryId of [UNCATEGORIZED_ID, ...state.categoryOrder]) {
    const category = state.categories[categoryId];
    if (!category) {
      continue;
    }
    const isMember =
      categoryId === UNCATEGORIZED_ID
        ? assignedCategoryIds.length === 0
        : assignedCategoryIds.includes(categoryId);
    const item = document.createElement("button");
    item.type = "button";
    item.className = isMember ? "ytdlp-quick-add-item is-current" : "ytdlp-quick-add-item";
    item.title = isMember ? `点击从「${category.name}」移除` : `点击加入「${category.name}」`;
    item.append(renderMenuIcon(category.color, category.icon));
    const name = document.createElement("span");
    name.className = "ytdlp-quick-add-item-name";
    name.textContent = category.name;
    item.append(name);
    if (isMember) {
      const check = document.createElement("span");
      check.className = "ytdlp-quick-add-check";
      check.textContent = "✓";
      item.append(check);
    }
    // Toggle: joining a category the channel is not in, leaving one it is in.
    // Uncategorized is implicit (zero memberships), so clicking it while
    // uncategorized is a no-op.
    const togglingMakesSense = categoryId !== UNCATEGORIZED_ID || !isMember;
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMenu();
      if (togglingMakesSense) {
        handlers.onToggleCategory(pageChannel, categoryId);
      }
    });
    menu.append(item);
  }

  const divider = document.createElement("div");
  divider.className = "ytdlp-quick-add-divider";
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "ytdlp-quick-add-item is-manage";
  manage.textContent = "管理分类…";
  manage.addEventListener("click", (event) => {
    event.stopPropagation();
    closeMenu();
    handlers.onOpenManager();
  });
  menu.append(divider, manage);

  root.append(button, menu);
}

export const QUICK_ADD_STYLES = `
.ytdlp-quick-add {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  font-family: Roboto, Arial, sans-serif;
}
.ytdlp-quick-add-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: var(--ytdlp-chip);
  color: var(--ytdlp-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 36px;
  white-space: nowrap;
  cursor: pointer;
}
.ytdlp-quick-add-button:hover {
  background: var(--ytdlp-chip-hover);
}
.ytdlp-quick-add-plus {
  font-size: 17px;
  line-height: 1;
}
.ytdlp-quick-add-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 2147483645;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 12px;
  background: var(--ytdlp-surface);
  border: 1px solid var(--ytdlp-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.ytdlp-quick-add-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ytdlp-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.ytdlp-quick-add-item:hover {
  background: var(--ytdlp-chip);
}
.ytdlp-quick-add-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-quick-add-check {
  color: var(--ytdlp-cta);
  font-weight: 700;
}
.ytdlp-quick-add-sep {
  color: var(--ytdlp-text-secondary);
}
.ytdlp-quick-add-cat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  color: #fff;
  flex: none;
}
.ytdlp-quick-add-cat-icon svg {
  width: 12px;
  height: 12px;
}
.ytdlp-quick-add-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--ytdlp-border);
}
.ytdlp-quick-add-item.is-manage {
  color: var(--ytdlp-text-secondary);
}
`;
