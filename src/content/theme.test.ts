import { describe, expect, it } from "vitest";
import { applyTheme, isPageDark, resolveTheme, watchPageTheme } from "./theme";

describe("resolveTheme", () => {
  it("follows the page theme in auto mode", () => {
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("auto", true)).toBe("dark");
  });

  it("treats an unset preference as auto", () => {
    expect(resolveTheme(undefined, true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
  });

  it("lets an explicit preference win over the page", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isPageDark", () => {
  it("reads the html[dark] attribute", () => {
    document.documentElement.removeAttribute("dark");
    expect(isPageDark()).toBe(false);
    document.documentElement.setAttribute("dark", "");
    expect(isPageDark()).toBe(true);
    document.documentElement.removeAttribute("dark");
  });
});

describe("applyTheme", () => {
  it("writes the resolved theme onto a UI root", () => {
    const root = document.createElement("div");
    applyTheme(root, "dark");
    expect(root.dataset.ytdlpTheme).toBe("dark");
    applyTheme(root, "light");
    expect(root.dataset.ytdlpTheme).toBe("light");
  });

  it("ignores missing roots", () => {
    expect(() => applyTheme(undefined, "dark")).not.toThrow();
  });
});

describe("watchPageTheme", () => {
  it("fires when the html[dark] attribute flips", async () => {
    let calls = 0;
    const stop = watchPageTheme(() => {
      calls += 1;
    });
    document.documentElement.setAttribute("dark", "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    document.documentElement.removeAttribute("dark");
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
