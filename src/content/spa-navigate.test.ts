import { describe, expect, it, vi } from "vitest";
import type { Channel } from "../shared/types";
import "./page-reader";
import { navigateWithinYouTube } from "./spa-navigate";

const fictionalChannel = (overrides: Partial<Channel> = {}): Channel => ({
  id: "UCfictional01",
  name: "Fictional Studio",
  url: "/@studio",
  ...overrides
});

describe("navigateWithinYouTube", () => {
  it("prefers the MAIN-world yt-navigate event for canonical channel ids", async () => {
    const postSpy = vi.spyOn(window, "postMessage");
    const pushSpy = vi.spyOn(history, "pushState");
    const hardNavigate = vi.fn();
    // Simulated page world: responds to the bridge message the way YouTube's
    // router would acknowledge a yt-navigate dispatch.
    const onPageMessage = (event: MessageEvent) => {
      if (event.data?.kind === "spa-navigate") {
        window.dispatchEvent(new Event("yt-navigate-start"));
      }
    };
    window.addEventListener("message", onPageMessage);
    const result = await navigateWithinYouTube(fictionalChannel(), {
      hardNavigate,
      settleTimeoutMs: 100
    });
    window.removeEventListener("message", onPageMessage);

    expect(result).toBe("yt-navigate");
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy.mock.calls[0][0]).toMatchObject({
      marker: "YTD_LIST_PRO_SESSION_SYNC",
      kind: "spa-navigate",
      endpoint: {
        browseEndpoint: { browseId: "UCfictional01", canonicalBaseUrl: "/@studio" }
      }
    });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("skips the MAIN-world step for handle fallback ids and uses pushState + popstate", async () => {
    const postSpy = vi.spyOn(window, "postMessage");
    const pushSpy = vi.spyOn(history, "pushState");
    const hardNavigate = vi.fn();
    // Simulated YouTube history listener: reacts to popstate by navigating.
    const onPopState = () => {
      window.dispatchEvent(new Event("yt-navigate-start"));
    };
    window.addEventListener("popstate", onPopState);
    const result = await navigateWithinYouTube(
      fictionalChannel({ id: "handle:studio" }),
      { hardNavigate, settleTimeoutMs: 100 }
    );
    window.removeEventListener("popstate", onPopState);

    expect(result).toBe("history");
    expect(postSpy).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith(null, "", expect.stringMatching(/\/@studio$/));
    expect(window.location.pathname).toBe("/@studio");
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("falls back to a hard navigation when both soft paths stay silent", async () => {
    const pushSpy = vi.spyOn(history, "pushState");
    const hardNavigate = vi.fn();
    const result = await navigateWithinYouTube(fictionalChannel(), {
      hardNavigate,
      settleTimeoutMs: 10
    });

    expect(result).toBe("hard");
    expect(pushSpy).toHaveBeenCalled();
    expect(hardNavigate).toHaveBeenCalledWith("/@studio");
  });
});

describe("page-reader spa-navigate dispatch", () => {
  it("fires YouTube's yt-navigate event on document for valid bridge payloads", () => {
    const dispatchSpy = vi.spyOn(document, "dispatchEvent");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          marker: "YTD_LIST_PRO_SESSION_SYNC",
          kind: "spa-navigate",
          endpoint: { browseEndpoint: { browseId: "UCfictional02" } }
        }
      })
    );
    const fired = dispatchSpy.mock.calls.map((call) => call[0]).find((event) => event.type === "yt-navigate");
    expect(fired).toBeInstanceOf(CustomEvent);
    expect((fired as CustomEvent).detail).toEqual({
      endpoint: { browseEndpoint: { browseId: "UCfictional02" } }
    });
  });

  it("ignores navigate payloads without a usable browseEndpoint", () => {
    const dispatchSpy = vi.spyOn(document, "dispatchEvent");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          marker: "YTD_LIST_PRO_SESSION_SYNC",
          kind: "spa-navigate",
          endpoint: { browseEndpoint: {} }
        }
      })
    );
    const fired = dispatchSpy.mock.calls.map((call) => call[0]).find((event) => event.type === "yt-navigate");
    expect(fired).toBeUndefined();
  });
});
