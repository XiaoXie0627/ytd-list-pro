import type { ExtensionState } from "../shared/types";

// Mirrors YouTube's own "new content" dots from the native guide. The dot
// element (#newness-dot and markup variants) ships in *every* subscription
// entry and is toggled per channel, so an entry only counts as fresh when its
// dot is actually shown. Zero network requests, no read-state of our own:
// when YouTube clears a dot, the aggregate dot disappears on the next
// refresh too. Guide sections no longer expose titles, so we scan entries
// directly — a newness dot never appears on non-subscription entries.

const NEWNESS_SELECTOR = '[id*="newness" i], [class*="newness" i], .guide-entry-dot';

const isShown = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return true;
  }
  if (element.hasAttribute("hidden")) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};

const channelKeyFromHref = (href: string): { id?: string; handle?: string } => {
  let pathname: string;
  try {
    pathname = new URL(href, location.origin).pathname;
  } catch {
    return {};
  }
  const channelMatch = pathname.match(/^\/channel\/(UC[\w-]+)/);
  if (channelMatch) {
    return { id: channelMatch[1] };
  }
  const handleMatch = pathname.match(/^\/(@[\w.-]+)/);
  if (handleMatch) {
    return { handle: handleMatch[1].toLocaleLowerCase() };
  }
  return {};
};

/**
 * Channel ids (as stored in our state) that YouTube currently marks with a
 * shown newness dot. Degrades to an empty set whenever nothing can be
 * scraped — a YouTube redesign must never break the sidebar.
 */
export const collectNewnessChannelIds = (state: ExtensionState): Set<string> => {
  const idByHandle = new Map<string, string>();
  for (const channel of Object.values(state.channels)) {
    if (channel.handle) {
      idByHandle.set(channel.handle.toLocaleLowerCase(), channel.id);
    }
  }

  const fresh = new Set<string>();
  for (const entry of Array.from(document.querySelectorAll("ytd-guide-entry-renderer"))) {
    const dot = entry.querySelector(NEWNESS_SELECTOR);
    if (!dot || !isShown(dot)) {
      continue;
    }
    const href = entry.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href");
    if (!href) {
      continue;
    }
    const { id, handle } = channelKeyFromHref(href);
    if (id && state.channels[id]) {
      fresh.add(id);
    } else if (handle) {
      const mapped = idByHandle.get(handle);
      if (mapped) {
        fresh.add(mapped);
      }
    }
  }
  return fresh;
};
