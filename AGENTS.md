# AGENTS.md - Hakimi Plugin

This document provides essential context for AI coding agents working on the **Hakimi** plugin.

## Project Overview

**Hakimi** is an Obsidian plugin that provides native integration with the Kimi CLI. It acts as an Obsidian host bridge for `kimi acp`, enabling vault-aware AI chat directly within Obsidian.

- **Type**: Obsidian Desktop Plugin (Desktop-only, requires Node.js spawn)
- **Language**: TypeScript + React
- **Build Tool**: esbuild
- **License**: MIT
- **Minimum Obsidian Version**: 0.15.0

### Key Architecture Principle

> **KimiCode remains the primary Agent runtime.**
> 
> This plugin provides:
> - ACP transport layer (JSON-RPC over stdio)
> - Vault-aware context injection
> - Obsidian MCP tools (vault operations)
> - Sidebar UI (React-based)
> 
> **It does NOT implement its own skills runtime.** Skills are discovered and managed natively by KimiCode from:
> - `YourVault/.kimi/skills` (project-level)
> - `~/.kimi/skills` (user-level)

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.9+ |
| UI Framework | React 18.2+ |
| Build Tool | esbuild 0.17.3 |
| Bundling | Single-file `main.js` output |
| Styling | CSS (Obsidian-compatible) |
| Protocol | ACP (Agent Communication Protocol) v0.10.8 |
| MCP | Model Context Protocol (@modelcontextprotocol/sdk) |

## Project Structure

```
obsidian-kimi/
├── src/
│   ├── main.ts                    # Plugin entry, Obsidian integration
│   ├── settings.ts                # Settings schema & defaults
│   ├── types.ts                   # TypeScript type definitions
│   ├── chat-history.ts            # Conversation persistence logic
│   ├── i18n.ts                    # Internationalization (en/zh)
│   ├── acp/
│   │   └── client.ts              # ACP JSON-RPC client (stdio)
│   ├── mcp/
│   │   └── vault-server.ts        # Vault MCP HTTP server + 9 tools
│   ├── ui/
│   │   ├── KimiChatView.tsx       # (deprecated, re-export from main.ts)
│   │   └── components/
│   │       ├── ChatPanel.tsx      # Main chat UI logic (1000+ lines)
│   │       ├── MessageList.tsx    # Message rendering with Markdown
│   │       ├── InputBox.tsx       # Input with @-mention, drag-drop
│   │       ├── ToolCallPanel.tsx  # Tool execution display
│   │       ├── HistoryPanel.tsx   # Conversation history sidebar
│   │       └── SkillsPanel.tsx    # Skills info panel
│   └── utils/
│       └── security.ts            # Path validation & security
├── styles.css                     # Plugin styles (13KB+)
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # NPM dependencies
├── tsconfig.json                  # TypeScript config
├── esbuild.config.mjs             # Build configuration
└── version-bump.mjs               # Version bump script
```

## Build Commands

```bash
# Development (watch mode)
npm run dev

# Production build (type-check + bundle)
npm run build

# Version bump (updates manifest.json + versions.json)
npm run version
```

### Build Output

The build produces a single bundled file:
- `main.js` (~2MB) - Contains all code + React + dependencies
- `styles.css` - Must be distributed alongside main.js
- `manifest.json` - Plugin metadata

## Code Style Guidelines

### TypeScript

- Target: ES2018
- Module: ESNext
- Strict null checks enabled
- Use explicit types for public APIs
- Private methods prefixed with `_` (optional)

### React

- Functional components with hooks
- Use `React.useMemo` for expensive computations
- Use `React.useCallback` for event handlers passed to children
- Event refs for cleanup tracking (e.g., `isComposingRef`)

### Naming Conventions

- Components: PascalCase (e.g., `ChatPanel.tsx`)
- Utilities: camelCase (e.g., `sanitizeMessagesForStorage`)
- Constants: UPPER_SNAKE_CASE for true constants
- Types/Interfaces: PascalCase with descriptive names

### Comments

- Use Chinese comments for implementation details (existing codebase convention)
- Use JSDoc for public API documentation
- Complex regex or parsing logic should have explanatory comments

## Key Implementation Details

### ACP Protocol Flow

```
1. spawn('kimi', ['acp'])
2. → initialize (JSON-RPC request)
3. ← initialize response (protocol_version, capabilities)
4. → session/new (with MCP servers)
5. ← sessionId
6. → session/prompt (user message)
7. ← session/update (streaming response)
8. → [session/request_permission auto-approved]
9. ← message_complete
```

