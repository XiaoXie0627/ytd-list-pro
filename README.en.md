<p align="center">
  <img src="public/icons/icon-128.png" width="110" alt="YTD List Pro" />
</p>

<h1 align="center">YTD List Pro</h1>

<p align="center">
  A browser extension that organizes your YouTube subscriptions into visual categories, right inside the YouTube sidebar
</p>

<p align="center">
  <a href="README.md">中文</a> ·
  English
</p>

<p align="center">
  <a href="https://github.com/lxfater/ytd-list-pro/releases/latest"><b>⬇️ Download the prebuilt package</b></a> (no build needed — see <a href="#install">Install</a>)
</p>

---

## Features

- **Subscription sync** — reads the full subscription list of the currently signed-in YouTube account and stores it locally.
- **Unlimited categories** — create categories with custom names, colors, and icons.
- **Multi-membership** — a channel can belong to any number of categories at once; the sidebar shows it under every category it belongs to, and removing it from all of them returns it to Uncategorized.
- **Native sidebar** — categories blend into the YouTube sidebar and can replace the long stock subscription list; switch back anytime.
- **Quick add** — an "add to category" button appears next to the subscribe button on watch and channel pages; it shows every category the channel currently belongs to — click to join, click again to leave.
- **Global search** — search across all categories with multiple keywords in any order; results are deduplicated by channel and tagged with all their categories. The search box has a one-click ✕ clear.
- **Bulk management** — multi-select channels and open a category picker from 添加 (Add) / 移动 (Move): Add ticks several categories at once (keeping existing memberships); Move makes the checked set the final memberships (unchecked ones are removed), with a one-click "remove from all categories" in move mode. Also per-membership removal via row badges, drag-and-drop with drop-target highlights, and flexible sorting.
- **Multi-account isolation** — each YouTube account keeps its own categories; switching accounts never mixes data. Data from older versions is migrated automatically to the first account used after upgrading.
- **Import / Export** — export all categories to a CSV file (opens directly in Excel) and bulk-import from CSV.
- **Local-first** — all state lives in `chrome.storage.local`; there is no backend.

## How to Use

![How to use](assets/help.png)

Follow steps ①②③ in the screenshot (the extension UI is in Chinese; English equivalents in parentheses):

1. **Open the manager panel** (① in the screenshot) — after installation, a switcher appears at the top of the YouTube sidebar with three buttons: 原始 (Original) / 分类 (Categories) / 管理 (Manage). Click 管理 (Manage) to open the category manager panel.
2. **Create categories and organize channels** (②) — click 新建 (New) to create your own categories, then tick channels and click 添加 (Add) or 移动 (Move): a dialog pops up where you tick the target categories before confirming — or simply drag channels onto a category. The search box at the top finds channels across all categories and clears with one click.
3. **Refresh channels** (③) — on first use, click 刷新频道 (Refresh channels) to pull in your subscriptions. **Whenever you subscribe to a new creator and don't see them in the list, click refresh and they will appear.**

Once organized, switch the left sidebar to 分类 (Categories) mode and click any category to browse its channels — no more scrolling through one long, messy subscription list. There is an even faster way in daily use: on any watch or channel page, an 加入分类 (Add to category) button appears next to the subscribe button — click it and pick a category, no manager panel needed.

## Install

### Option 1: Download from Releases (recommended, no build needed)

No Node.js, no commands — just grab the prebuilt package:

1. Go to the [Releases page](https://github.com/lxfater/ytd-list-pro/releases/latest) and download the latest `ytd-list-pro-vX.Y.Z.zip`, then unzip it.
2. Open `chrome://extensions/` (`edge://extensions/` on Edge) and enable Developer mode in the top-right corner.
3. Click "Load unpacked" and select the unzipped folder.
4. Open [youtube.com](https://www.youtube.com) and sync your subscriptions following the guide above.

### Option 2: Build from source

```bash
npm install
npm run build
```

Then follow steps 2-4 above, selecting this project's `dist` directory when loading the unpacked extension.

## Export / Import

The manager panel toolbar has 导出 (Export) and 导入 (Import) buttons.

**Export** downloads all categories and channels as a CSV file (UTF-8 with BOM, so Excel opens it correctly, including CJK text).

**Import** accepts a CSV with the same structure. The first row is an optional header; every following row is one channel with three columns:

| 分类 (Category) | 频道名称 (Channel Name) | 频道链接 (Channel URL) |
| --- | --- | --- |
| AI Demo | Demo Alpha | https://www.youtube.com/@demo-alpha |
| Coding | Demo Beta | https://www.youtube.com/@demo-beta |
| 未分类 | | https://www.youtube.com/channel/UCxxxxxxxx |

Column rules:

- **Category** (required) — the category name. Missing categories are created automatically; the name 未分类 (Uncategorized) clears the channel's memberships so it lands in the uncategorized list.
- **Channel Name** (optional) — inferred from the URL when empty, and replaced with the real name on the next subscription refresh.
- **Channel URL** (required) — both `https://www.youtube.com/@handle` and `https://www.youtube.com/channel/UC...` forms are supported.
- Import is idempotent: channels that already exist (matched by channel ID or handle) are **added** to the target category while keeping their existing memberships — the same channel may appear on several rows to join several categories. Unrecognized rows are skipped and reported with their line numbers in the status bar.

Tip: the safest way to build an import file is to export first and edit that CSV as a template.

## Development

```bash
npm install
npm test -- --run   # run tests
npm run typecheck   # type check
npm run build       # build to dist/
```

## Privacy

- This extension ships with **no** real user's subscription data.
- Subscription data is read in the active YouTube tab using your existing YouTube session and stored only in local browser storage.
- There is no backend service; subscription lists are never uploaded to any third-party server.
- The content script reads YouTube page configuration solely to call YouTube's own internal subscription endpoint from the YouTube origin; no cookie values are logged, committed, or sent outside YouTube.

## License

[MIT](LICENSE)
