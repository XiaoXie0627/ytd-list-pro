import { describe, expect, it } from "vitest";
import {
  addCategory,
  addChannelsToCategory,
  applyLegacyImportIfNeeded,
  createEmptyState,
  deleteCategory,
  getCategoryChannelView,
  getChannelCategoryIds,
  getChannelsForCategory,
  mergeSubscriptions,
  moveChannelInCategory,
  moveChannels,
  nextCategoryColor,
  removeChannelFromCategory,
  renameCategory,
  reorderCategories,
  refreshDefaultColors,
  importChannelsToCategories,
  searchAllChannels,
  searchChannels,
  setChannelCategories,
  setManagerLayout,
  setManagerSortMode,
  setThemePreference,
  toggleChannelPin,
  upsertChannelToCategory
} from "./state";
import { PRESET_COLORS, UNCATEGORIZED_ID } from "./constants";
import type { Channel, LegacyImportData } from "./types";

const channel = (id: string, name = id): Channel => ({
  id,
  name,
  avatarUrl: `https://img.youtube.test/${id}.jpg`,
  handle: `@${id}`,
  url: `https://www.youtube.com/channel/${id}`
});

const uncategorizedIds = (state: ReturnType<typeof createEmptyState>): string[] =>
  getChannelsForCategory(state, UNCATEGORIZED_ID).map((item) => item.id);

const sampleLegacyData: LegacyImportData = {
  channels: [
    channel("UC-sample-a", "Sample AI"),
    channel("UC-sample-b", "Sample Video"),
    channel("UC-sample-c", "Sample Talk")
  ],
  categories: [
    {
      id: "cat-ai",
      name: "AI",
      color: "#8b5cf6",
      icon: "open",
      channelIds: ["UC-sample-a"]
    },
    {
      id: "cat-talk",
      name: "AITalk",
      color: "#14b8a6",
      icon: "open",
      channelIds: ["UC-sample-c"]
    }
  ],
  uncategorizedChannelIds: ["UC-sample-b"]
};

describe("subscription merge", () => {
  it("keeps existing memberships, leaves new channels uncategorized, and removes missing channels", () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(initial, [channel("UC-a"), channel("UC-b")], 10);
    const withCategory = addCategory(withChannels, {
      id: "cat-learning",
      name: "Learning",
      color: "#3b82f6",
      icon: "learning"
    });
    const organized = moveChannels(withCategory, ["UC-a"], "cat-learning");

    const refreshed = mergeSubscriptions(
      organized,
      [channel("UC-a", "A updated"), channel("UC-c", "C new")],
      20
    );

    expect(refreshed.channels["UC-a"]?.name).toBe("A updated");
    expect(refreshed.categories["cat-learning"]?.channelIds).toEqual(["UC-a"]);
    expect(getChannelCategoryIds(refreshed, "UC-a")).toEqual(["cat-learning"]);
    expect(uncategorizedIds(refreshed)).toEqual(["UC-c"]);
    expect(refreshed.memberships["UC-c"]).toBeUndefined();
    expect(refreshed.channels["UC-b"]).toBeUndefined();
    expect(refreshed.lastSyncedAt).toBe(20);
  });

  it("tracks the first local discovery time for newly seen subscriptions", () => {
    const initial = mergeSubscriptions(createEmptyState(), [channel("UC-old")], 10);
    const refreshed = mergeSubscriptions(initial, [channel("UC-old"), channel("UC-new")], 25);
    const withRemoteSubscriptionTime = mergeSubscriptions(
      refreshed,
      [{ ...channel("UC-new"), subscribedAt: 30 }],
      40
    );

    expect(refreshed.channels["UC-old"]?.discoveredAt).toBe(10);
    expect(refreshed.channels["UC-new"]?.discoveredAt).toBe(25);
    expect(withRemoteSubscriptionTime.channels["UC-new"]?.discoveredAt).toBe(25);
    expect(withRemoteSubscriptionTime.channels["UC-new"]?.subscribedAt).toBe(30);
  });

  it("remaps fallback handle ids to canonical ids while preserving multi-memberships", () => {
    const initial = createEmptyState();
    const withCategoryA = addCategory(initial, { id: "cat-a", name: "A", color: "#111", icon: "code" });
    const withCategoryB = addCategory(withCategoryA, { id: "cat-b", name: "B", color: "#222", icon: "music" });
    const pageChannel: Channel = {
      id: "handle:new",
      name: "New Channel",
      handle: "@new",
      url: "https://www.youtube.com/@new"
    };
    const assigned = upsertChannelToCategory(withCategoryB, pageChannel, "cat-a", 100);
    const doubleAssigned = upsertChannelToCategory(assigned, pageChannel, "cat-b", 100);

    const synced = mergeSubscriptions(
      doubleAssigned,
      [{ ...channel("UC-new", "New Channel"), handle: "@new" }],
      20000
    );

    expect(synced.channels["handle:new"]).toBeUndefined();
    expect(getChannelCategoryIds(synced, "UC-new")).toEqual(["cat-a", "cat-b"]);
    expect(synced.categories["cat-a"]?.channelIds).toEqual(["UC-new"]);
    expect(synced.categories["cat-b"]?.channelIds).toEqual(["UC-new"]);
  });
});

