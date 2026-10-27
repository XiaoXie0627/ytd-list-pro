import {
  PRESET_COLORS,
  RECOVERED_CATEGORY_APPEARANCE,
  STATE_SCHEMA_VERSION,
  UNCATEGORIZED_CATEGORY,
  UNCATEGORIZED_ID
} from "./constants";
import { normalizeAvatarUrl } from "./avatar";
import type {
  Category,
  CategoryInput,
  Channel,
  ChannelOrderZone,
  ExtensionState,
  LegacyImportData,
  ManagerLayout,
  ThemePreference
} from "./types";

const unique = (items: string[]): string[] => Array.from(new Set(items));

const cloneState = (state: ExtensionState): ExtensionState => ({
  ...state,
  channels: { ...state.channels },
  categories: Object.fromEntries(
    Object.entries(state.categories).map(([id, category]) => [
      id,
      {
        ...category,
        channelIds: [...category.channelIds],
        ...(category.pinnedChannelIds ? { pinnedChannelIds: [...category.pinnedChannelIds] } : {}),
        ...(category.manualChannelIds ? { manualChannelIds: [...category.manualChannelIds] } : {})
      }
    ])
  ),
  categoryOrder: [...state.categoryOrder],
  memberships: Object.fromEntries(
    Object.entries(state.memberships).map(([id, categoryIds]) => [id, [...categoryIds]])
  ),
  ui: {
    sidebarMode: state.ui.sidebarMode,
    expandedCategoryIds: [...state.ui.expandedCategoryIds],
    ...(state.ui.managerSortMode === undefined ? {} : { managerSortMode: state.ui.managerSortMode }),
    ...(state.ui.managerLayout === undefined ? {} : { managerLayout: { ...state.ui.managerLayout } }),
    ...(state.ui.theme === undefined ? {} : { theme: state.ui.theme })
  }
});

const normalizeName = (name: string) => name.trim() || "未命名频道";

const normalizeTimestamp = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const normalizeChannel = (channel: Channel): Channel => {
  const subscribedAt = normalizeTimestamp(channel.subscribedAt);
  const discoveredAt = normalizeTimestamp(channel.discoveredAt);
  return {
    id: channel.id.trim(),
    name: normalizeName(channel.name),
    handle: channel.handle?.trim() || undefined,
    avatarUrl: normalizeAvatarUrl(channel.avatarUrl),
    url: channel.url.trim(),
    ...(subscribedAt === undefined ? {} : { subscribedAt }),
    ...(discoveredAt === undefined ? {} : { discoveredAt })
  };
};

const isPlaceholderRecoveryChannel = (channel: Channel): boolean =>
  channel.id.startsWith("UClegacy") ||
  channel.name.startsWith("Recovered Channel") ||
  channel.handle?.startsWith("@recovered") === true;

const hasPlaceholderRecoveryData = (state: ExtensionState): boolean =>
  Object.values(state.channels).some(isPlaceholderRecoveryChannel);

const upgradeRecoveredCategoryAppearance = (currentState: ExtensionState): ExtensionState => {
  let changed = false;
  const state = cloneState(currentState);

  for (const category of Object.values(state.categories)) {
    const appearance = RECOVERED_CATEGORY_APPEARANCE[category.name.trim().toLocaleLowerCase()];
    if (!appearance) {
      continue;
    }
    if (category.icon === "open") {
      category.icon = appearance.icon;
      changed = true;
    }
    if (category.color === "" || category.color === "#8b5cf6" || category.color === "#22c55e") {
      category.color = appearance.color;
      changed = true;
    }
  }

  return changed ? state : currentState;
};

// ---------------------------------------------------------------------------
// Membership primitives. `memberships` is the single source of truth; each
// category's `channelIds` is derived display order kept in lockstep here.
// ---------------------------------------------------------------------------

const appendToOrder = (state: ExtensionState, categoryId: string, channelId: string): void => {
  const category = state.categories[categoryId];
  if (!category || category.channelIds.includes(channelId)) {
    return;
  }
  category.channelIds.push(channelId);
};

