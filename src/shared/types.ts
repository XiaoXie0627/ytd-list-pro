export type CategoryIconId =
  | "default"
  | "open"
  | "video"
  | "channel"
  | "ai"
  | "code"
  | "learning"
  | "music"
  | "idea"
  | "interview";

export interface Channel {
  id: string;
  name: string;
  avatarUrl?: string;
  handle?: string;
  url: string;
  subscribedAt?: number;
  discoveredAt?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
  // Display order of the channels inside this category. Membership itself is
  // owned by `ExtensionState.memberships`; this array must never contain a
  // non-member and must never omit one.
  channelIds: string[];
  // Manager-only order overlays (schemaVersion 2, optional): `pinnedChannelIds`
  // orders the pinned block, `manualChannelIds` orders the normal section.
  // Both must stay subsets of the membership set; the sidebar keeps reading
  // `channelIds` (join order) and ignores them.
  pinnedChannelIds?: string[];
  manualChannelIds?: string[];
  isSystem?: boolean;
}

export type ChannelOrderZone = "pinned" | "normal";

export interface ManagerLayout {
  leftPaneWidth?: number;
  drawerWidth?: number;
  drawerHeight?: number;
}

export type SidebarMode = "original" | "categorized";

export type ChannelSortMode = "added-desc" | "added-asc" | "name-asc" | "name-desc" | "manual";

// "auto" follows YouTube's own light/dark (html[dark]); explicit values force
// a theme. Absent from stored state = "auto".
export type ThemePreference = "auto" | "light" | "dark";

export interface ExtensionState {
  schemaVersion: number;
  channels: Record<string, Channel>;
  categories: Record<string, Category>;
  categoryOrder: string[];
  // The single source of truth for category membership: channelId -> category
  // ids (non-empty entries only). A channel with no entry is uncategorized.
  memberships: Record<string, string[]>;
  ui: {
    sidebarMode: SidebarMode;
    expandedCategoryIds: string[];
    // Remembered manager sort mode; absent states fall back to "manual".
    managerSortMode?: ChannelSortMode;
    managerLayout?: ManagerLayout;
    theme?: ThemePreference;
  };
  importedLegacyData: boolean;
  lastSyncedAt?: number;
}

export interface CategoryInput {
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
}

export interface LegacyImportData {
  channels: Channel[];
  categories: Array<CategoryInput & { channelIds: string[] }>;
  // Pre-membership input shape: channels listed here simply end up with zero
  // memberships (i.e. uncategorized) after import.
  uncategorizedChannelIds: string[];
}