### Vault MCP Tools (9 total)

| Tool | Description | Risk Level |
|------|-------------|------------|
| `obsidian_vault_read` | Read note content | Low |
| `obsidian_vault_write` | Create/modify notes | High (configurable) |
| `obsidian_vault_append` | Append to note | Medium |
| `obsidian_vault_list` | List directory | Low |
| `obsidian_vault_search` | Search vault content | Low |
| `obsidian_vault_delete` | Delete notes | High (configurable) |
| `obsidian_get_active_note` | Get current note | Low |
| `obsidian_get_recent_files` | Get recent files | Low |
| `obsidian_get_backlinks` | Get backlink info | Low |

### Security Model

**Allowed file extensions**: `.md`, `.txt`, `.markdown`

**Sensitive path patterns** (blocked):
- `.obsidian/` - Obsidian config
- `.git/` - Git directory
- `.kimi/` - Kimi config
- `node_modules/` - Dependencies
- Hidden files/directories (starting with `.`)
- Path traversal (`..`)

**Destructive operations** (`write` to existing file, `delete`):
- Default: BLOCKED (returns error)
- Enable via Settings → "Allow Destructive Operations"
- Must be explicitly enabled per-vault

### Conversation Persistence

- Stored per-vault (up to 50 conversations per vault)
- Key: Vault base path or vault name
- Auto-saves every 240ms after message changes
- Sanitizes internal fields (`_rawContent`, `_splitDetected`, etc.)
- Session resumption supported if `sessionId` is preserved

### Internationalization

- Supported locales: `en`, `zh`
- Auto-detected from Obsidian language setting
- All UI strings in `src/i18n.ts`
- Add new strings to both `en` and `zh` sections

## Testing Strategy

**Current State**: No automated tests for source code.

**Manual Testing Checklist**:
1. Build passes: `npm run build`
2. Plugin loads in Obsidian without errors
3. ACP connects (check status indicator)
4. Send message, receive streaming response
5. Tool calls display correctly
6. Note attachment via @-mention works
7. Drag-drop notes works
8. History save/load works
9. Settings changes persist
10. Reconnect button works after disconnect

**Test Commands**:
```bash
# Basic validation
npm run build

# Verify files exist
ls -la main.js manifest.json styles.css
```

## Common Issues & Solutions

### "Kimi CLI not found"
- Verify `kimi` in PATH: `which kimi`
- Check settings → "Kimi CLI Path"
- Ensure `kimi login` has been run

### Connection fails after sleep/resume
- Click status indicator or "Reconnect" button
- Auto-reconnection is implemented but may need manual trigger

### IME input issues (Chinese/Japanese/Korean)
- InputBox handles `compositionstart`/`compositionend`
- Enter during composition does NOT send (expected behavior)

### Large vault performance
- Search scans max 1000 files
- Auto-context only includes recent 5 files
- Consider disabling "Include Recent Files" for very large vaults

## Development Workflow

1. **Setup**: `npm install`
2. **Develop**: `npm run dev` (watch mode)
3. **Copy to vault**:
   ```bash
   cp main.js manifest.json styles.css "~/YourVault/.obsidian/plugins/obsidian-kimi/"
   ```
4. **Reload**: In Obsidian, Ctrl/Cmd+P → "Reload app without saving"
5. **Iterate**: Changes auto-compile, need reload to apply

## Security Considerations

1. **Never** commit `data.json` (contains settings, ignored in .gitignore)
2. **Never** log API keys or sensitive paths
3. **Always** validate paths through `security.ts` functions
4. **Always** check `allowDestructiveOperations` before write/delete
5. **Review** MCP server configurations loaded from external files

## Dependencies to Update Carefully

- `obsidian` - API may change between versions
- `@modelcontextprotocol/sdk` - Protocol breaking changes possible
- `esbuild` - Build output sensitive to version

## Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | User-facing documentation (English) |
| `INSTALL.md` | Installation instructions |
| `DELIVERY.md` | Feature completeness checklist |
| `CODEREVIEW_FIXES.md` | Security fixes history (Chinese) |
| `Codex_review_suggestion.md` | Code review findings (Chinese) |

## Contact & Contributing

- This is a community plugin for Obsidian + Kimi
- Follow existing code patterns when adding features
- Ensure i18n strings added for both languages
- Test on desktop (macOS/Windows/Linux) before submitting

---

*Last updated: 2026-04-05*
*Maintainers: Update this doc when architecture changes significantly*