const removeFromOrder = (state: ExtensionState, categoryId: string, channelId: string): void => {
  const category = state.categories[categoryId];
  if (!category) {
    return;
  }
  category.channelIds = category.channelIds.filter((id) => id !== channelId);
  if (category.pinnedChannelIds) {
    category.pinnedChannelIds = category.pinnedChannelIds.filter((id) => id !== channelId);
  }
  if (category.manualChannelIds) {
    category.manualChannelIds = category.manualChannelIds.filter((id) => id !== channelId);
  }
};

const isRealCategory = (state: ExtensionState, categoryId: string): boolean =>
  categoryId !== UNCATEGORIZED_ID && Boolean(state.categories[categoryId]);

const addMembership = (state: ExtensionState, channelId: string, categoryId: string): void => {
  if (!isRealCategory(state, categoryId)) {
    return;
  }
  const current = state.memberships[channelId] ?? [];
  if (current.includes(categoryId)) {
    return;
  }
  state.memberships[channelId] = [...current, categoryId];
  appendToOrder(state, categoryId, channelId);
};

const removeMembership = (state: ExtensionState, channelId: string, categoryId: string): void => {
  const current = state.memberships[channelId];
  if (!current?.includes(categoryId)) {
    return;
  }
  const next = current.filter((id) => id !== categoryId);
  if (next.length === 0) {
    delete state.memberships[channelId];
  } else {
    state.memberships[channelId] = next;
  }
  removeFromOrder(state, categoryId, channelId);
};

const clearMemberships = (state: ExtensionState, channelId: string): void => {
  const current = state.memberships[channelId];
  if (!current) {
    return;
  }
  for (const categoryId of current) {
    removeFromOrder(state, categoryId, channelId);
  }
  delete state.memberships[channelId];
};

export function createEmptyState(): ExtensionState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    channels: {},
    categories: {
      [UNCATEGORIZED_ID]: { ...UNCATEGORIZED_CATEGORY, channelIds: [] }
    },
    categoryOrder: [],
    memberships: {},
    ui: {
      sidebarMode: "categorized",
      expandedCategoryIds: [UNCATEGORIZED_ID],
      managerSortMode: "manual"
    },
    importedLegacyData: false
  };
}