describe("category management", () => {
  it("creates, renames, deletes, and reorders categories while protecting uncategorized", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b")], 10);
    state = addCategory(state, { id: "cat-a", name: "Alpha", color: "#ef4444", icon: "video" });
    state = addCategory(state, { id: "cat-b", name: "Beta", color: "#22c55e", icon: "music" });
    state = moveChannels(state, ["UC-a"], "cat-a");
    state = renameCategory(state, "cat-a", "Renamed");
    state = reorderCategories(state, ["cat-b", "cat-a"]);

    expect(state.categoryOrder).toEqual(["cat-b", "cat-a"]);
    expect(state.categories["cat-a"]?.name).toBe("Renamed");

    state = deleteCategory(state, "cat-a");

    expect(state.categories["cat-a"]).toBeUndefined();
    expect(state.categoryOrder).toEqual(["cat-b"]);
    expect(state.memberships["UC-a"]).toBeUndefined();
    expect(uncategorizedIds(state)).toEqual(["UC-a", "UC-b"]);
    expect(() => deleteCategory(state, UNCATEGORIZED_ID)).toThrow(/system category/i);
  });

  it("keeps memberships that point at other categories when deleting one category", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a")], 10);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "code" });
    state = addCategory(state, { id: "cat-b", name: "B", color: "#222", icon: "music" });
    state = addChannelsToCategory(state, ["UC-a"], "cat-a");
    state = addChannelsToCategory(state, ["UC-a"], "cat-b");

    state = deleteCategory(state, "cat-a");

    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-b"]);
    expect(state.categories["cat-b"]?.channelIds).toEqual(["UC-a"]);
    expect(uncategorizedIds(state)).toEqual([]);
  });

  it("allows a category name to be cleared while the user is editing", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-draft", name: "新", color: "#ef4444", icon: "default" });

    const renamed = renameCategory(state, "cat-draft", "");

    expect(renamed.categories["cat-draft"]?.name).toBe("");
  });

  it("picks the first unused preset color for a new category", () => {
    let state = createEmptyState();

    expect(nextCategoryColor(state)).toBe(PRESET_COLORS[0]);

    state = addCategory(state, { id: "cat-a", name: "Alpha", color: PRESET_COLORS[0], icon: "video" });

    expect(nextCategoryColor(state)).toBe(PRESET_COLORS[1]);

    state = deleteCategory(state, "cat-a");

    expect(nextCategoryColor(state)).toBe(PRESET_COLORS[0]);
  });

  it("cycles the palette by order length once every preset color is taken", () => {
    let state = createEmptyState();
    PRESET_COLORS.forEach((color, index) => {
      state = addCategory(state, { id: `cat-${index}`, name: `C${index}`, color, icon: "default" });
    });

    expect(nextCategoryColor(state)).toBe(PRESET_COLORS[0]);

    state = addCategory(state, { id: "cat-extra", name: "Extra", color: nextCategoryColor(state), icon: "default" });

    expect(nextCategoryColor(state)).toBe(PRESET_COLORS[1]);
  });

  it("refreshes user category colors in display order and leaves uncategorized alone", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-a", name: "Alpha", color: "#111111", icon: "video" });
    state = addCategory(state, { id: "cat-b", name: "Beta", color: "#222222", icon: "music" });
    state = reorderCategories(state, ["cat-b", "cat-a"]);
    state.categories[UNCATEGORIZED_ID].color = "#999999";

    const refreshed = refreshDefaultColors(state);

    expect(refreshed.categories["cat-b"]?.color).toBe(PRESET_COLORS[0]);
    expect(refreshed.categories["cat-a"]?.color).toBe(PRESET_COLORS[1]);
    expect(refreshed.categories[UNCATEGORIZED_ID]?.color).toBe("#999999");
    expect(state.categories["cat-b"]?.color).toBe("#222222");
  });
});

