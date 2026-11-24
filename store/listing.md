# Chrome Web Store Listing Assets (v0.1.1)

- **Category**: Workflow & Planning（工作流程与规划）
- **Visibility**: Public（公开）
- **Default Locale in Package**: `en` (with `zh_CN` localized via `_locales`)
- **Homepage URL**: `https://github.com/smartian1/ai-chrome-bookmarks`
- **Support URL**: `https://github.com/smartian1/ai-chrome-bookmarks/issues`
- **Privacy Policy URL**: `https://github.com/smartian1/ai-chrome-bookmarks/blob/master/PRIVACY.md`

---

## English (`en`)

### Name (from `manifest.json` / `_locales/en`)
AI Bookmark Trails

### Summary (from `manifest.json` / `_locales/en`)
Search Chrome bookmarks by title, URL, or folder instantly. Connect your own AI model to find saved pages by what they do.

### Detailed Description
Remember what a bookmarked page does, but forgot its title? AI Bookmark Trails helps you rediscover pages from your Chrome bookmarks. Type any part of a title, URL, or folder name to see instant local matches—no AI setup required.

When you want to search by purpose, connect your own OpenAI-compatible AI model gateway to generate concise summaries and bilingual search keywords for selected folders. Try searching "that PDF table extraction tool I saved" with AI Search to find the right bookmark in seconds.

- Press Alt+Shift+B to open bookmark search, pick a result with the arrow keys, and press Enter to open it.
- Local search stays synced automatically when bookmarks are added, edited, moved, or deleted; once a model is configured, new and updated bookmarks can also be summarized automatically.
- Choose folders to index in a tree view, browse generated summaries, add personal notes, exclude folders, or clear AI indexes at any time. Existing summaries are reused automatically.
- Bookmark indexes and personal notes stay inside your Chrome profile. AI features use your own compatible model gateway (usage costs depend on your provider). AI Search sends your query text; indexing sends bookmark titles, cleaned URLs, and available page excerpts. Your API key is used only to authenticate with your configured gateway.

### Screenshot
- `store/bookmark-search-en.png` (1280×800)

---

## 简体中文 (`zh_CN`)

### 名称（来自 `manifest.json` / `_locales/zh_CN`）
AI书签寻迹

### 简介（来自 `manifest.json` / `_locales/zh_CN`）
Chrome 书签搜索工具，支持按标题、网址和文件夹即时查找。连接自己的 AI 模型后，可以按页面用途和自然语言找回收藏。

### 详细介绍
你还记得收藏的网页是做什么的，却想不起标题？AI书签寻迹帮你从 Chrome 书签里找回那个页面。输入标题片段、网址或文件夹名称，就能在本地看到匹配结果，无需配置模型。

想按用途查找时，可以连接自己的 AI 模型，为选定文件夹生成页面摘要和检索词。试着输入「之前收藏的 PDF 表格提取工具」，用 AI 对话搜索找回相关书签。

- 按 Alt+Shift+B 打开书签搜索框，通过方向键选择结果，按回车打开。
- 新增、编辑或删除书签后，本地索引自动同步；配置模型后，新增和编辑的书签还可自动生成摘要。
- 在树状目录中选择建库范围、查看摘要、排除文件夹或清理索引。已有摘要可复用。
- 书签索引和备注保存在当前 Chrome 配置中。AI 功能需自行配置兼容的模型服务，其费用取决于提供方。对话搜索发送查询文字，建库发送标题、处理后的网址和可取得的网页摘录。填写的 API 密钥只用于向所配置的网关认证。

### 截图
- `store/bookmark-search.png` (1280×800)

---

## Review Notes / 审核资料

Single purpose: help users search and rediscover their own Chrome bookmarks. Basic local search can be tested immediately without any API key: create a bookmark, open the extension popup, search by part of its title, and open the result. AI Search and summary generation require configuring a Chat Completions-compatible gateway in Manage Index.

- `bookmarks` permission reads the bookmark tree and listens for create, change, move, and remove events.
- `storage` permission stores user-selected model settings, optional API key, indexing progress, and folder selection rules.
- `alarms` permission wakes the service worker to process pending bookmark indexing batches.
- Optional `http://*/*` and `https://*/*` host permissions connect to the user-specified model gateway and read public text from user-selected bookmarked pages. Domains are determined solely by the user.
- All executable code is bundled inside the extension package. Model responses are parsed strictly as JSON data. Privacy disclosures cover bookmark URLs, page content excerpts, user queries, and API authentication credentials sent to the user's configured gateway.