export function mergeSubscriptions(
  currentState: ExtensionState,
  incomingChannels: Channel[],
  syncedAt = Date.now()
): ExtensionState {
  const state = cloneState(currentState);
  const normalizedChannels = incomingChannels
    .map(normalizeChannel)
    .filter((channel) => channel.id.length > 0);
  const channelsWithDiscoveryTimes = normalizedChannels.map((channel) => {
    const existing = findChannelByIdOrHandle(currentState, channel.id, channel.handle);
    const subscribedAt = channel.subscribedAt ?? existing?.subscribedAt;
    return {
      ...channel,
      ...(subscribedAt === undefined ? {} : { subscribedAt }),
      discoveredAt: channel.discoveredAt ?? existing?.discoveredAt ?? (existing ? 0 : syncedAt)
    };
  });
  const incomingById = new Map(channelsWithDiscoveryTimes.map((channel) => [channel.id, channel]));
  const incomingIds = new Set(incomingById.keys());

  // Channels assigned from a page context may be stored under a fallback
  // `handle:xxx` id; once a full sync provides the canonical channel id,
  // migrate memberships and ordering so the categorization survives.
  const incomingIdByHandle = new Map(
    channelsWithDiscoveryTimes
      .filter((channel) => channel.handle)
      .map((channel) => [channel.handle!.toLocaleLowerCase(), channel.id])
  );
  const remappedIds = new Map<string, string>();
  for (const [oldId, oldChannel] of Object.entries(currentState.channels)) {
    if (incomingIds.has(oldId)) {
      continue;
    }
    const handleKey = oldChannel.handle?.toLocaleLowerCase();
    const newId = handleKey ? incomingIdByHandle.get(handleKey) : undefined;
    if (newId && newId !== oldId) {
      remappedIds.set(oldId, newId);
    }
  }
  for (const [oldId, newId] of remappedIds) {
    const oldCategoryIds = state.memberships[oldId];
    if (oldCategoryIds) {
      delete state.memberships[oldId];
      for (const categoryId of oldCategoryIds) {
        addMembership(state, newId, categoryId);
      }
    } else {
      removeFromOrder(state, UNCATEGORIZED_ID, oldId);
    }
    // Keep manager pin/manual order across the id remap.
    for (const category of Object.values(state.categories)) {
      if (category.pinnedChannelIds) {
        category.pinnedChannelIds = category.pinnedChannelIds.map((id) => (id === oldId ? newId : id));
      }
      if (category.manualChannelIds) {
        category.manualChannelIds = category.manualChannelIds.map((id) => (id === oldId ? newId : id));
      }
    }
  }

  state.channels = Object.fromEntries(incomingById);

  // A sync replaces the channel set: drop memberships and ordering of
  // channels no longer subscribed. Category assignment is preserved for
  // returning channels; brand-new channels stay uncategorized implicitly.
  const validCategoryIds = new Set(Object.keys(state.categories));
  const prunedMemberships: Record<string, string[]> = {};
  for (const [channelId, categoryIds] of Object.entries(state.memberships)) {
    if (!incomingIds.has(channelId)) {
      continue;
    }
    const valid = unique(categoryIds).filter((id) => validCategoryIds.has(id));
    if (valid.length > 0) {
      prunedMemberships[channelId] = valid;
    }
  }
  state.memberships = prunedMemberships;

  for (const category of Object.values(state.categories)) {
    const memberIds = new Set(
      Object.entries(state.memberships)
        .filter(([, categoryIds]) => categoryIds.includes(category.id))
        .map(([channelId]) => channelId)
    );
    const kept = category.channelIds.filter((id) => memberIds.has(id));
    for (const channelId of memberIds) {
      if (!kept.includes(channelId)) {
        kept.push(channelId);
      }
    }
    category.channelIds = kept;
    // Manager order overlays may reference unsubscribed channels; prune them.
    if (category.pinnedChannelIds) {
      category.pinnedChannelIds = unique(category.pinnedChannelIds.filter((id) => memberIds.has(id)));
    }
    if (category.manualChannelIds) {
      category.manualChannelIds = unique(category.manualChannelIds.filter((id) => memberIds.has(id)));
    }
  }

  state.lastSyncedAt = syncedAt;
  return state;
}

export function addCategory(currentState: ExtensionState, input: CategoryInput): ExtensionState {
  if (input.id === UNCATEGORIZED_ID) {
    throw new Error("Cannot replace system category");
  }
  const state = cloneState(currentState);
  const category: Category = {
    ...input,
    name: input.name.trim() || "新分类",
    channelIds: []
  };
  state.categories[category.id] = category;
  state.categoryOrder = unique([...state.categoryOrder.filter((id) => id !== category.id), category.id]);
  return state;
}

/**
 * Default color for a brand-new category: the first preset no category uses
 * yet, cycling through the palette again only once all ten are taken.
 */
export function nextCategoryColor(state: ExtensionState): string {
  const used = new Set(Object.values(state.categories).map((category) => category.color));
  const free = PRESET_COLORS.find((color) => !used.has(color));
  if (free) {
    return free;
  }
  return PRESET_COLORS[state.categoryOrder.length % PRESET_COLORS.length];
}

/**
 * Repaints every user category in display order with the preset palette.
 * System categories keep their dedicated appearance.
 */
export function refreshDefaultColors(currentState: ExtensionState): ExtensionState {
  const state = cloneState(currentState);
  let index = 0;
  for (const categoryId of state.categoryOrder) {
    const category = state.categories[categoryId];
    if (categoryId === UNCATEGORIZED_ID || !category) {
      continue;
    }
    category.color = PRESET_COLORS[index % PRESET_COLORS.length];
    index += 1;
  }
  return state;
}

export function renameCategory(currentState: ExtensionState, categoryId: string, name: string): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot rename system category");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  category.name = name;
  return state;
}