describe("multi-membership primitives", () => {
  const buildState = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 10);
    state = addCategory(state, { id: "cat-work", name: "Work", color: "#0ea5e9", icon: "code" });
    state = addCategory(state, { id: "cat-fun", name: "Fun", color: "#f97316", icon: "video" });
    return state;
  };

  it("lets one channel live in several categories at once", () => {
    let state = buildState();
    state = addChannelsToCategory(state, ["UC-a"], "cat-work");
    state = addChannelsToCategory(state, ["UC-a"], "cat-fun");

    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-work", "cat-fun"]);
    expect(getChannelsForCategory(state, "cat-work").map((item) => item.id)).toEqual(["UC-a"]);
    expect(getChannelsForCategory(state, "cat-fun").map((item) => item.id)).toEqual(["UC-a"]);
    expect(uncategorizedIds(state)).toEqual(["UC-b", "UC-c"]);
  });

  it("adding is idempotent and keeps the order arrays aligned", () => {
    let state = buildState();
    state = addChannelsToCategory(state, ["UC-a", "UC-b", "UC-a"], "cat-work");
    state = addChannelsToCategory(state, ["UC-a"], "cat-work");

    expect(state.categories["cat-work"]?.channelIds).toEqual(["UC-a", "UC-b"]);
    expect(state.memberships["UC-a"]).toEqual(["cat-work"]);
  });

  it("removing one membership keeps the others and cleans up the order arrays", () => {
    let state = buildState();
    state = addChannelsToCategory(state, ["UC-a"], "cat-work");
    state = addChannelsToCategory(state, ["UC-a"], "cat-fun");

    state = removeChannelFromCategory(state, "UC-a", "cat-work");

    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-fun"]);
    expect(state.categories["cat-work"]?.channelIds).toEqual([]);
    expect(state.categories["cat-fun"]?.channelIds).toEqual(["UC-a"]);
    expect(uncategorizedIds(state)).toEqual(["UC-b", "UC-c"]);

    state = removeChannelFromCategory(state, "UC-a", "cat-fun");
    expect(state.memberships["UC-a"]).toBeUndefined();
    expect(uncategorizedIds(state)).toEqual(["UC-a", "UC-b", "UC-c"]);
  });

  it("moving replaces all memberships with the single target category", () => {
    let state = buildState();
    state = addChannelsToCategory(state, ["UC-a"], "cat-work");
    state = addChannelsToCategory(state, ["UC-a"], "cat-fun");

    state = moveChannels(state, ["UC-a"], "cat-fun");

    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-fun"]);
    expect(state.categories["cat-work"]?.channelIds).toEqual([]);

    state = moveChannels(state, ["UC-a"], UNCATEGORIZED_ID);
    expect(state.memberships["UC-a"]).toBeUndefined();
    expect(uncategorizedIds(state)).toEqual(["UC-a", "UC-b", "UC-c"]);
  });

  it("rejects unknown target categories", () => {
    const state = buildState();
    expect(() => addChannelsToCategory(state, ["UC-a"], "cat-nope")).toThrow(/Category not found/);
    expect(() => moveChannels(state, ["UC-a"], "cat-nope")).toThrow(/Category not found/);
  });
});

