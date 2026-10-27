import { beforeEach, describe, expect, it } from "vitest";
import { addCategory, createEmptyState, mergeSubscriptions, moveChannels } from "../shared/state";
import { collectNewnessChannelIds } from "./newness";

const createState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      { id: "UC-a", name: "Alpha", handle: "@alpha", url: "https://www.youtube.com/@alpha" },
      { id: "UC-b", name: "Beta", handle: "@beta", url: "https://www.youtube.com/@beta" },
      { id: "UC-c", name: "Caramel", url: "https://www.youtube.com/channel/UC-c" }
    ],
    1
  );
  state = addCategory(state, { id: "cat-ai", name: "AI", color: "#ca9ee6", icon: "ai" });
  state = moveChannels(state, ["UC-a"], "cat-ai");
  return state;
};

// YouTube ships the dot div in every subscription entry and toggles it; a
// hidden dot must not count as fresh content.
const entry = (href: string, dotMode: "shown" | "hidden-attr" | "display-none" | "none") => {
  const item = document.createElement("ytd-guide-entry-renderer");
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  item.append(anchor);
  if (dotMode !== "none") {
    const dot = document.createElement("div");
    dot.id = "newness-dot";
    if (dotMode === "hidden-attr") {
      dot.setAttribute("hidden", "");
    }
    if (dotMode === "display-none") {
      dot.style.display = "none";
    }
    item.append(dot);
  }
  return item;
};

describe("collectNewnessChannelIds", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("maps shown dots to channel ids by canonical id and by handle", () => {
    const state = createState();
    document.body.append(
      entry("/channel/UC-a", "shown"),
      entry("/@beta", "shown"),
      entry("/@alpha", "none")
    );

    const fresh = collectNewnessChannelIds(state);

    // UC-a is fresh via its canonical id, UC-b via its handle; UC-a's own
    // dot-less entry must not leak in.
    expect(fresh.has("UC-a")).toBe(true);
    expect(fresh.has("UC-b")).toBe(true);
    expect(fresh.size).toBe(2);
  });

  it("ignores entries whose dot is hidden (attribute or display:none)", () => {
    const state = createState();
    document.body.append(
      entry("/channel/UC-a", "hidden-attr"),
      entry("/channel/UC-b", "display-none"),
      entry("/channel/UC-c", "shown")
    );

    const fresh = collectNewnessChannelIds(state);

    expect(fresh.has("UC-c")).toBe(true);
    expect(fresh.size).toBe(1);
  });

  it("returns an empty set when the page has no guide entries (markup changed)", () => {
    expect(collectNewnessChannelIds(createState()).size).toBe(0);
  });

  it("ignores entries whose link maps to no known channel", () => {
    const state = createState();
    document.body.append(entry("/@stranger", "shown"), entry("/channel/UC-a", "shown"));

    const fresh = collectNewnessChannelIds(state);

    expect(fresh.has("UC-a")).toBe(true);
    expect(fresh.size).toBe(1);
  });

  it("works for uncategorized channels too", () => {
    const state = createState();
    document.body.append(entry("/channel/UC-c", "shown"));

    const fresh = collectNewnessChannelIds(state);

    expect(fresh.has("UC-c")).toBe(true);
  });
});
