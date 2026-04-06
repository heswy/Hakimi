# 🚀 Installation Guide

## Quick Install

### Option 1: Manual Installation (Recommended for now)

1. **Download the plugin files** from the release or build from source

2. **Create plugin folder** in your Obsidian vault:
   ```bash
   mkdir -p "YourVault/.obsidian/plugins/obsidian-kimi"
   ```

3. **Copy files** to the plugin folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`

4. **Enable in Obsidian**:
   - Open Settings → Community Plugins
   - Turn off "Safe Mode" if enabled
   - Enable "Hakimi"

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/heswy/Hakimi.git
cd Hakimi

# Install dependencies
npm install

# Build
npm run build

# Copy to your vault
cp main.js manifest.json styles.css "~/YourVault/.obsidian/plugins/obsidian-kimi/"
```

## Prerequisites

### 1. Install Kimi CLI

**macOS / Linux:**
```bash
curl -LsSf https://code.kimi.com/install.sh | bash
```

**Or using uv:**
```bash
uv tool install --python 3.13 kimi-cli
```

**Windows:**
```powershell
Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression
```

### 2. Authenticate

```bash
kimi login
```

Follow the browser OAuth flow to authenticate.

### 3. Verify Installation

```bash
kimi --version
# Should output: kimi, version x.x.x

kimi info
# Should show your authentication status
```

## First Use

1. **Open Obsidian**
2. **Enable the plugin** (if not already)
3. **Click the 🌙 icon** in the left ribbon
4. **Start chatting!**

## Troubleshooting

### "Kimi CLI not found"

Make sure `kimi` is in your PATH:
```bash
which kimi
# Should show path like /Users/you/.local/bin/kimi
```

If not, add to your shell profile:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### "Not authenticated"

Run in terminal:
```bash
kimi login
```

Then reload the plugin or restart Obsidian.

### "Connection failed"

1. Check Kimi CLI is working: `kimi info`
2. Check plugin settings for correct CLI path
3. Try "Reconnect" button in settings

### Build errors

Make sure you have Node.js 16+:
```bash
node --version
```

## Files Overview

```
YourVault/.obsidian/plugins/obsidian-kimi/
├── main.js          # Plugin code (required)
├── manifest.json    # Plugin manifest (required)
├── styles.css       # Styles (required)
└── data.json        # Settings (auto-generated)
```

## Development Mode

For development with hot-reload:

```bash
npm run dev
```

This watches for changes and rebuilds automatically.
