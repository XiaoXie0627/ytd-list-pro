import { describe, expect, it } from "vitest";
import { addCategory, createEmptyState, mergeSubscriptions, moveChannels, toggleCategoryExpanded } from "../shared/state";
import { UNCATEGORIZED_ID } from "../shared/constants";
import { buildSidebarSections, renderSidebar } from "./sidebar";

describe("buildSidebarSections", () => {
  it("returns uncategorized first and then ordered user categories with channel counts", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(
      state,
      [
        { id: "UC-a", name: "A", url: "https://www.youtube.com/channel/UC-a" },
        { id: "UC-b", name: "B", url: "https://www.youtube.com/channel/UC-b" }
      ],
      1
    );
    state = addCategory(state, { id: "cat-code", name: "Code", color: "#22c55e", icon: "code" });
    state = moveChannels(state, ["UC-a"], "cat-code");
    state = toggleCategoryExpanded(state, UNCATEGORIZED_ID);

    const sections = buildSidebarSections(state);

    expect(sections.map((section) => [section.id, section.count, section.expanded])).toEqual([
      [UNCATEGORIZED_ID, 1, false],
      ["cat-code", 1, false]
    ]);
    expect(sections[1]?.channels.map((channel) => channel.name)).toEqual(["A"]);
  });

  it("renders chevrons as icons instead of visible text glyphs", () => {
    const state = createEmptyState();
    const root = document.createElement("div");

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => undefined,
      onToggleCategory: () => undefined
    });

    const chevron = root.querySelector(".ytdlp-section-chevron");

    expect(chevron?.textContent).toBe("");
    expect(chevron?.classList.contains("is-expanded")).toBe(true);
  });

  it("renders the saved category icon as an svg in the YouTube sidebar", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-music", name: "Music", color: "#8b5cf6", icon: "music" });
    const root = document.createElement("div");

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => undefined,
      onToggleCategory: () => undefined
    });

    const musicSection = Array.from(root.querySelectorAll<HTMLElement>(".ytdlp-section")).find((section) =>
      section.textContent?.includes("Music")
    );

    expect(musicSection?.querySelector('svg[data-icon="music"]')).toBeTruthy();
    expect(musicSection?.querySelector(".ytdlp-section-icon")?.textContent).toBe("");
  });

  it("renders a YouTube sidebar management entry", () => {
    const state = createEmptyState();
    const root = document.createElement("div");
    let opened = false;

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => {
        opened = true;
      },
      onToggleCategory: () => undefined
    });

    const button = root.querySelector<HTMLButtonElement>(".ytdlp-sidebar-manage");

    expect(button?.textContent).toContain("管理");
    button?.click();
    expect(opened).toBe(true);
  });

  it("flags categories with new content and renders one aggregate dot per flagged title", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(
      state,
      [
        { id: "UC-a", name: "A", url: "https://www.youtube.com/channel/UC-a" },
        { id: "UC-b", name: "B", url: "https://www.youtube.com/channel/UC-b" }
      ],
      1
    );
    state = addCategory(state, { id: "cat-code", name: "Code", color: "#22c55e", icon: "code" });
    state = moveChannels(state, ["UC-a"], "cat-code");
    state = toggleCategoryExpanded(state, "cat-code");
    const newnessIds = new Set(["UC-a"]);

    const sections = buildSidebarSections(state, newnessIds);

    expect(sections.map((section) => [section.id, section.hasNewness])).toEqual([
      [UNCATEGORIZED_ID, false],
      ["cat-code", true]
    ]);

    const root = document.createElement("div");
    renderSidebar(
      root,
      state,
      {
        onModeChange: () => undefined,
        onOpenChannel: () => undefined,
        onOpenManager: () => undefined,
        onToggleCategory: () => undefined
      },
      newnessIds
    );

    const sectionDot = root.querySelectorAll(".ytdlp-section-newness");
    expect(sectionDot.length).toBe(1);
    expect(sectionDot[0]?.getAttribute("aria-hidden")).toBe("true");

    // Official-style per-channel dot: only on the fresh channel's avatar.
    const channelDots = root.querySelectorAll(".ytdlp-channel-fresh");
    expect(channelDots.length).toBe(1);
    expect(channelDots[0]?.closest(".ytdlp-channel")?.getAttribute("title")).toBe("A");
  });
});