describe("legacy import", () => {
  it("imports recovered data only when local state has no user categories and has not imported before", () => {
    const imported = applyLegacyImportIfNeeded(createEmptyState(), sampleLegacyData);

    expect(Object.keys(imported.channels)).toHaveLength(3);
    expect(imported.categoryOrder).toHaveLength(2);
    expect(getChannelCategoryIds(imported, "UC-sample-a")).toEqual(["cat-ai"]);
    expect(getChannelCategoryIds(imported, "UC-sample-b")).toEqual([]);
    expect(imported.memberships["UC-sample-b"]).toBeUndefined();
    expect(imported.importedLegacyData).toBe(true);
    expect(Object.values(imported.channels).some((item) => item.name.startsWith("Recovered Channel"))).toBe(false);
    expect(Object.values(imported.channels).every((item) => item.avatarUrl?.startsWith("https://"))).toBe(true);
    expect(Object.values(imported.categories).find((category) => category.name === "AI")?.icon).toBe("ai");
    expect(Object.values(imported.categories).find((category) => category.name === "AITalk")?.icon).toBe("interview");

    const secondPass = applyLegacyImportIfNeeded(imported, sampleLegacyData);
    expect(secondPass).toEqual(imported);

    const userState = addCategory(createEmptyState(), {
      id: "cat-user",
      name: "User Category",
      color: "#a855f7",
      icon: "default"
    });

    const untouched = applyLegacyImportIfNeeded(userState, sampleLegacyData);
    expect(untouched.categoryOrder).toEqual(["cat-user"]);
    expect(Object.keys(untouched.channels)).toHaveLength(0);
    expect(untouched.importedLegacyData).toBe(true);
  });

  it("replaces the previous placeholder recovery dataset even after the import flag was set", () => {
    const placeholder = {
      ...createEmptyState(),
      importedLegacyData: true,
      channels: {
        UClegacy001: {
          id: "UClegacy001",
          name: "Recovered Channel 001",
          handle: "@recovered001",
          avatarUrl: "https://yt3.ggpht.com/recovered-001=s88-c-k-c0x00ffffff-no-rj",
          url: "https://www.youtube.com/channel/UClegacy001"
        }
      }
    };

    const migrated = applyLegacyImportIfNeeded(placeholder, sampleLegacyData);

    expect(migrated.channels.UClegacy001).toBeUndefined();
    expect(Object.keys(migrated.channels)).toHaveLength(3);
    expect(Object.values(migrated.channels).some((item) => item.name.startsWith("Recovered Channel"))).toBe(false);
  });

  it("upgrades old recovered category appearances without overwriting user-edited icons", () => {
    const state = {
      ...createEmptyState(),
      importedLegacyData: true,
      categories: {
        ...createEmptyState().categories,
        "cat-ai": {
          id: "cat-ai",
          name: "AI",
          color: "#8b5cf6",
          icon: "open" as const,
          channelIds: []
        },
        "cat-custom": {
          id: "cat-custom",
          name: "AITalk",
          color: "#111827",
          icon: "music" as const,
          channelIds: []
        }
      },
      categoryOrder: ["cat-ai", "cat-custom"]
    };

    const upgraded = applyLegacyImportIfNeeded(state, sampleLegacyData);

    expect(upgraded.categories["cat-ai"]?.icon).toBe("ai");
    expect(upgraded.categories["cat-custom"]?.icon).toBe("music");
    expect(upgraded.categories["cat-custom"]?.color).toBe("#111827");
  });
});

describe("searchChannels", () => {
  const channels = [
    channel("UC-a", "中文示例频道"),
    channel("UC-b", "Demoship"),
    channel("UC-c", "Coding Demo")
  ];

  it("matches case-insensitive substrings of name and handle", () => {
    expect(searchChannels(channels, "ship")).toEqual([channels[1]]);
    expect(searchChannels(channels, "示例")).toEqual([channels[0]]);
    expect(searchChannels(channels, "@uc-c")).toEqual([channels[2]]);
  });

  it("matches multiple whitespace-separated keywords in any order", () => {
    expect(searchChannels(channels, "demo coding")).toEqual([channels[2]]);
    expect(searchChannels(channels, "频道 中文")).toEqual([channels[0]]);
  });

  it("returns all channels for an empty or whitespace-only query", () => {
    expect(searchChannels(channels, "")).toEqual(channels);
    expect(searchChannels(channels, "   ")).toEqual(channels);
  });

  it("returns nothing when a keyword does not match", () => {
    expect(searchChannels(channels, "demoship 示例")).toEqual([]);
  });
});

describe("searchAllChannels", () => {
  const buildState = () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(
      initial,
      [channel("UC-a", "中文示例频道"), channel("UC-b", "Demoship"), channel("UC-c", "Coding Demo")],
      10
    );
    const withCategory = addCategory(withChannels, {
      id: "cat-dev",
      name: "编程",
      color: "#3b82f6",
      icon: "learning"
    });
    return addChannelsToCategory(withCategory, ["UC-b", "UC-c"], "cat-dev");
  };

  it("finds channels across every category and reports all memberships", () => {
    const state = buildState();
    const hits = searchAllChannels(state, "ship");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.channel.id).toBe("UC-b");
    expect(hits[0]?.categoryIds).toEqual(["cat-dev"]);
    expect(hits[0]?.categoryNames).toEqual(["编程"]);
  });

  it("includes uncategorized channels with an empty membership list", () => {
    const hits = searchAllChannels(buildState(), "示例");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.channel.id).toBe("UC-a");
    expect(hits[0]?.categoryIds).toEqual([]);
    expect(hits[0]?.categoryNames).toEqual([]);
  });

  it("deduplicates a channel that lives in several categories and lists every name", () => {
    let state = buildState();
    state = addCategory(state, { id: "cat-fun", name: "趣味", color: "#f97316", icon: "video" });
    state = addChannelsToCategory(state, ["UC-b"], "cat-fun");

    const hits = searchAllChannels(state, "ship");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.categoryNames).toEqual(["编程", "趣味"]);
  });

  it("returns no hits for an empty query", () => {
    expect(searchAllChannels(buildState(), "  ")).toEqual([]);
  });
});