export function deleteCategory(currentState: ExtensionState, categoryId: string): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot delete system category");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    return state;
  }
  // Members simply lose one membership; channels that end up with zero
  // memberships become uncategorized implicitly.
  for (const channelId of Object.keys(state.memberships)) {
    removeMembership(state, channelId, categoryId);
  }
  delete state.categories[categoryId];
  state.categoryOrder = state.categoryOrder.filter((id) => id !== categoryId);
  state.ui.expandedCategoryIds = state.ui.expandedCategoryIds.filter((id) => id !== categoryId);
  return state;
}

export function reorderCategories(currentState: ExtensionState, orderedCategoryIds: string[]): ExtensionState {
  const state = cloneState(currentState);
  const userCategoryIds = new Set(state.categoryOrder);
  const requested = orderedCategoryIds.filter((id) => userCategoryIds.has(id));
  const missing = state.categoryOrder.filter((id) => !requested.includes(id));
  state.categoryOrder = [...requested, ...missing];
  return state;
}

/** Move semantics: replace all memberships with the single target category. */
export function moveChannels(
  currentState: ExtensionState,
  channelIds: string[],
  targetCategoryId: string
): ExtensionState {
  const state = cloneState(currentState);
  const knownChannelIds = unique(channelIds).filter((id) => state.channels[id]);
  if (knownChannelIds.length === 0) {
    return state;
  }
  if (!isRealCategory(state, targetCategoryId) && targetCategoryId !== UNCATEGORIZED_ID) {
    throw new Error(`Category not found: ${targetCategoryId}`);
  }

  for (const channelId of knownChannelIds) {
    clearMemberships(state, channelId);
    if (targetCategoryId !== UNCATEGORIZED_ID) {
      addMembership(state, channelId, targetCategoryId);
    }
  }
  return state;
}

/** Add semantics: ensure membership in the target, keep existing ones. */
export function addChannelsToCategory(
  currentState: ExtensionState,
  channelIds: string[],
  targetCategoryId: string
): ExtensionState {
  const state = cloneState(currentState);
  const knownChannelIds = unique(channelIds).filter((id) => state.channels[id]);
  if (knownChannelIds.length === 0) {
    return state;
  }
  if (!isRealCategory(state, targetCategoryId)) {
    throw new Error(`Category not found: ${targetCategoryId}`);
  }
  for (const channelId of knownChannelIds) {
    addMembership(state, channelId, targetCategoryId);
  }
  return state;
}

/**
 * Picker「移动」semantics: every listed channel's memberships become exactly
 * `categoryIds` (empty = uncategorized). Unknown category ids throw;
 * duplicates and UNCATEGORIZED_ID entries are ignored. All edits go through
 * the membership primitives so each category's order overlays stay in sync.
 */
export function setChannelCategories(
  currentState: ExtensionState,
  channelIds: string[],
  categoryIds: string[]
): ExtensionState {
  const state = cloneState(currentState);
  const knownChannelIds = unique(channelIds).filter((id) => state.channels[id]);
  if (knownChannelIds.length === 0) {
    return state;
  }
  const requested = unique(categoryIds).filter((id) => id !== UNCATEGORIZED_ID);
  for (const categoryId of requested) {
    if (!isRealCategory(state, categoryId)) {
      throw new Error(`Category not found: ${categoryId}`);
    }
  }
  for (const channelId of knownChannelIds) {
    for (const categoryId of state.memberships[channelId] ?? []) {
      if (!requested.includes(categoryId)) {
        removeMembership(state, channelId, categoryId);
      }
    }
    for (const categoryId of requested) {
      addMembership(state, channelId, categoryId);
    }
  }
  return state;
}

/** Remove a single membership; a channel left with none becomes uncategorized. */
export function removeChannelFromCategory(
  currentState: ExtensionState,
  channelId: string,
  categoryId: string
): ExtensionState {
  const state = cloneState(currentState);
  if (!isRealCategory(state, categoryId)) {
    return state;
  }
  removeMembership(state, channelId, categoryId);
  return state;
}

/**
 * Pin semantics (manager only, per category): toggling membership in the
 * pinned block. Pinning appends to the end of the pinned block; unpinning
 * lets the channel fall back to its manual/join position.
 */
