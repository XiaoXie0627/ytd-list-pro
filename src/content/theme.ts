import type { ThemePreference } from "../shared/types";

export type ResolvedTheme = "light" | "dark";

/** YouTube marks its own theme with a boolean `dark` attribute on <html>. */
export const isPageDark = (): boolean => document.documentElement.hasAttribute("dark");

/** Explicit light/dark wins; "auto" (or unset) follows the page. */
export const resolveTheme = (preference: ThemePreference | undefined, pageDark: boolean): ResolvedTheme =>
  preference === "light" || preference === "dark" ? preference : pageDark ? "dark" : "light";

/** Stamp the resolved theme onto one of the extension's UI roots. */
export const applyTheme = (root: HTMLElement | undefined, theme: ResolvedTheme): void => {
  if (root) {
    root.dataset.ytdlpTheme = theme;
  }
};

/**
 * Watch YouTube's theme attribute so "auto" follows live switches; the UI
 * needs no re-render, the CSS tokens react to the root attribute. Returns a
 * cleanup function.
 */
export const watchPageTheme = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dark"] });
  return () => observer.disconnect();
};

/**
 * Self-hosted theme tokens (the fix for the invisible-in-dark bug: our styles
 * no longer depend on `--yt-spec-*`). Light values replicate the previous
 * look exactly; dark is the warm orange-brown scheme decided in Q8.
 */
export const THEME_STYLES = `
[data-ytdlp-theme="light"] {
  --ytdlp-text: #0f0f0f;
  --ytdlp-text-secondary: #606060;
  --ytdlp-accent: #0f0f0f;
  --ytdlp-accent-contrast: #ffffff;
  --ytdlp-cta: #065fd4;
  --ytdlp-cta-soft: rgba(6, 95, 212, 0.1);
  --ytdlp-cta-contrast: #ffffff;
  --ytdlp-chip: rgba(0, 0, 0, 0.05);
  --ytdlp-chip-strong: rgba(0, 0, 0, 0.08);
  --ytdlp-chip-hover: rgba(0, 0, 0, 0.1);
  --ytdlp-layer: rgba(0, 0, 0, 0.18);
  --ytdlp-border: rgba(0, 0, 0, 0.12);
  --ytdlp-surface: #ffffff;
  --ytdlp-panel: transparent;
  --ytdlp-panel-border: transparent;
  --ytdlp-backdrop: rgba(0, 0, 0, 0.18);
  --ytdlp-backdrop-strong: rgba(0, 0, 0, 0.24);
  --ytdlp-danger: #dc2626;
  --ytdlp-danger-soft: #fee2e2;
  --ytdlp-newness: #ff9142;
}
[data-ytdlp-theme="dark"] {
  --ytdlp-text: #f2e9dd;
  --ytdlp-text-secondary: #bfae9c;
  --ytdlp-accent: #e8934a;
  --ytdlp-accent-contrast: #241a12;
  --ytdlp-cta: #ff9142;
  --ytdlp-cta-soft: rgba(255, 145, 66, 0.16);
  --ytdlp-cta-contrast: #241a12;
  --ytdlp-chip: rgba(255, 255, 255, 0.07);
  --ytdlp-chip-strong: rgba(255, 255, 255, 0.1);
  --ytdlp-chip-hover: rgba(255, 255, 255, 0.13);
  --ytdlp-layer: rgba(255, 255, 255, 0.22);
  --ytdlp-border: rgba(255, 255, 255, 0.12);
  --ytdlp-surface: #262019;
  --ytdlp-panel: #211b16;
  --ytdlp-panel-border: rgba(255, 255, 255, 0.07);
  --ytdlp-backdrop: rgba(0, 0, 0, 0.5);
  --ytdlp-backdrop-strong: rgba(0, 0, 0, 0.55);
  --ytdlp-danger: #ff8a7a;
  --ytdlp-danger-soft: rgba(248, 113, 93, 0.18);
  --ytdlp-newness: #ff9142;
}
`;