describe("upsertChannelToCategory", () => {
  const buildState = () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(initial, [channel("UC-a", "Alpha")], 10);
    return addCategory(withChannels, { id: "cat-dev", name: "编程", color: "#3b82f6", icon: "learning" });
  };

  it("ensures membership without touching other categories", () => {
    let state = buildState();
    state = addCategory(state, { id: "cat-other", name: "其他", color: "#111", icon: "idea" });
    state = addChannelsToCategory(state, ["UC-a"], "cat-other");

    state = upsertChannelToCategory(state, channel("UC-a", "Alpha"), "cat-dev", 99);

    // Result order follows the sidebar (categoryOrder), not join order.
    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-dev", "cat-other"]);
  });

  it("matches an existing channel by handle when the page only exposes a handle id", () => {
    const pageChannel: Channel = {
      id: "handle:uc-a",
      name: "Alpha",
      handle: "@UC-a",
      url: "https://www.youtube.com/@UC-a"
    };
    const state = upsertChannelToCategory(buildState(), pageChannel, "cat-dev", 99);
    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-dev"]);
    expect(state.channels["handle:uc-a"]).toBeUndefined();
  });

  it("adds a brand-new channel with subscription timestamps before categorizing it", () => {
    const fresh: Channel = {
      id: "handle:new",
      name: "New Channel",
      handle: "@new",
      url: "https://www.youtube.com/@new"
    };
    const state = upsertChannelToCategory(buildState(), fresh, "cat-dev", 12345);
    expect(getChannelCategoryIds(state, "handle:new")).toEqual(["cat-dev"]);
    expect(state.channels["handle:new"]?.subscribedAt).toBe(12345);
    expect(state.channels["handle:new"]?.discoveredAt).toBe(12345);
  });

  it("assigning to uncategorized resets all memberships", () => {
    let state = buildState();
    state = upsertChannelToCategory(state, channel("UC-a", "Alpha"), "cat-dev", 99);

    state = upsertChannelToCategory(state, channel("UC-a", "Alpha"), UNCATEGORIZED_ID, 100);

    expect(state.memberships["UC-a"]).toBeUndefined();
    expect(uncategorizedIds(state)).toContain("UC-a");
  });

  it("keeps the category assignment when a later sync replaces the handle id with the canonical id", () => {
    const fresh: Channel = {
      id: "handle:new",
      name: "New Channel",
      handle: "@new",
      url: "https://www.youtube.com/@new"
    };
    const assigned = upsertChannelToCategory(buildState(), fresh, "cat-dev", 12345);
    const synced = mergeSubscriptions(
      assigned,
      [
        channel("UC-a", "Alpha"),
        { ...channel("UC-new", "New Channel"), handle: "@new" }
      ],
      20000
    );
    expect(synced.channels["handle:new"]).toBeUndefined();
    expect(getChannelCategoryIds(synced, "UC-new")).toEqual(["cat-dev"]);
    expect(synced.channels["UC-new"]?.subscribedAt).toBe(12345);
  });

  it("keeps existing metadata and ignores placeholder names from the page", () => {
    const pageChannel: Channel = {
      id: "UC-a",
      name: "  ",
      url: "https://www.youtube.com/@UC-a"
    };
    const state = upsertChannelToCategory(buildState(), pageChannel, "cat-dev", 99);
    expect(state.channels["UC-a"]?.name).toBe("Alpha");
    expect(state.channels["UC-a"]?.handle).toBe("@UC-a");
  });
});

