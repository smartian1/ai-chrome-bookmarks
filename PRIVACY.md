# Privacy Policy — AI Bookmark Trails (AI书签寻迹)

*Updated November 24, 2026.* Applies to the Chrome extension **AI Bookmark Trails** (简体中文名：**AI书签寻迹**).

The extension processes data solely to help you search, organize, and rediscover your own saved bookmarks.

---

## English

### Local Data
The extension reads bookmark titles, full URLs, folder structure, creation timestamps, and subsequent bookmark changes from your active Chrome profile. Within that profile, it locally stores the search index, personal notes, page excerpt snippets, AI-generated summaries, indexing progress, and settings. Standard keyword search runs entirely on your device. The extension has no developer-operated bookmark server and includes no ads or analytics.

### Data Transmitted When Using AI
You may optionally configure your own Chat Completions-compatible model gateway:
- **Connection test**: Sends a minimal test message to your configured gateway URL.
- **AI Search**: Sends your search query text to the gateway and uses the returned search terms/concepts locally to rank bookmarks.
- **Indexing**: Sends bookmark titles, cleaned page URLs (with query strings and fragments removed), and available public page excerpts (up to 2,400 characters per page). Up to 4 pages may be batched in one request.
- **API key**: If provided, your API key is stored locally in `chrome.storage.local` and sent only as authentication to your configured gateway. How the gateway routes or retains data is governed by that service provider's privacy policy.

After you grant optional website access permissions, the extension may fetch public bookmark URLs within your indexing scope to extract visible text. Target websites receive standard HTTP(S) requests (including your IP address) without login credentials, script execution, or redirects. Once a model is configured, newly added bookmarks and bookmarks whose title or URL changes are queued for automatic indexing unless located in an explicitly excluded folder; existing bookmarks are indexed only when you select folders and start indexing.

### Control & Deletion
You can exclude folders, pause manual indexing, clear AI indexes for a specific folder or all folders, edit or clear personal notes, or clear your API key in settings. Clearing AI indexes never modifies or deletes Chrome bookmarks. Uninstalling the extension removes all local extension data in that Chrome profile. For data already received by an external model provider, follow that provider's deletion process.

### Compliance & Contact
The developer's use and transfer of information received from Chrome APIs adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. The developer does not sell user data and does not use bookmark or search content for advertising.

For privacy questions, please open an issue on [GitHub Issues](https://github.com/smartian1/ai-chrome-bookmarks/issues). Please do not include API keys or private bookmarks in public issues.

---

## 简体中文

更新于 2026 年 11 月 24 日，适用于 Chrome 扩展「AI书签寻迹」（AI Bookmark Trails）。扩展使用数据的目的是帮助你搜索、整理和找回自己收藏的页面。

### 本地数据
扩展读取当前 Chrome 配置的书签标题、完整网址、目录、创建时间及后续变动，在此配置内保存搜索索引、个人备注、网页摘录片段、摘要、处理状态和设置。普通关键词搜索在本机完成。扩展没有开发者运营的书签服务器，也没有内置广告或分析服务。

### 使用 AI 时的数据传输
你可以选择配置模型网关。测试连接时，扩展向该地址发送测试消息。提交 AI 对话搜索时，扩展发送本次查询文字，并在本机用返回的检索词查找书签。生成摘要时，扩展向网关发送书签标题、去除查询参数和片段的页面网址，以及可获得的网页摘录（每页最多 2,400 个字符）。多个页面可能在同一次请求中发送。网关可将数据转发至其模型提供方，其留存和使用方式受该服务的政策约束。若填写 API 密钥，扩展将其保存在本地，并在调用你设置的网关时作为认证凭据发送给该网关。

授权网站访问后，扩展可以访问待建库的书签网址以提取公开文字。目标网站会收到普通网络请求，包括来源 IP。扩展读取页面时不附带登录凭据。配置模型后，新增书签以及标题或网址变动会触发自动建库；明确排除的目录会跳过，已有书签由你选择范围后开始建库。

### 控制和删除
你可以排除目录、暂停手动建库、按目录或全部清除 AI 索引、编辑或清空备注，以及在设置中清空密钥并保存。清理 AI 索引会保留 Chrome 书签。卸载扩展将移除该扩展在此 Chrome 配置中的本地数据。对外部模型服务已经接收的数据，请按该服务的流程申请删除。

开发者对从 Chrome API 获得的数据的使用和传输遵守 Chrome 网上应用店用户数据政策及其有限使用要求。开发者不出售用户数据，不使用书签或搜索内容投放广告。有关隐私问题，请通过项目的 [GitHub 问题反馈页面](https://github.com/smartian1/ai-chrome-bookmarks/issues) 联系开发者，请勿在公开反馈中提交密钥或私人书签。