export function toggleChannelPin(
  currentState: ExtensionState,
  categoryId: string,
  channelId: string
): ExtensionState {
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!isRealCategory(state, categoryId) || !category) {
    return currentState;
  }
  if (!state.memberships[channelId]?.includes(categoryId)) {
    return currentState;
  }
  const pinned = category.pinnedChannelIds ?? [];
  category.pinnedChannelIds = pinned.includes(channelId)
    ? pinned.filter((id) => id !== channelId)
    : [...pinned, channelId];
  return state;
}

/**
 * Manual reorder inside one category. `zone` picks the block ("pinned" or
 * "normal") and `index` is the target position within that block; channels
 * never cross zones by dragging — pinning is button-only. `channelIds` (the
 * sidebar's join order) is deliberately left untouched.
 */
export function moveChannelInCategory(
  currentState: ExtensionState,
  categoryId: string,
  channelId: string,
  zone: ChannelOrderZone,
  index: number
): ExtensionState {
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!isRealCategory(state, categoryId) || !category) {
    return currentState;
  }
  if (!state.memberships[channelId]?.includes(categoryId)) {
    return currentState;
  }
  if (zone === "pinned") {
    const pinned = unique(category.pinnedChannelIds ?? []);
    const from = pinned.indexOf(channelId);
    if (from < 0) {
      return currentState;
    }
    pinned.splice(from, 1);
    pinned.splice(Math.min(Math.max(index, 0), pinned.length), 0, channelId);
    category.pinnedChannelIds = pinned;
    return state;
  }
  const pinnedSet = new Set(category.pinnedChannelIds ?? []);
  if (pinnedSet.has(channelId)) {
    return currentState;
  }
  const source = unique(category.manualChannelIds ?? category.channelIds.filter((id) => !pinnedSet.has(id)));
  const from = source.indexOf(channelId);
  if (from < 0) {
    return currentState;
  }
  source.splice(from, 1);
  source.splice(Math.min(Math.max(index, 0), source.length), 0, channelId);
  category.manualChannelIds = source;
  return state;
}

export interface CategoryChannelView {
  pinned: Channel[];
  rest: Channel[];
}

/**
 * Manager view of a real category: the pinned block (pin order) plus the
 * normal section (manual order, falling back to join order). Read-time
 * repair drops overlay ids that are no longer members.
 */
export function getCategoryChannelView(state: ExtensionState, categoryId: string): CategoryChannelView {
  const category = state.categories[categoryId];
  if (!category || categoryId === UNCATEGORIZED_ID) {
    return { pinned: [], rest: [] };
  }
  const memberIds = new Set(getChannelsForCategory(state, categoryId).map((channel) => channel.id));
  const pinnedIds = unique((category.pinnedChannelIds ?? []).filter((id) => memberIds.has(id)));
  const pinnedSet = new Set(pinnedIds);
  const restIds = unique(
    (category.manualChannelIds ?? category.channelIds).filter((id) => memberIds.has(id) && !pinnedSet.has(id))
  );
  for (const id of memberIds) {
    if (!pinnedSet.has(id) && !restIds.includes(id)) {
      restIds.push(id);
    }
  }
  const toChannels = (ids: string[]): Channel[] =>
    ids.map((id) => state.channels[id]).filter(Boolean) as Channel[];
  return { pinned: toChannels(pinnedIds), rest: toChannels(restIds) };
}

export function setManagerSortMode(
  currentState: ExtensionState,
  mode: ExtensionState["ui"]["managerSortMode"]
): ExtensionState {
  const state = cloneState(currentState);
  state.ui.managerSortMode = mode;
  return state;
}

export function setManagerLayout(currentState: ExtensionState, layout: Partial<ManagerLayout>): ExtensionState {
  const state = cloneState(currentState);
  state.ui.managerLayout = { ...state.ui.managerLayout, ...layout };
  return state;
}

export function setThemePreference(currentState: ExtensionState, theme: ThemePreference): ExtensionState {
  const state = cloneState(currentState);
  state.ui.theme = theme;
  return state;
}

