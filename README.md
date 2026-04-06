# 🌙 Hakimi

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

```
┌─────────────────────────────────────────────────────────────────┐
│  📁 File Explorer  │  📄 Main Note Area        │  🌙 Kimi Chat   │
│                    │                            │   (Sidebar)    │
│  Note A.md         │  # Project Ideas           │  ┌──────────┐  │
│  Note B.md         │                            │  │ 👤 You   │  │
│  ...               │  - Feature 1               │  │ 帮我想想   │  │
│                    │  - Feature 2               │  │ 这个项目   │  │
│                    │                            │  ├──────────┤  │
│                    │                            │  │ 🤖 Kimi  │  │
│                    │                            │  │ 这是几个   │  │
│                    │                            │  │ 想法...   │  │
│                    │                            │  │ 1. ...    │  │
│                    │                            │  ├──────────┤  │
│                    │                            │  │ [输入框]  │  │
└─────────────────────────────────────────────────────────────────┘
```

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

| Command | Action |
|---------|--------|
| `Cmd/Ctrl+P` → "Open Kimi Chat" | Open sidebar |
| `Cmd/Ctrl+P` → "Ask Kimi about selection" | Send selected text to Kimi |
| `Cmd/Ctrl+P` → "Summarize current note" | Summarize active note |
| `Cmd/Ctrl+P` → "Ask Kimi about current note" | Ask about active note |
| `Cmd/Ctrl+P` → "New Kimi Chat" | Start fresh conversation |
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
