# Hakimi - Obsidian Community Plugin Submission

## 提交前检查清单

### ✅ 仓库要求
- [x] README.md - 完整的中英文文档
- [x] LICENSE - MIT 许可证
- [x] manifest.json - 有效且版本正确
- [x] 源代码公开
- [x] 问题追踪已启用 (GitHub Issues)

### ✅ 插件信息
```json
{
  "id": "hakimi",
  "name": "Hakimi",
  "version": "0.1.0",
  "minAppVersion": "0.15.0",
  "description": "Integrates KimiCode AI assistant with native vault-aware chat, MCP tools, and note management.",
  "author": "Hakimi Contributors",
  "authorUrl": "https://github.com/heswy",
  "isDesktopOnly": true
}
```

**命名检查：**
- ✅ id: `hakimi` - 不包含 "obsidian"
- ✅ name: `Hakimi` - 不包含 "Obsidian"，不以 "Plugin" 结尾
- ✅ description: 不含 "Obsidian" 或 "This plugin"

### ✅ 构建文件
- [x] main.js (约 2MB)
- [x] manifest.json
- [x] styles.css

---

## 提交步骤

### Step 1: 创建 GitHub Release

访问: https://github.com/heswy/Hakimi/releases/new

**填写信息：**
- **Tag version**: `0.1.0` (不要加 `v` 前缀)
- **Release title**: `Hakimi 0.1.0`
- **Description**:
```markdown
Initial release of Hakimi - Native Kimi CLI integration for Obsidian.

Features:
- 🤖 KimiCode-Native Agent via ACP protocol
- 📝 Vault-Aware Chat with context injection
- 🛠️ 9 Vault MCP Tools (read/write/search/list/delete/etc.)
- 💬 Sidebar interface with Markdown rendering
- 📎 Note attachments via @-mention
- 🔍 Natural language vault operations

**Note:** This plugin requires [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) to be installed.
```

**上传文件：**
- [ ] main.js
- [ ] manifest.json
- [ ] styles.css

点击 **Publish release**

---

### Step 2: Fork obsidian-releases

1. 访问 https://github.com/obsidianmd/obsidian-releases
2. 点击右上角 **Fork** 按钮
3. Fork 到你的账号 (heswy)

---

### Step 3: 添加插件条目

在你的 fork 中编辑 `community-plugins.json`，在 **文件末尾**（最后一个 `}` 之前）添加：

```json
,
{
  "id": "hakimi",
  "name": "Hakimi",
  "author": "Hakimi Contributors",
  "description": "Integrates KimiCode AI assistant with native vault-aware chat, MCP tools, and note management.",
  "repo": "heswy/Hakimi"
}
```

⚠️ **重要：**
- 必须添加在 JSON 数组的最后
- 前面需要加逗号 `,`
- 确保 JSON 格式正确（可以使用 JSON 验证器）

---

### Step 4: 提交 PR

**Commit message:**
```
Add Hakimi plugin
```

**PR Title:**
```
Add plugin: Hakimi
```

**PR Description:**
```markdown
# Add Hakimi Plugin

**Plugin ID:** `hakimi`
**Plugin Name:** Hakimi
**Author:** Hakimi Contributors
**Repository:** https://github.com/heswy/Hakimi

## Description
Native [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) integration for Obsidian. Acts as an Obsidian host bridge for `kimi acp`: KimiCode remains the primary Agent runtime, while the plugin provides ACP transport, vault-aware context, and Obsidian MCP tools.

## Features
- 🤖 KimiCode-Native Agent via ACP protocol
- 📝 Vault-Aware Chat with automatic context injection
- 🛠️ 9 Vault MCP Tools (read/write/search/list/delete/append/recent/backlinks)
- 💬 Native Obsidian sidebar interface with Markdown rendering
- 📎 Note attachments via @-mention or drag-drop
- 🔍 Natural language vault operations

## Requirements
- [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) installed and authenticated (`kimi login`)
- Obsidian v0.15.0+
- Desktop only (Windows/macOS/Linux)

## Checklist
- [x] I have read the [developer policies](https://docs.obsidian.md/Developer+policies)
- [x] My plugin does not contain any malicious code
- [x] My plugin does not collect user data without consent
- [x] I have tested my plugin on the latest Obsidian version
- [x] My plugin follows the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

## Note to Reviewers
This plugin requires external CLI tool (Kimi CLI) to function. The plugin auto-detects the CLI path in common installation locations. All vault operations require explicit user confirmation for destructive actions.
```

---

## 提交后流程

1. **自动验证**：GitHub Actions 机器人会在几分钟内运行检查
2. **等待审核**：通常需要 2-6 周
3. **审核反馈**：Obsidian 团队会在 PR 中提出修改意见
4. **发布**：审核通过后，插件会出现在社区插件目录中

---

## 后续维护

发布后，用户可以直接从 Obsidian 内更新。你只需要：
1. 更新 `manifest.json` 中的版本号
2. 创建新的 GitHub Release
3. 用户会在 Obsidian 中收到更新通知

## 联系方式

- GitHub Issues: https://github.com/heswy/Hakimi/issues
- Email: heswyc@163.com
