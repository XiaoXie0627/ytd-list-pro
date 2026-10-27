import { describe, expect, it, vi } from "vitest";
import {
  addCategory,
  addChannelsToCategory,
  createEmptyState,
  mergeSubscriptions,
  moveChannels,
  toggleChannelPin
} from "../shared/state";
import { UNCATEGORIZED_ID } from "../shared/constants";
import type { CategoryDraft, ManagerUiState } from "./manager";
import { renderManager } from "./manager";

const createState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-a",
        name: "Alpha Channel",
        handle: "@alpha",
        avatarUrl: "https://yt3.googleusercontent.com/a=s88-c",
        url: "https://www.youtube.com/@alpha"
      },
      {
        id: "UC-b",
        name: "Beta Channel",
        handle: "@beta",
        url: "https://www.youtube.com/@beta"
      }
    ],
    1
  );
  state = addCategory(state, { id: "cat-ai", name: "AI", color: "#7c3aed", icon: "ai" });
  state = moveChannels(state, ["UC-a"], "cat-ai");
  return state;
};

const createSortableState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-old",
        name: "Old Channel",
        handle: "@old",
        url: "https://www.youtube.com/@old"
      }
    ],
    10
  );
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-old",
        name: "Old Channel",
        handle: "@old",
        url: "https://www.youtube.com/@old"
      },
      {
        id: "UC-new",
        name: "New Channel",
        handle: "@new",
        url: "https://www.youtube.com/@new"
      }
    ],
    20
  );
  state = addCategory(state, { id: "cat-review", name: "Review", color: "#0f0f0f", icon: "channel" });
  state = moveChannels(state, ["UC-old", "UC-new"], "cat-review");
  return state;
};

const baseUi = (overrides: Partial<ManagerUiState> = {}): ManagerUiState => ({
  selectedCategoryId: "cat-ai",
  selectedChannelIds: [],
  search: "",
  sortMode: "added-desc",
  status: "准备就绪",
  ...overrides
});

const createPinnableState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      { id: "UC-a", name: "Alpha Channel", handle: "@alpha", url: "https://www.youtube.com/@alpha" },
      { id: "UC-b", name: "Beta Channel", handle: "@beta", url: "https://www.youtube.com/@beta" },
      { id: "UC-c", name: "Caramel Channel", handle: "@caramel", url: "https://www.youtube.com/@caramel" }
    ],
    1
  );
  state = addCategory(state, { id: "cat-ai", name: "AI", color: "#7c3aed", icon: "ai" });
  state = moveChannels(state, ["UC-a", "UC-b", "UC-c"], "cat-ai");
  return state;
};

const handlers = () => ({
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onCreateCategory: vi.fn(),
  onRefreshColors: vi.fn(),
  onSelectCategory: vi.fn(),
  onEditCategory: vi.fn(),
  onDeleteCategory: vi.fn(),
  onSearch: vi.fn(),
  onToggleChannel: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelected: vi.fn(),
  onOpenPicker: vi.fn(),
  onClosePicker: vi.fn(),
  onPickerConfirm: vi.fn(),
  onRemoveChannelMembership: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
  onRestoreLegacy: vi.fn(),
  onOpenChannel: vi.fn(),
  onSortChange: vi.fn(),
  onTogglePin: vi.fn(),
  onReorderChannel: vi.fn(),
  onLayoutChange: vi.fn(),
  onSetTheme: vi.fn(),
  onDragCategoryStart: vi.fn(),
  onDropOnCategory: vi.fn(),
  onDragChannelStart: vi.fn(),
  onDraftChange: vi.fn(),
  onDraftSave: vi.fn(),
  onDraftCancel: vi.fn()
});

