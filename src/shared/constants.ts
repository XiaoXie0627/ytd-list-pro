import type { CategoryIconId } from "./types";

export const STATE_SCHEMA_VERSION = 2;

export const UNCATEGORIZED_ID = "uncategorized";

export const UNCATEGORIZED_CATEGORY = {
  id: UNCATEGORIZED_ID,
  name: "未分类",
  color: "#838ba7",
  icon: "default" as CategoryIconId,
  channelIds: [] as string[],
  isSystem: true
};

// Catppuccin Frappé palette; the four lightest entries (yellow/green/
// lavender/pink) are deepened so small swatches stay legible on YouTube's
// light theme as well.
export const PRESET_COLORS = [
  "#e78284",
  "#ef9f76",
  "#cfa760",
  "#8fbd6d",
  "#81c8be",
  "#99d1db",
  "#8caaee",
  "#a3a6e8",
  "#ca9ee6",
  "#e59cd0"
];

export const CATEGORY_ICONS: Array<{ id: CategoryIconId; label: string }> = [
  { id: "default", label: "默认" },
  { id: "open", label: "打开" },
  { id: "video", label: "视频" },
  { id: "channel", label: "频道" },
  { id: "ai", label: "AI" },
  { id: "code", label: "代码" },
  { id: "learning", label: "学习" },
  { id: "music", label: "音乐" },
  { id: "idea", label: "灵感" },
  { id: "interview", label: "访谈" }
];

export const RECOVERED_CATEGORY_APPEARANCE: Record<string, { color: string; icon: CategoryIconId }> = {
  ai: { color: "#ca9ee6", icon: "ai" },
  ytb: { color: "#e78284", icon: "channel" },
  general: { color: "#99d1db", icon: "idea" },
  aitalk: { color: "#81c8be", icon: "interview" },
  edting: { color: "#ef9f76", icon: "video" }
};
