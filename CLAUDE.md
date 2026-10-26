# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome MV3 extension that organizes YouTube subscriptions into user-defined categories, rendered natively inside the YouTube sidebar. No backend; all data lives in `chrome.storage.local`. User-facing strings are Simplified Chinese (zh-CN); code identifiers are English.

## Commands

```bash
npm install
npm run build       # build to dist/ (load unpacked in chrome://extensions from dist/)
npm test -- --run   # run all tests once (bare `npm test` is watch mode)
npm test -- --run src/shared/state.test.ts   # run a single test file
npm run typecheck   # tsc --noEmit
```

There is no separate lint step; `npm run typecheck` plus tests are the gate.

## Build pipeline

`scripts/build.mjs` produces everything in `dist/` with **esbuild** (the Vite-built React popup page was removed in 0.3.0):

- `dist/manifest.json` — emitted from `src/manifest.ts`, the single source of truth for manifest config (the build script bundles it and evaluates the result)
- `assets/background.js` (ESM service worker), `assets/page-reader.js` (IIFE, **MAIN world**), `assets/content.js` (IIFE, **ISOLATED world**)
- `public/` (extension icons) is copied verbatim into `dist/`

The extension version lives in **both** `package.json` and `src/manifest.ts` — bump both. Bump the version **before every build** — including daily/dev builds, not just releases — so builds are distinguishable when testing.

## Architecture

Three independent contexts share state through `chrome.storage.local` and messages defined in `src/shared/messages.ts`:

- **Background** (`src/background/`): message router. Serves `GET_STATE`, proxies `FETCH_AVATAR` (fetches allowed avatar hosts and returns `data:` URLs, since extension-page CSP blocks direct YouTube image loading), opens the manager in a YouTube tab on action click — **deliberately injecting content scripts on demand** if they aren't there yet. The manifest intentionally has *no* `default_popup` (asserted in `src/manifest.test.ts`); the toolbar click opens the in-tab manager instead.
- **Page reader** (`src/content/page-reader.ts`, MAIN world): runs in the page's JS context so it can read `ytcfg`/`yt.config_` and the `SAPISID` cookie, compute YouTube's InnerTube `Authorization` header (SHA-1 of timestamp+SAPISID), and call the internal browse API (`FEchannels` + continuation tokens) with the user's real login session. It communicates **only** via `window.postMessage` with the `YTD_LIST_PRO_SESSION_SYNC` marker (`src/content/session-bridge.ts` is the ISOLATED-world counterpart).
- **Content script** (`src/content/index.ts`, ISOLATED world): the orchestrator and the only user-facing surface inside YouTube. Renders three vanilla-DOM UIs — sidebar (`sidebar.ts`), in-tab manager panel (`manager.ts`), quick-add button on video/channel pages (`quick-add.ts`) — with a MutationObserver + `yt-navigate-finish`/`pushState` hooks to survive YouTube's SPA navigation. The manager opens a shared category-picker dialog for 「添加」 (add membership) and 「移动」 (checked set = final memberships, via `setChannelCategories`); per-row membership badges allow single removal, and the quick-add menu is a per-category toggle (join/leave). On `COLLECT_SUBSCRIPTIONS` it bridges to the page reader, then `mergeSubscriptions` and saves. It also detects the active YouTube account by scraping `DATASYNC_ID` from inline page scripts.

### State layer (the core)

- `src/shared/state.ts` holds **all** state transitions as pure functions (`mergeSubscriptions`, `moveChannels`, `addChannelsToCategory`, `removeChannelFromCategory`, `addCategory`, …). Convention: `cloneState()` first, mutate the clone, return it — never mutate the input. UI layers call `updateState(updater)` from storage.ts, which does load→mutate→save.
- **Membership model (schemaVersion 2)**: `state.memberships: Record<channelId, categoryIds[]>` is the single source of truth for which channels live in which categories (a channel may belong to many; empty entries are not stored). Each `category.channelIds` is only that category's **display order** and must mirror its membership set. "Uncategorized" is **implicit**: a channel with no memberships entry — there is no `uncategorizedChannelIds` array anymore. The `uncategorized` category record exists only for name/color/icon. Membership edits must go through the primitives (`addMembership`/`removeMembership`/`clearMemberships`) so order arrays stay in lockstep; `docs/Plan.md` records the invariants.
- Moving vs adding: `moveChannels` replaces all memberships with the single target; `addChannelsToCategory` ensures one membership while keeping the rest. `upsertChannelToCategory` = upsert channel + ensure membership (assigning to `UNCATEGORIZED_ID` clears all memberships).
- `src/shared/storage.ts` implements **per-account storage isolation**: state keys are `ytdListProState:<accountId>` (plain `ytdListProState` is the pre-account legacy key/backup). A module-level active account must be set via `configureStorageAccount`/`activateAccount` before any read/write; the content script does this per page load from `DATASYNC_ID`. Legacy-data adoption/recovery logic (`activateAccount`, `restoreLegacyBackup`) migrates the pre-account state to the first real account that appears. `loadState` transparently migrates v1 states (explicit `uncategorizedChannelIds`, no `memberships`) to v2 and persists the result.
- Channel identity is dual: full syncs produce canonical `UC...` ids, but page-context captures (quick-add) may only yield fallback `handle:xxx` ids. `mergeSubscriptions` remaps `handle:xxx` ids to canonical ids while preserving memberships — keep this behavior when touching sync.
- `uncategorized` (`UNCATEGORIZED_ID`) is a system category that cannot be created/renamed/deleted; state functions throw on attempts.
- A sync **replaces** the channel set: channels no longer subscribed are pruned along with their memberships/order entries. Memberships are preserved for returning channels; brand-new channels stay uncategorized implicitly.

## Testing

Vitest + jsdom, globals enabled, tests colocated as `*.test.ts(x)` next to source, `restoreMocks: true`. `chrome.*` is faked per test, typically with `createMemoryStorageArea` from storage.ts plus a hand-rolled `globalThis.chrome`. Test fixtures for recovery/migration scenarios use the placeholder markers recognized by `state.ts` (`UClegacy…` ids, `Recovered Channel…` names, `@recovered…` handles).

## Privacy constraint

This repo must never contain real user subscription data: `LEGACY_IMPORT_DATA` in `src/shared/legacy-data.ts` must stay empty (tests pass their own fixtures), and `.gitignore` blocks `*subscriptions*.json`, `*storage*.json`, `*cookies*.txt`. Don't introduce anything that records or ships real account data.