describe("renderManager", () => {
  it("shows a legacy-restore banner only when recovery is possible", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi({ canRestoreLegacy: true }), managerHandlers);
    const restore = root.querySelector<HTMLButtonElement>(".ytdlp-manager-restore-button");
    expect(restore?.textContent).toBe("恢复旧数据");
    restore?.click();
    expect(managerHandlers.onRestoreLegacy).toHaveBeenCalled();

    renderManager(root, createState(), baseUi(), managerHandlers);
    expect(root.querySelector(".ytdlp-manager-restore")).toBeNull();
  });

  it("renders category and channel management inside a YouTube drawer", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);

    expect(root.querySelector(".ytdlp-manager-drawer")).toBeTruthy();
    expect(root.querySelector(".ytdlp-manager-category.is-active")?.textContent).toContain("AI");
    expect(root.querySelector(".ytdlp-manager-channel")?.textContent).toContain("Alpha Channel");
    expect(root.querySelector(".ytdlp-manager-refresh")?.textContent).toContain("刷新频道");
  });

  it("does not render a redundant drawer title bar or close button", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    expect(root.querySelector(".ytdlp-manager-header")).toBeNull();
    expect(root.textContent).not.toContain("YTD List Pro");
    expect(root.querySelector('[title="关闭"]')).toBeNull();
  });

  it("keeps category editing inside the YouTube manager drawer", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    root.querySelector<HTMLButtonElement>('[title="编辑分类"]')?.click();

    expect(managerHandlers.onEditCategory).toHaveBeenCalledWith("cat-ai");
  });

  it("offers a palette refresh action in the category pane header", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    root.querySelector<HTMLButtonElement>('[title="按默认色板顺序重刷全部分类颜色（未分类保持灰色）"]')?.click();

    expect(managerHandlers.onRefreshColors).toHaveBeenCalledTimes(1);
  });

  it("uses an external-link icon for opening a channel", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    expect(root.querySelector('[title="打开频道"] svg[data-icon="external"]')).toBeTruthy();
  });

  it("sorts channels by newest subscription discovery first", () => {
    const root = document.createElement("div");

    renderManager(root, createSortableState(), baseUi({ selectedCategoryId: "cat-review" }), handlers());

    const names = Array.from(root.querySelectorAll(".ytdlp-manager-channel strong")).map((item) => item.textContent);
    expect(names).toEqual(["New Channel", "Old Channel"]);
  });

  it("lets the user change the channel sort mode", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    const sort = root.querySelector<HTMLSelectElement>(".ytdlp-manager-sort");
    expect(sort?.value).toBe("added-desc");

    sort!.value = "name-asc";
    sort!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(managerHandlers.onSortChange).toHaveBeenCalledWith("name-asc");
  });

  it("renders the category draft editor with focused controls", () => {
    const root = document.createElement("div");
    const draft: CategoryDraft = {
      mode: "edit",
      id: "cat-ai",
      name: "AI",
      color: "#7c3aed",
      icon: "ai"
    };

    renderManager(root, createState(), baseUi({ draft }), handlers());

    expect(root.querySelector(".ytdlp-manager-editor")).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>('input[name="category-name"]')?.value).toBe("AI");
    expect(root.querySelector('button[data-icon-choice="ai"]')?.classList.contains("is-active")).toBe(true);
  });

  it("closes the drawer from the blank overlay without closing on drawer clicks", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);

    root.querySelector<HTMLElement>(".ytdlp-manager-drawer")?.click();
    expect(managerHandlers.onClose).not.toHaveBeenCalled();

    root.querySelector<HTMLElement>(".ytdlp-manager-shell")?.click();
    expect(managerHandlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows membership badges on channel rows and removes one via its ×", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();
    const extra = addCategory(createState(), { id: "cat-dev", name: "Dev", color: "#111", icon: "code" });
    const withTwo = addChannelsToCategory(extra, ["UC-a"], "cat-dev");

    renderManager(root, withTwo, baseUi({ selectedCategoryId: "cat-ai" }), managerHandlers);

    const badges = Array.from(root.querySelectorAll(".ytdlp-manager-channel-badge"));
    const names = badges.map((badge) => badge.textContent);
    expect(names.some((text) => text?.includes("Dev"))).toBe(true);
    expect(names.some((text) => text?.includes("AI"))).toBe(true);

    const removeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".ytdlp-manager-badge-remove"));
    const devRemove = removeButtons[badges.findIndex((badge) => badge.textContent?.includes("Dev"))];
    devRemove?.click();
    expect(managerHandlers.onRemoveChannelMembership).toHaveBeenCalledWith("UC-a", "cat-dev");
  });

  it("opens the category picker from the add and move buttons", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();
    const state = createState();
    const selected = baseUi({ selectedCategoryId: "cat-ai", selectedChannelIds: ["UC-a"] });

    renderManager(root, state, selected, managerHandlers);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".ytdlp-manager-move-tools button"));
    const addTo = buttons.find((button) => button.textContent === "添加");
    const move = buttons.find((button) => button.textContent === "移动");

    addTo?.click();
    expect(managerHandlers.onOpenPicker).toHaveBeenCalledWith("add");
    move?.click();
    expect(managerHandlers.onOpenPicker).toHaveBeenCalledWith("move");
    expect(move?.title).toContain("勾选即最终归属");
    expect(addTo?.title).toContain("保留其他分类归属");
  });

  it("disables add and move while no channel is selected", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".ytdlp-manager-move-tools button"));
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("offers a pin toggle on real-category rows but not on the uncategorized view", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    const pin = root.querySelector<HTMLButtonElement>(".ytdlp-manager-pin");
    expect(pin?.title).toBe("置顶");
    pin?.click();
    expect(managerHandlers.onTogglePin).toHaveBeenCalledWith("UC-a");

    const plain = document.createElement("div");
    renderManager(plain, createState(), baseUi({ selectedCategoryId: UNCATEGORIZED_ID }), managerHandlers);
    expect(plain.querySelector(".ytdlp-manager-pin")).toBeNull();
  });

  it("always renders pinned channels first, highlighted, regardless of sort mode", () => {
    const root = document.createElement("div");
    let state = createPinnableState();
    state = toggleChannelPin(state, "cat-ai", "UC-c");

    renderManager(root, state, baseUi({ sortMode: "name-asc" }), handlers());

    const rows = Array.from(root.querySelectorAll<HTMLElement>(".ytdlp-manager-channel"));
    const names = rows.map((row) => row.querySelector("strong")?.textContent);
    expect(names).toEqual(["Caramel Channel", "Alpha Channel", "Beta Channel"]);
    expect(rows[0].classList.contains("is-pinned")).toBe(true);
    expect(rows[0].querySelector<HTMLButtonElement>(".ytdlp-manager-pin")?.title).toBe("取消置顶");
  });

  it("reorders a channel inside the list via drag and drop in manual mode", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createPinnableState(), baseUi({ sortMode: "manual" }), managerHandlers);
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".ytdlp-manager-channel"));
    rows[2].dispatchEvent(new Event("dragstart", { bubbles: true }));
    rows[0].dispatchEvent(new Event("drop", { bubbles: true }));

    expect(managerHandlers.onReorderChannel).toHaveBeenCalledWith("UC-c", "normal", 0);
  });

  it("renders the pane splitter and drawer resize handles", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    expect(root.querySelector(".ytdlp-manager-splitter")).toBeTruthy();
    expect(root.querySelector(".ytdlp-manager-resize-w")).toBeTruthy();
    expect(root.querySelector(".ytdlp-manager-resize-h")).toBeTruthy();
  });

  it("shows the search clear button only with a query, and clears via click or Escape", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi({ search: "alpha" }), managerHandlers);
    const wrap = root.querySelector<HTMLElement>(".ytdlp-manager-search-wrap");
    expect(wrap?.classList.contains("has-value")).toBe(true);
    wrap?.querySelector<HTMLButtonElement>(".ytdlp-manager-search-clear")?.click();
    expect(managerHandlers.onSearch).toHaveBeenCalledWith("");

    renderManager(root, createState(), baseUi(), managerHandlers);
    expect(root.querySelector(".ytdlp-manager-search-wrap")?.classList.contains("has-value")).toBe(false);

    const search = root.querySelector<HTMLInputElement>(".ytdlp-manager-search");
    search!.value = "beta";
    search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(managerHandlers.onSearch).toHaveBeenCalledWith("");
  });

  it("pre-checks and locks owned categories for a single channel in the add picker", () => {
    const root = document.createElement("div");
    const state = addCategory(createState(), { id: "cat-dev", name: "Dev", color: "#111", icon: "code" });

    renderManager(root, state, baseUi({ selectedChannelIds: ["UC-a"], picker: { mode: "add" } }), handlers());

    const boxes = Array.from(root.querySelectorAll<HTMLInputElement>(".ytdlp-manager-picker-row input"));
    const ai = boxes.find((box) => box.value === "cat-ai");
    const dev = boxes.find((box) => box.value === "cat-dev");
    expect(ai?.checked).toBe(true);
    expect(ai?.disabled).toBe(true);
    expect(ai?.closest(".ytdlp-manager-picker-row")?.textContent).toContain("已在该分类");
    expect(dev?.checked).toBe(false);
    expect(dev?.disabled).toBe(false);

    const confirm = root.querySelector<HTMLButtonElement>(".ytdlp-manager-picker-confirm");
    expect(confirm?.textContent).toBe("添加到 0 个分类");
    expect(confirm?.disabled).toBe(true);
    dev!.checked = true;
    dev!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(confirm?.textContent).toBe("添加到 1 个分类");
    expect(confirm?.disabled).toBe(false);
  });

  it("annotates partial ownership and locks common categories for multi-select in the add picker", () => {
    const root = document.createElement("div");
    let state = addCategory(createState(), { id: "cat-dev", name: "Dev", color: "#111", icon: "code" });
    // Both channels live in cat-ai (common → locked); only UC-a lives in cat-dev.
    state = addChannelsToCategory(state, ["UC-a"], "cat-dev");
    state = addChannelsToCategory(state, ["UC-b"], "cat-ai");

    renderManager(root, state, baseUi({ selectedChannelIds: ["UC-a", "UC-b"], picker: { mode: "add" } }), handlers());

    const rows = Array.from(root.querySelectorAll<HTMLElement>(".ytdlp-manager-picker-row"));
    const aiRow = rows.find((row) => row.querySelector<HTMLInputElement>("input")?.value === "cat-ai");
    const devRow = rows.find((row) => row.querySelector<HTMLInputElement>("input")?.value === "cat-dev");
    expect(aiRow?.querySelector("input")?.disabled).toBe(true);
    expect(devRow?.textContent).toContain("1/2 已在该分类");
    expect(devRow?.querySelector("input")?.disabled).toBe(false);
  });

  it("confirms a move with the checked set and flips to remove-all when nothing is checked", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(
      root,
      createState(),
      baseUi({ selectedChannelIds: ["UC-a", "UC-b"], picker: { mode: "move" } }),
      managerHandlers
    );

    const confirm = root.querySelector<HTMLButtonElement>(".ytdlp-manager-picker-confirm");
    expect(confirm?.textContent).toBe("确认移出所有分类");
    expect(confirm?.classList.contains("is-danger")).toBe(true);

    const box = root.querySelector<HTMLInputElement>('.ytdlp-manager-picker-row input[value="cat-ai"]');
    box!.checked = true;
    box!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(confirm?.textContent).toBe("移动到 1 个分类");
    expect(confirm?.classList.contains("is-danger")).toBe(false);

    confirm?.click();
    expect(managerHandlers.onPickerConfirm).toHaveBeenCalledWith("move", ["cat-ai"]);
  });

  it("clears all checks via the remove-all button in move mode only", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(
      root,
      createState(),
      baseUi({ selectedChannelIds: ["UC-a"], picker: { mode: "move" } }),
      managerHandlers
    );
    expect(root.querySelector(".ytdlp-manager-picker-clear")).toBeTruthy();
    expect(root.querySelector<HTMLButtonElement>(".ytdlp-manager-picker-confirm")?.textContent).toBe("移动到 1 个分类");

    root.querySelector<HTMLButtonElement>(".ytdlp-manager-picker-clear")?.click();
    const confirm = root.querySelector<HTMLButtonElement>(".ytdlp-manager-picker-confirm");
    expect(confirm?.textContent).toBe("确认移出所有分类");
    confirm?.click();
    expect(managerHandlers.onPickerConfirm).toHaveBeenCalledWith("move", []);

    const addRoot = document.createElement("div");
    renderManager(
      addRoot,
      createState(),
      baseUi({ selectedChannelIds: ["UC-a"], picker: { mode: "add" } }),
      handlers()
    );
    expect(addRoot.querySelector(".ytdlp-manager-picker-clear")).toBeNull();
  });

  it("closes the picker via Escape and backdrop, and confirms via Enter", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(
      root,
      createState(),
      baseUi({ selectedChannelIds: ["UC-a"], picker: { mode: "move" } }),
      managerHandlers
    );

    root.querySelector<HTMLElement>(".ytdlp-manager-picker-list")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(managerHandlers.onClosePicker).toHaveBeenCalledTimes(1);

    root.querySelector<HTMLElement>(".ytdlp-manager-editor-backdrop")?.click();
    expect(managerHandlers.onClosePicker).toHaveBeenCalledTimes(2);

    root.querySelector<HTMLElement>(".ytdlp-manager-picker")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(managerHandlers.onPickerConfirm).toHaveBeenCalledWith("move", ["cat-ai"]);
  });

  it("marks category rows as drop targets while dragging, with a hint for channel drags", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());
    const row = root.querySelectorAll<HTMLElement>(".ytdlp-manager-category")[1];

    row.dispatchEvent(
      Object.assign(new Event("dragover", { bubbles: true }), {
        dataTransfer: { types: ["application/x-ytdlp-channel"] }
      })
    );
    expect(row.classList.contains("is-drop-target")).toBe(true);
    expect(row.classList.contains("is-channel-drop")).toBe(true);
    expect(row.querySelector(".ytdlp-manager-drop-hint")).toBeTruthy();

    row.dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(row.classList.contains("is-drop-target")).toBe(false);
    expect(row.classList.contains("is-channel-drop")).toBe(false);
  });

  it("flashes the target category row after a drop", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi({ flashCategoryId: "cat-ai" }), handlers());

    const row = root.querySelectorAll<HTMLElement>(".ytdlp-manager-category")[1];
    expect(row.classList.contains("is-drop-flash")).toBe(true);
  });
});