export function findChannelByIdOrHandle(state: ExtensionState, id: string, handle?: string): Channel | undefined {
  if (state.channels[id]) {
    return state.channels[id];
  }
  const handleKey = handle?.trim().toLocaleLowerCase();
  if (!handleKey) {
    return undefined;
  }
  return Object.values(state.channels).find((channel) => channel.handle?.toLocaleLowerCase() === handleKey);
}

/** All category ids the channel belongs to, ordered like the sidebar. */
export function getChannelCategoryIds(state: ExtensionState, channelId: string): string[] {
  const categoryIds = state.memberships[channelId] ?? [];
  const ordered = state.categoryOrder.filter((id) => categoryIds.includes(id));
  const rest = categoryIds.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

export function getChannelsForCategory(state: ExtensionState, categoryId: string): Channel[] {
  if (categoryId === UNCATEGORIZED_ID) {
    // Implicit bucket: every channel with zero memberships, in sync order.
    return Object.values(state.channels).filter((channel) => !state.memberships[channel.id]);
  }
  const category = state.categories[categoryId];
  if (!category) {
    return [];
  }
  const channels = category.channelIds.map((id) => state.channels[id]).filter(Boolean) as Channel[];
  // Read-time invariant repair: members missing from the order array go last.
  const orderedIds = new Set(category.channelIds);
  for (const [channelId, categoryIds] of Object.entries(state.memberships)) {
    if (categoryIds.includes(categoryId) && !orderedIds.has(channelId)) {
      const channel = state.channels[channelId];
      if (channel) {
        channels.push(channel);
      }
    }
  }
  return channels;
}

export function upsertChannelToCategory(
  currentState: ExtensionState,
  incoming: Channel,
  categoryId: string,
  now = Date.now()
): ExtensionState {
  const normalized = normalizeChannel(incoming);
  if (!normalized.id) {
    return currentState;
  }
  if (categoryId !== UNCATEGORIZED_ID && !currentState.categories[categoryId]) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  const existing = findChannelByIdOrHandle(currentState, normalized.id, normalized.handle);
  const state = cloneState(currentState);
  const channelId = existing?.id ?? normalized.id;
  if (existing) {
    state.channels[channelId] = {
      ...existing,
      name: normalized.name === "未命名频道" ? existing.name : normalized.name,
      handle: existing.handle ?? normalized.handle,
      avatarUrl: existing.avatarUrl ?? normalized.avatarUrl
    };
  } else {
    state.channels[channelId] = {
      ...normalized,
      subscribedAt: normalized.subscribedAt ?? now,
      discoveredAt: normalized.discoveredAt ?? now
    };
  }
  if (categoryId === UNCATEGORIZED_ID) {
    // "Assign to uncategorized" resets memberships entirely (implicit bucket).
    clearMemberships(state, channelId);
  } else {
    addMembership(state, channelId, categoryId);
  }
  return state;
}

export interface CategorizedChannelImport {
  channel: Channel;
  categoryName: string;
}

export interface ImportOutcome {
  state: ExtensionState;
  importedCount: number;
  createdCategories: string[];
}

export function importChannelsToCategories(
  currentState: ExtensionState,
  items: CategorizedChannelImport[],
  makeCategoryId: () => string,
  now = Date.now()
): ImportOutcome {
  let state = cloneState(currentState);
  const createdCategories: string[] = [];
  let importedCount = 0;

  const findCategoryIdByName = (name: string): string | undefined => {
    const key = name.trim().toLocaleLowerCase();
    if (!key || key === UNCATEGORIZED_CATEGORY.name || key === "uncategorized") {
      return UNCATEGORIZED_ID;
    }
    for (const category of Object.values(state.categories)) {
      if (category.name.trim().toLocaleLowerCase() === key) {
        return category.id;
      }
    }
    return undefined;
  };

  // Idempotent: every row *adds* a membership; the same channel may appear in
  // several rows to join several categories. "未分类" rows reset the channel
  // to zero memberships.
  for (const item of items) {
    let categoryId = findCategoryIdByName(item.categoryName);
    if (!categoryId) {
      categoryId = makeCategoryId();
      state = addCategory(state, {
        id: categoryId,
        name: item.categoryName.trim(),
        color: nextCategoryColor(state),
        icon: "default"
      });
      createdCategories.push(item.categoryName.trim());
    }
    state = upsertChannelToCategory(state, item.channel, categoryId, now);
    importedCount += 1;
  }

  return { state, importedCount, createdCategories };
}

const queryTokens = (query: string): string[] => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

const channelMatchesTokens = (channel: Channel, tokens: string[]): boolean => {
  const target = `${channel.name} ${channel.handle ?? ""}`.toLocaleLowerCase();
  return tokens.every((token) => target.includes(token));
};

export function searchChannels(channels: Channel[], query: string): Channel[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return channels;
  }
  return channels.filter((channel) => channelMatchesTokens(channel, tokens));
}