describe("importChannelsToCategories", () => {
  const makeId = (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `cat-import-${counter}`;
    };
  })();

  const item = (categoryName: string, handle: string, name = handle) => ({
    categoryName,
    channel: {
      id: `handle:${handle.toLocaleLowerCase()}`,
      name,
      handle: `@${handle}`,
      url: `https://www.youtube.com/@${handle}`
    }
  });

  it("creates missing categories and files channels into them", () => {
    const outcome = importChannelsToCategories(createEmptyState(), [item("编程", "tim"), item("编程", "fireship")], makeId, 5);
    expect(outcome.importedCount).toBe(2);
    expect(outcome.createdCategories).toEqual(["编程"]);
    const categoryId = outcome.state.categoryOrder[0];
    expect(outcome.state.categories[categoryId]?.channelIds).toHaveLength(2);
  });

  it("reuses an existing category by name instead of duplicating it", () => {
    const withCategory = addCategory(createEmptyState(), { id: "cat-dev", name: "编程", color: "#111", icon: "code" });
    const outcome = importChannelsToCategories(withCategory, [item("编程", "tim")], makeId, 5);
    expect(outcome.createdCategories).toEqual([]);
    expect(outcome.state.categories["cat-dev"]?.channelIds).toEqual(["handle:tim"]);
  });

  it("routes 未分类 rows into the implicit uncategorized bucket", () => {
    const outcome = importChannelsToCategories(createEmptyState(), [item("未分类", "solo")], makeId, 5);
    expect(outcome.createdCategories).toEqual([]);
    expect(outcome.state.memberships["handle:solo"]).toBeUndefined();
    expect(uncategorizedIds(outcome.state)).toEqual(["handle:solo"]);
  });

  it("is idempotent: the same channel in several rows joins several categories", () => {
    let counter = 0;
    const freshId = () => `cat-import-${++counter}`;
    const outcome = importChannelsToCategories(
      createEmptyState(),
      [item("编程", "tim"), item("AI", "tim")],
      freshId,
      5
    );
    expect(outcome.importedCount).toBe(2);
    expect(Object.keys(outcome.state.channels)).toEqual(["handle:tim"]);
    expect(outcome.state.categoryOrder).toEqual(["cat-import-1", "cat-import-2"]);
    expect(getChannelCategoryIds(outcome.state, "handle:tim")).toEqual(["cat-import-1", "cat-import-2"]);
  });

  it("keeps an imported channel's existing memberships instead of overwriting them", () => {
    const base = mergeSubscriptions(createEmptyState(), [channel("UC-x", "Existing")], 10);
    const withCategory = addCategory(base, { id: "cat-keep", name: "保留", color: "#111", icon: "idea" });
    const seeded = addChannelsToCategory(withCategory, ["UC-x"], "cat-keep");

    const outcome = importChannelsToCategories(
      seeded,
      [{ categoryName: "新分类", channel: { id: "handle:uc-x", name: "Existing", handle: "@UC-x", url: "https://www.youtube.com/@UC-x" } }],
      () => "cat-import-fresh",
      5
    );
    expect(Object.keys(outcome.state.channels)).toEqual(["UC-x"]);
    expect(getChannelCategoryIds(outcome.state, "UC-x")).toEqual(["cat-keep", "cat-import-fresh"]);
  });
});

describe("toggleChannelPin", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    return moveChannels(state, ["UC-a", "UC-b", "UC-c"], "cat-a");
  };

  it("pins a member to the end of the pinned block and unpins it again", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-b");
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-b"]);

    state = toggleChannelPin(state, "cat-a", "UC-a");
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-b", "UC-a"]);

    state = toggleChannelPin(state, "cat-a", "UC-b");
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-a"]);
  });

  it("keeps the sidebar join order untouched while pinning", () => {
    const before = getChannelsForCategory(setup(), "cat-a").map((item) => item.id);
    const state = toggleChannelPin(setup(), "cat-a", "UC-c");
    expect(getChannelsForCategory(state, "cat-a").map((item) => item.id)).toEqual(before);
  });

  it("ignores pins for non-members, unknown categories, and the system category", () => {
    const base = setup();
    expect(toggleChannelPin(base, "cat-a", "UC-x")).toBe(base);
    expect(toggleChannelPin(base, "cat-missing", "UC-a")).toBe(base);
    expect(toggleChannelPin(base, UNCATEGORIZED_ID, "UC-a")).toBe(base);
  });
});

describe("moveChannelInCategory", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    return moveChannels(state, ["UC-a", "UC-b", "UC-c"], "cat-a");
  };

  it("reorders the normal section and stores the manual order", () => {
    const state = moveChannelInCategory(setup(), "cat-a", "UC-c", "normal", 0);
    expect(state.categories["cat-a"]?.manualChannelIds).toEqual(["UC-c", "UC-a", "UC-b"]);
    // Join order (sidebar) stays untouched.
    expect(state.categories["cat-a"]?.channelIds).toEqual(["UC-a", "UC-b", "UC-c"]);
  });

  it("reorders inside the pinned block without touching the normal section", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-a");
    state = toggleChannelPin(state, "cat-a", "UC-b");
    state = moveChannelInCategory(state, "cat-a", "UC-b", "pinned", 0);
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-b", "UC-a"]);
    expect(state.categories["cat-a"]?.manualChannelIds).toBeUndefined();
  });

  it("clamps out-of-range indices and refuses cross-zone moves", () => {
    const state = moveChannelInCategory(setup(), "cat-a", "UC-a", "normal", 99);
    expect(state.categories["cat-a"]?.manualChannelIds).toEqual(["UC-b", "UC-c", "UC-a"]);

    const pinned = toggleChannelPin(setup(), "cat-a", "UC-a");
    expect(moveChannelInCategory(pinned, "cat-a", "UC-a", "normal", 0)).toBe(pinned);
  });

  it("no-ops for non-members and unknown channels", () => {
    const base = setup();
    expect(moveChannelInCategory(base, "cat-a", "UC-x", "normal", 0)).toBe(base);
  });
});

