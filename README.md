# 🌙 Hakimi

**[English](#english) | [中文](#中文)**

**Author:** 阿橙橙 ooorange ([@heswy](https://github.com/heswy)) · heswyc@163.com

---

<a name="english"></a>
## English

Native [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) integration for Obsidian. The plugin acts as an Obsidian host bridge for `kimi acp`: KimiCode remains the primary Agent runtime, while the plugin provides ACP transport, vault-aware context, and Obsidian MCP tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15%2B-purple.svg)](https://obsidian.md)

## ✨ Features

- 🤖 **KimiCode-Native Agent** - Direct ACP connection to `kimi acp`, with KimiCode responsible for planning, tool use, skills, and responses
- 📝 **Vault-Aware Chat** - Kimi understands your vault structure and can read/organize notes
- 🛠️ **Native Skills Discovery** - Use KimiCode skills from `vault/.kimi/skills` and `~/.kimi/skills`
- 🔌 **MCP Tools** - Extend capabilities with Model Context Protocol tools
- 💬 **Sidebar Interface** - Native Obsidian sidebar for seamless workflow
- 📎 **Note Attachments** - Attach the current active note to the conversation
- 🔍 **Vault Operations** - Create, read, update, delete notes via natural language
- 🎯 **Context Injection** - Automatic vault context for smarter responses

## 📸 Screenshot

> **Note:** Screenshot will be added here. Upload `docs/screenshot.png` to display the interface.

![Hakimi Screenshot](https://via.placeholder.com/800x500/f3f4f6/666?text=Hakimi+Screenshot+-+Upload+docs/screenshot.png)

*Hakimi sidebar interface with Markdown rendering support*

## 📋 Requirements

- [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) installed and authenticated (`kimi login`)
- Obsidian v0.15.0 or higher
- Desktop only (Windows, macOS, Linux)

## 🚀 Installation

### From Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Hakimi"
3. Install and Enable

### Manual Installation

1. Download the latest release
2. Extract to `YourVault/.obsidian/plugins/obsidian-kimi/`
3. Enable in Settings → Community Plugins

### Development Build

```bash
git clone https://github.com/heswy/Hakimi.git
cd Hakimi
npm install
npm run build
```

## 🔧 Setup

1. **Install Kimi CLI** (if not already installed):
   ```bash
   # macOS / Linux
   curl -LsSf https://code.kimi.com/install.sh | bash
   
   # Or with uv
   uv tool install --python 3.13 kimi-cli
   ```

2. **Login to Kimi**:
   ```bash
   kimi login
   # Follow the browser OAuth flow
   ```

3. **Open Kimi in Obsidian**:
   - Click the 🌙 icon in the ribbon (left sidebar)
   - Or use Command Palette → "Open Kimi Chat"

## 📖 Usage

### Basic Chat

Just type your message and press Enter. Kimi will respond with streaming output.

### Attach Notes

- Click 📎 to attach the current note
- Kimi will include the note content in context
- You can attach multiple notes

### Use Skills

Skills are discovered and managed by KimiCode itself, not by this plugin.

Supported native skill roots:
- `YourVault/.kimi/skills`
- `~/.kimi/skills`

This matches KimiCode's standard `SKILL.md`-based discovery flow. You can install skill packs such as [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) directly into one of those directories.

### Vault Operations

Kimi can manipulate your vault via natural language:

```
"Create a new note called Project Ideas with a list of features"
"Summarize the Daily Notes from last week"
"Find all notes mentioning 'AI' and create a summary"
"Move all meeting notes to the Meetings folder"
```

Available vault tools:
- `obsidian_vault_read` - Read note content
- `obsidian_vault_write` - Create or update notes
- `obsidian_vault_search` - Search vault content
- `obsidian_vault_list` - Browse folder contents
- `obsidian_get_active_note` - Get current note
- `obsidian_get_recent_files` - Get recently modified notes
- `obsidian_get_backlinks` - Get notes linking to a note

### MCP Tools

Kimi CLI supports [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) tools. Configure them via:

```bash
kimi mcp add --transport http my-server https://example.com/mcp
```

Or in the plugin settings, specify a custom MCP config file.

## ⌨️ Commands

Search for these commands in the Command Palette (`Cmd/Ctrl+P`):

| Command | Action |
|---------|--------|
| **Hakimi: Open Kimi Chat** | Open sidebar |
| **Hakimi: Ask Kimi about selection** | Send selected text to Kimi |
| **Hakimi: Summarize current note with Kimi** | Summarize active note |
| **Hakimi: Ask Kimi about current note** | Ask about active note |
| **Hakimi: New Kimi Chat** | Start fresh conversation |
| Right-click on selected text → "Ask Kimi" | Context menu action |

## ⚙️ Settings

### Authentication
- **API Key** - Optional fallback if not using `kimi login`

### MCP
- **Enable Vault MCP** - Allow Kimi to use vault tools
- **Allow Destructive Operations** - ⚠️ Allow overwrite/delete (disabled by default for safety)
- **MCP Config Path** - Custom MCP configuration file

### KimiCode Skills
- Skills are discovered natively by KimiCode
- Project-level skills: `YourVault/.kimi/skills`
- User-level skills: `~/.kimi/skills`
- This plugin does not implement its own skills runtime

### CLI
- **Kimi CLI Path** - Path to executable (auto-detected)
- **Working Directory** - Working dir for CLI

### UI
- **Auto Context** - Inject vault context automatically
- **Include Active Note** - Include current note in context
- **Auto-open on Startup** - Open sidebar when Obsidian starts

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Obsidian Desktop                  │
│  ┌───────────────────────────────────────────────┐  │
│  │                Hakimi Plugin                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │  │
│  │  │Sidebar  │  │  ACP    │  │ Vault MCP     │  │  │
│  │  │  (React)│◄─┤ Bridge  │◄─┤   Server      │  │  │
│  │  └────┬────┘  └────┬────┘  └───────────────┘  │  │
│  └───────┼────────────┼──────────────────────────┘  │
└──────────┼────────────┼─────────────────────────────┘
           │            │
           │    ┌───────┴───────┐
           │    │   kimi acp    │
           │    │  (ACP Server) │
           │    └───────┬───────┘
           │            │
    ┌──────┴────────────┴──────────────┐
    │           Kimi CLI                │
    │  ┌────────┐ ┌────────┐ ┌────────┐ │
    │  │ Agent  │ │ Skills │ │ MCP    │ │
    │  │ Runtime│ │ Engine │ │ Client │ │
    │  │        │ │        │ │        │ │
    │  └────────┘ └────────┘ └────────┘ │
    └───────────────────────────────────┘
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Moonshot AI](https://moonshot.cn/) for creating Kimi and Kimi CLI
- [Obsidian](https://obsidian.md/) for the amazing note-taking platform
- The MCP protocol for standardized tool integration

## 📧 Support

- GitHub Issues: Report bugs or request features (see repository)
- Discussions: Join the community (see repository)

> **Note:** Replace the placeholder repository URLs in manifest.json and README.md with your actual GitHub username before publishing.

---

**Enjoy using Kimi in Obsidian!** 🌙

---

<a name="中文"></a>
## 中文

[Hakimi](https://github.com/heswy/Hakimi) 是 Obsidian 的原生 [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) 集成插件。它作为 Obsidian 主机桥接 `kimi acp`：KimiCode 仍然是主要的 Agent 运行时，而插件提供 ACP 传输、Vault 感知上下文和 Obsidian MCP 工具。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15%2B-purple.svg)](https://obsidian.md)

## ✨ 功能特性

- 🤖 **KimiCode 原生 Agent** - 直接通过 ACP 连接到 `kimi acp`，KimiCode 负责规划、工具使用、技能和响应
- 📝 **Vault 感知对话** - Kimi 理解你的 Vault 结构，可以读取/组织笔记
- 🛠️ **原生技能发现** - 使用来自 `vault/.kimi/skills` 和 `~/.kimi/skills` 的 KimiCode 技能
- 🔌 **MCP 工具** - 通过模型上下文协议工具扩展功能
- 💬 **侧边栏界面** - 原生 Obsidian 侧边栏，无缝集成工作流
- 📎 **笔记附件** - 将当前活动笔记附加到对话中
- 🔍 **Vault 操作** - 通过自然语言创建、读取、更新、删除笔记
- 🎯 **上下文注入** - 自动注入 Vault 上下文，获得更智能的响应

## 📸 界面预览

> **注意：** 截图将在此处显示。上传 `docs/screenshot.png` 以展示界面。

![Hakimi 截图](https://via.placeholder.com/800x500/f3f4f6/666?text=Hakimi+截图+-+请上传+docs/screenshot.png)

*Hakimi 侧边栏界面，支持 Markdown 渲染*

## 📋 系统要求

- 已安装并认证 [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) (`kimi login`)
- Obsidian v0.15.0 或更高版本
- 仅桌面端（Windows、macOS、Linux）

## 🚀 安装方式

### 通过社区插件（即将推出）

1. 打开设置 → 社区插件
2. 搜索 "Hakimi"
3. 安装并启用

### 手动安装

1. 下载最新版本
2. 解压到 `YourVault/.obsidian/plugins/hakimi/`
3. 在设置 → 社区插件中启用

### 开发构建

```bash
git clone https://github.com/heswy/Hakimi.git
cd Hakimi
npm install
npm run build
```

## 🔧 设置指南

1. **安装 Kimi CLI**（如果尚未安装）：
   ```bash
   # macOS / Linux
   curl -LsSf https://code.kimi.com/install.sh | bash
   
   # 或使用 uv
   uv tool install --python 3.13 kimi-cli
   ```

2. **登录 Kimi**：
   ```bash
   kimi login
   # 跟随浏览器 OAuth 流程
   ```

3. **在 Obsidian 中打开 Kimi**：
   - 点击左侧边栏的 🌙 图标
   - 或使用命令面板 → "打开 Kimi 对话"

## 📖 使用说明

### 基础对话

直接输入消息并按回车键。Kimi 将以流式输出方式回复。

### 附加笔记

- 点击 📎 附加当前笔记
- Kimi 会将笔记内容纳入上下文
- 你可以附加多个笔记

### 使用技能

技能由 KimiCode 本身发现和管理，而不是由本插件管理。

支持的原生技能目录：
- `YourVault/.kimi/skills`（项目级）
- `~/.kimi/skills`（用户级）

这符合 KimiCode 标准的 `SKILL.md` 发现流程。你可以将 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) 等技能包直接安装到这些目录中。

### Vault 操作

Kimi 可以通过自然语言操作你的 Vault：

```
"创建一个名为'项目想法'的新笔记，包含功能列表"
"总结上周的每日笔记"
"查找所有提到'AI'的笔记并创建摘要"
"将所有会议笔记移动到'会议'文件夹"
```

可用的 Vault 工具：
- `obsidian_vault_read` - 读取笔记内容
- `obsidian_vault_write` - 创建或更新笔记
- `obsidian_vault_search` - 搜索 Vault 内容
- `obsidian_vault_list` - 浏览文件夹内容
- `obsidian_get_active_note` - 获取当前笔记
- `obsidian_get_recent_files` - 获取最近修改的笔记
- `obsidian_get_backlinks` - 获取链接到某笔记的所有笔记

### MCP 工具

Kimi CLI 支持 [MCP（模型上下文协议）](https://modelcontextprotocol.io/) 工具。通过以下方式配置：

```bash
kimi mcp add --transport http my-server https://example.com/mcp
```

或在插件设置中指定自定义 MCP 配置文件。

## ⌨️ 命令

在命令面板（`Cmd/Ctrl+P`）中搜索以下命令：

| 命令 | 操作 |
|---------|--------|
| **Hakimi: 打开 Kimi 对话** | 打开侧边栏 |
| **Hakimi: 让 Kimi 分析选中文本** | 将选中文本发送给 Kimi |
| **Hakimi: 让 Kimi 总结当前笔记** | 总结当前笔记 |
| **Hakimi: 让 Kimi 分析当前笔记** | 询问当前笔记 |
| **Hakimi: 新建 Kimi 对话** | 开始新的对话 |
| 右键选中文本 → "询问 Kimi" | 右键菜单操作 |

## ⚙️ 设置选项

### 认证
- **API Key** - 如果不使用 `kimi login` 的可选备用方案

### MCP
- **启用 Vault MCP** - 允许 Kimi 使用 Vault 工具
- **允许危险操作** - ⚠️ 允许覆盖/删除（默认禁用，安全起见）
- **MCP 配置路径** - 自定义 MCP 配置文件

### KimiCode 技能
- 技能由 KimiCode 原生发现
- 项目级技能：`YourVault/.kimi/skills`
- 用户级技能：`~/.kimi/skills`
- 本插件不实现自己的技能运行时

### CLI
- **Kimi CLI 路径** - 可执行文件路径（自动检测）
- **工作目录** - CLI 的工作目录

### 界面
- **自动上下文** - 自动注入 Vault 上下文
- **包含当前笔记** - 在上下文中包含当前笔记
- **启动时自动打开** - 启动 Obsidian 时打开侧边栏

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────┐
│                    Obsidian Desktop                  │
│  ┌───────────────────────────────────────────────┐  │
│  │                Hakimi Plugin                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │  │
│  │  │Sidebar  │  │  ACP    │  │ Vault MCP     │  │  │
│  │  │  (React)│◄─┤ Bridge  │◄─┤   Server      │  │  │
│  │  └────┬────┘  └────┬────┘  └───────────────┘  │  │
│  └───────┼────────────┼──────────────────────────┘  │
└──────────┼────────────┼─────────────────────────────┘
           │            │
           │    ┌───────┴───────┐
           │    │   kimi acp    │
           │    │  (ACP Server) │
           │    └───────┬───────┘
           │            │
    ┌──────┴────────────┴──────────────┐
    │           Kimi CLI                │
    │  ┌────────┐ ┌────────┐ ┌────────┐ │
    │  │ Agent  │ │ Skills │ │ MCP    │ │
    │  │ Runtime│ │ Engine │ │ Client │ │
    │  │        │ │        │ │        │ │
    │  └────────┘ └────────┘ └────────┘ │
    └───────────────────────────────────┘
```

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [Moonshot AI](https://moonshot.cn/) 创造了 Kimi 和 Kimi CLI
- [Obsidian](https://obsidian.md/) 提供了出色的笔记平台
- MCP 协议提供标准化的工具集成

## 📧 支持

- GitHub Issues：报告 Bug 或请求功能（见仓库）
- Discussions：加入社区讨论（见仓库）

---

**享受在 Obsidian 中使用 Kimi！** 🌙
