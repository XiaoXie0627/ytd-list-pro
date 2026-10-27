import type { Channel } from "../shared/types";

const MESSAGE_MARK = "YTD_LIST_PRO_SESSION_SYNC";
const NAVIGATE_KIND = "spa-navigate";
const SETTLE_TIMEOUT_MS = 350;

export type SpaNavigateResult = "yt-navigate" | "history" | "hard";

export interface SpaNavigateDeps {
  // jsdom cannot stub the unforgeable window.location, so tests inject this.
  hardNavigate?(url: string): void;
  settleTimeoutMs?: number;
}

// Resolves true once YouTube's router acknowledges the navigation (it fires
// yt-navigate-start/-finish), false when nothing reacts in time.
const waitForRouter = (timeoutMs: number): Promise<boolean> => {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (acknowledged: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("yt-navigate-start", onRouterEvent, true);
      window.removeEventListener("yt-navigate-finish", onRouterEvent, true);
      resolve(acknowledged);
    };
    const onRouterEvent = () => finish(true);
    // Capture phase on window also sees events YouTube dispatches on document.
    window.addEventListener("yt-navigate-start", onRouterEvent, true);
    window.addEventListener("yt-navigate-finish", onRouterEvent, true);
    timer = window.setTimeout(() => finish(false), timeoutMs);
  });
};

const resolveUrl = (url: string): string => {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
};

// Channels synced from YouTube carry canonical UC… ids, which map onto a
// browseEndpoint. Quick-add captures may only have handle:xxx fallback ids —
// those skip this step and rely on URL-based navigation instead.
const channelBrowseEndpoint = (
  channel: Channel
): { browseEndpoint: { browseId: string; canonicalBaseUrl?: string } } | undefined => {
  if (!channel.id.startsWith("UC")) {
    return undefined;
  }
  const endpoint: { browseEndpoint: { browseId: string; canonicalBaseUrl?: string } } = {
    browseEndpoint: { browseId: channel.id }
  };
  try {
    const { pathname, search } = new URL(channel.url, window.location.origin);
    if (pathname !== `/channel/${channel.id}`) {
      // Prefer the handle form (/@name) so the address bar stays readable.
      endpoint.browseEndpoint.canonicalBaseUrl = `${pathname}${search}`;
    }
  } catch {
    // Unparseable url: browseId alone still navigates correctly.
  }
  return endpoint;
};

// CustomEvent.detail does not cross isolated worlds (the page world would read
// null), so the dispatch itself has to happen in the MAIN-world page-reader.
const requestPageNavigate = (endpoint: { browseEndpoint: { browseId: string; canonicalBaseUrl?: string } }) => {
  window.postMessage({ marker: MESSAGE_MARK, kind: NAVIGATE_KIND, endpoint }, window.location.origin);
};

export async function navigateWithinYouTube(
  channel: Channel,
  { hardNavigate, settleTimeoutMs = SETTLE_TIMEOUT_MS }: SpaNavigateDeps = {}
): Promise<SpaNavigateResult> {
  const fallbackNavigate =
    hardNavigate ??
    ((url: string) => {
      window.location.href = url;
    });

  // 1. Native path: ask the MAIN world to fire YouTube's own yt-navigate event
  //    with a browseEndpoint (the mechanism the desktop YouTube Music app uses).
  const endpoint = channelBrowseEndpoint(channel);
  if (endpoint) {
    const acknowledged = waitForRouter(settleTimeoutMs);
    requestPageNavigate(endpoint);
    if (await acknowledged) {
      return "yt-navigate";
    }
  }

  // 2. URL path: push the URL, then hand control to the page's history
  //    listeners via a synthetic popstate (what real back/forward sends).
  const historyAcknowledged = waitForRouter(settleTimeoutMs);
  try {
    history.pushState(null, "", resolveUrl(channel.url));
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    if (await historyAcknowledged) {
      return "history";
    }
  } catch {
    // Malformed/foreign URL: only the hard navigation below can handle it.
  }

  // 3. Full page reload — the pre-SPA behavior, always lands on the channel.
  fallbackNavigate(channel.url);
  return "hard";
}