describe("getCategoryChannelView", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    return moveChannels(state, ["UC-a", "UC-b", "UC-c"], "cat-a");
  };

  it("splits pinned (pin order) from the rest (manual order, join-order fallback)", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-c");
    state = moveChannelInCategory(state, "cat-a", "UC-b", "normal", 0);
    const view = getCategoryChannelView(state, "cat-a");
    expect(view.pinned.map((item) => item.id)).toEqual(["UC-c"]);
    expect(view.rest.map((item) => item.id)).toEqual(["UC-b", "UC-a"]);
  });

  it("drops overlay ids that are no longer members (read-time repair)", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-c");
    state = moveChannelInCategory(state, "cat-a", "UC-b", "normal", 0);
    state = removeChannelFromCategory(state, "UC-b", "cat-a");
    const view = getCategoryChannelView(state, "cat-a");
    expect(view.pinned.map((item) => item.id)).toEqual(["UC-c"]);
    expect(view.rest.map((item) => item.id)).toEqual(["UC-a"]);
  });

  it("returns empty sections for the system category", () => {
    const view = getCategoryChannelView(setup(), UNCATEGORIZED_ID);
    expect(view.pinned).toEqual([]);
    expect(view.rest).toEqual([]);
  });
});

describe("pin/manual order lifecycle", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    state = addCategory(state, { id: "cat-b", name: "B", color: "#222", icon: "default" });
    return moveChannels(state, ["UC-a", "UC-b", "UC-c"], "cat-a");
  };

  it("clears pins and manual order when the membership is removed or replaced", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-a");
    state = moveChannelInCategory(state, "cat-a", "UC-b", "normal", 0);
    state = removeChannelFromCategory(state, "UC-a", "cat-a");
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual([]);
    expect(state.categories["cat-a"]?.manualChannelIds).toEqual(["UC-b", "UC-c"]);

    state = moveChannels(state, ["UC-b"], "cat-b");
    expect(state.categories["cat-a"]?.manualChannelIds).toEqual(["UC-c"]);
    expect(state.memberships["UC-b"]).toEqual(["cat-b"]);
  });

  it("prunes unsubscribed channels from the overlays on sync but keeps pins for returning ones", () => {
    let state = toggleChannelPin(setup(), "cat-a", "UC-a");
    state = moveChannelInCategory(state, "cat-a", "UC-b", "normal", 0);

    const synced = mergeSubscriptions(state, [channel("UC-a"), channel("UC-c")], 2);
    expect(synced.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-a"]);
    expect(synced.categories["cat-a"]?.manualChannelIds).toEqual(["UC-c"]);
    expect(synced.categories["cat-a"]?.channelIds).toEqual(["UC-a", "UC-c"]);
  });

  it("keeps pins across handle-id remap during sync", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    // A quick-add capture stored the channel under a fallback handle id.
    state = upsertChannelToCategory(
      state,
      { ...channel("handle:alpha", "Alpha"), id: "handle:alpha", handle: "@alpha" },
      "cat-a",
      6
    );
    state = toggleChannelPin(state, "cat-a", "handle:alpha");
    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual(["handle:alpha"]);

    const synced = mergeSubscriptions(state, [{ ...channel("UC-alpha", "Alpha"), handle: "@alpha" }], 10);
    expect(synced.memberships["UC-alpha"]).toEqual(["cat-a"]);
    expect(synced.categories["cat-a"]?.pinnedChannelIds).toEqual(["UC-alpha"]);
  });
});

describe("manager ui preferences", () => {
  it("defaults new states to manual sort mode", () => {
    expect(createEmptyState().ui.managerSortMode).toBe("manual");
  });

  it("stores the sort mode and merges layout patches", () => {
    let state = setManagerSortMode(createEmptyState(), "name-asc");
    expect(state.ui.managerSortMode).toBe("name-asc");

    state = setManagerLayout(state, { leftPaneWidth: 320 });
    expect(state.ui.managerLayout).toEqual({ leftPaneWidth: 320 });

    state = setManagerLayout(state, { drawerWidth: 720, drawerHeight: 600 });
    expect(state.ui.managerLayout).toEqual({ leftPaneWidth: 320, drawerWidth: 720, drawerHeight: 600 });
  });
});

