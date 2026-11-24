# AI Bookmark Trails

English | [简体中文](README.zh-CN.md)

Find Chrome bookmarks by what they do, not just the title you forgot.

A Chrome Manifest V3 extension that lets you search bookmarks locally by title, URL, or folder right after installation—no AI required. When you connect your own OpenAI-compatible Chat Completions gateway, it builds concise purpose summaries and bilingual search keywords in the background so you can search in natural language.

- **Chrome Web Store**: [AI Bookmark Trails / AI书签寻迹](https://chromewebstore.google.com/detail/ai%E4%B9%A6%E7%AD%BE%E5%AF%BB%E8%BF%B9/giaaehbmdoejmppnbbflfmggnkohhagn)
- **Primary Repository**: [GitHub](https://github.com/smartian1/ai-chrome-bookmarks) ([Issues & Feedback](https://github.com/smartian1/ai-chrome-bookmarks/issues)) · Gitee mirror available
- **Privacy Policy**: [PRIVACY.md](PRIVACY.md)

## Features

- **Instant local search**: Press `Alt+Shift+B` (customizable at `chrome://extensions/shortcuts`) or click the extension icon to search titles, URLs, folders, and personal notes immediately.
- **Bilingual UI & summaries**: Supports English and Simplified Chinese automatically based on Chrome's UI language. Newly generated AI summaries follow the active UI language while preserving bilingual retrieval terms.
- **Natural-language AI Search**: Press `Enter` or `Ctrl+Enter` to expand your query into concepts and synonyms via your configured model, then rank matching bookmarks locally. Supports explicit folder names and relative time filters (`this month`, `last month`, `本月`, `上个月`).
- **Controlled background indexing**:
  - Newly added bookmarks and bookmarks with changed titles or URLs are queued automatically once a gateway is configured (explicitly excluded folders are skipped).
  - Existing bookmarks are indexed only for folders you select in **Manage Index**, with pause/resume, automatic retry for failed items, and reuse of existing summaries.
  - Personal notes are searchable immediately and prioritized in ranking.

## Install from Source

1. Use Node.js 22 and run:
   ```bash
   npm ci
   npm run build
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist` directory.
3. Click the extension icon or press `Alt+Shift+B`. Type for instant local search; press `Enter` (or `Ctrl+Enter` when an item is highlighted) for AI Search, and use arrow keys + `Enter` to open the selected bookmark.

## Building an AI Index

- Open **Manage Index** to configure your Chat Completions-compatible gateway **API Base URL** (including `/v1`), **Model Name**, and optional **API Key**, then save and test the connection.
- New installs select no folders by default; upgrades preserve your folder selections. Check parent folders to include subfolders, then click **Start Indexing** (click again to pause).
- Starting indexing requests optional HTTP/HTTPS site permissions so the extension can fetch public page text excerpts on demand—without credentials, without executing page scripts, and without following redirects. If a page cannot be read or lacks site permission, the extension falls back to title and URL metadata.
- Browse and filter generated summaries in **Generated LLM Indexes**. Clearing a folder or clearing all indexes pauses indexing while keeping your Chrome bookmarks, basic search, and personal notes intact.

## Data Scope & Privacy

Each Chrome profile keeps its own local index, personal notes, and optional API key in extension storage (`chrome.storage.local` and IndexedDB). The extension never modifies Chrome bookmarks and includes no developer-hosted bookmark server, ads, or analytics.

Indexing requests may include the bookmark title, a cleaned URL (query parameters and fragments stripped), and up to 2,400 characters of visible text excerpt from authorized sites. Private IPs, common intranet domains, credential-like URLs, and non-web protocols stay strictly local. See [PRIVACY.md](PRIVACY.md) for full details.

## Verification

Install Chromium for Playwright once (`npx playwright install chromium`), then run:

```bash
npm test
```

The test suite builds the extension, validates relevance/time-filter logic, and runs end-to-end Playwright checks in both **Simplified Chinese (`zh-CN`)** and **English (`en-US`)** Chrome environments against a local mock HTTP server—no real API key required.