export interface ChannelSearchHit {
  channel: Channel;
  categoryIds: string[];
  categoryNames: string[];
}

/** Cross-category search deduplicated by channel; hits list all memberships. */
export function searchAllChannels(state: ExtensionState, query: string): ChannelSearchHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const hits: ChannelSearchHit[] = [];
  for (const channel of Object.values(state.channels)) {
    if (!channelMatchesTokens(channel, tokens)) {
      continue;
    }
    const categoryIds = getChannelCategoryIds(state, channel.id);
    hits.push({
      channel,
      categoryIds,
      categoryNames: categoryIds
        .map((id) => state.categories[id]?.name)
        .filter((name): name is string => Boolean(name))
    });
  }
  return hits;
}

export function setCategoryAppearance(
  currentState: ExtensionState,
  categoryId: string,
  appearance: Pick<Category, "color" | "icon">
): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot edit system category appearance");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  category.color = appearance.color;
  category.icon = appearance.icon;
  return state;
}

export function setSidebarMode(currentState: ExtensionState, mode: ExtensionState["ui"]["sidebarMode"]): ExtensionState {
  const state = cloneState(currentState);
  state.ui.sidebarMode = mode;
  return state;
}

export function toggleCategoryExpanded(currentState: ExtensionState, categoryId: string): ExtensionState {
  const state = cloneState(currentState);
  const expanded = new Set(state.ui.expandedCategoryIds);
  if (expanded.has(categoryId)) {
    expanded.delete(categoryId);
  } else {
    expanded.add(categoryId);
  }
  state.ui.expandedCategoryIds = Array.from(expanded);
  return state;
}

export function applyLegacyImportIfNeeded(
  currentState: ExtensionState,
  legacyData: LegacyImportData
): ExtensionState {
  const hasPlaceholderData = hasPlaceholderRecoveryData(currentState);
  if (currentState.importedLegacyData && !hasPlaceholderData) {
    return upgradeRecoveredCategoryAppearance(currentState);
  }

  const state = cloneState(currentState);
  if (state.categoryOrder.length > 0 && !hasPlaceholderData) {
    state.importedLegacyData = true;
    return state;
  }

  const channels: Record<string, Channel> = Object.fromEntries(
    legacyData.channels.map((item) => [item.id, normalizeChannel(item)])
  );
  const categories: Record<string, Category> = {
    [UNCATEGORIZED_ID]: { ...UNCATEGORIZED_CATEGORY, channelIds: [] }
  };
  const memberships: Record<string, string[]> = {};

  for (const category of legacyData.categories) {
    const appearance = RECOVERED_CATEGORY_APPEARANCE[category.name.trim().toLocaleLowerCase()];
    const orderedChannelIds = unique(category.channelIds).filter((id) => channels[id]);
    categories[category.id] = {
      id: category.id,
      name: category.name,
      color: appearance?.color ?? category.color,
      icon: appearance?.icon ?? category.icon,
      channelIds: orderedChannelIds
    };
    for (const channelId of orderedChannelIds) {
      memberships[channelId] = [...(memberships[channelId] ?? []), category.id];
    }
  }

  // Legacy "uncategorized" channels simply stay out of `memberships`.
  return {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
    channels,
    categories,
    categoryOrder: legacyData.categories.map((category) => category.id),
    memberships,
    ui: {
      sidebarMode: "categorized",
      expandedCategoryIds: [UNCATEGORIZED_ID, ...legacyData.categories.map((category) => category.id)]
    },
    importedLegacyData: true
  };
}