describe("setThemePreference", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    return moveChannels(state, ["UC-a"], "cat-a");
  };

  it("stores the theme and never mutates the input state", () => {
    const state = setup();
    const themed = setThemePreference(state, "dark");

    expect(themed.ui.theme).toBe("dark");
    expect(state.ui.theme).toBeUndefined();
  });

  it("lets a later preference override an earlier one", () => {
    let state = setThemePreference(setup(), "light");
    expect(state.ui.theme).toBe("light");

    state = setThemePreference(state, "auto");
    expect(state.ui.theme).toBe("auto");
  });

  it("changes only ui.theme and keeps memberships, categories, and the rest of ui intact", () => {
    const state = setup();
    const themed = setThemePreference(state, "dark");

    expect(themed.channels).toEqual(state.channels);
    expect(themed.categories).toEqual(state.categories);
    expect(themed.categoryOrder).toEqual(state.categoryOrder);
    expect(themed.memberships).toEqual(state.memberships);
    expect(themed.importedLegacyData).toBe(state.importedLegacyData);
    expect(themed.lastSyncedAt).toBe(state.lastSyncedAt);
    expect(themed.ui.sidebarMode).toBe(state.ui.sidebarMode);
    expect(themed.ui.expandedCategoryIds).toEqual(state.ui.expandedCategoryIds);
    expect(themed.ui.managerSortMode).toBe(state.ui.managerSortMode);
    expect(themed.ui.managerLayout).toEqual(state.ui.managerLayout);
  });
});

describe("setChannelCategories", () => {
  const setup = () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b")], 1);
    state = addCategory(state, { id: "cat-a", name: "A", color: "#111", icon: "default" });
    state = addCategory(state, { id: "cat-b", name: "B", color: "#222", icon: "default" });
    return state;
  };

  it("replaces each channel's memberships with the requested set", () => {
    let state = setup();
    state = addChannelsToCategory(state, ["UC-a"], "cat-a");
    state = addChannelsToCategory(state, ["UC-b"], "cat-b");
    state = setChannelCategories(state, ["UC-a", "UC-b"], ["cat-b"]);

    expect(getChannelCategoryIds(state, "UC-a")).toEqual(["cat-b"]);
    expect(getChannelCategoryIds(state, "UC-b")).toEqual(["cat-b"]);
    expect(state.categories["cat-a"]?.channelIds).toEqual([]);
    // UC-b was already in cat-b and keeps its position; UC-a joins at the end.
    expect(state.categories["cat-b"]?.channelIds).toEqual(["UC-b", "UC-a"]);
  });

  it("treats an empty set as removing every membership", () => {
    let state = setup();
    state = addChannelsToCategory(state, ["UC-a"], "cat-a");
    state = setChannelCategories(state, ["UC-a"], []);
    expect(state.memberships["UC-a"]).toBeUndefined();
    // UC-b never had a membership and stays uncategorized alongside UC-a.
    expect(uncategorizedIds(state)).toEqual(["UC-a", "UC-b"]);
  });

  it("keeps order overlays in sync when leaving a category", () => {
    let state = setup();
    state = addChannelsToCategory(state, ["UC-a"], "cat-a");
    state = toggleChannelPin(state, "cat-a", "UC-a");
    state = setChannelCategories(state, ["UC-a"], ["cat-b"]);

    expect(state.categories["cat-a"]?.pinnedChannelIds).toEqual([]);
    expect(state.categories["cat-a"]?.channelIds).toEqual([]);
    expect(state.categories["cat-b"]?.channelIds).toEqual(["UC-a"]);
  });

  it("ignores duplicates, uncategorized entries, and unknown channels", () => {
    let state = setup();
    state = addChannelsToCategory(state, ["UC-a"], "cat-a");
    const next = setChannelCategories(state, ["UC-a", "UC-x"], [UNCATEGORIZED_ID, "cat-a", "cat-a"]);
    expect(getChannelCategoryIds(next, "UC-a")).toEqual(["cat-a"]);
  });

  it("throws for unknown category ids", () => {
    const state = setup();
    expect(() => setChannelCategories(state, ["UC-a"], ["cat-missing"])).toThrow(/Category not found/);
  });
});
