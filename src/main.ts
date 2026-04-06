import { 
  App, 
  Editor, 
  ItemView, 
  MarkdownView, 
  Menu, 
  Notice, 
  Plugin, 
  PluginSettingTab, 
  Setting, 
  TFile,
  WorkspaceLeaf,
  addIcon 
} from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ALLOWED_EXTENSIONS } from './utils/security';
import * as React from 'react';
import { ACPClient } from './acp/client';
import { VaultMCPServer } from './mcp/vault-server';
import { ChatPanel } from './ui/components/ChatPanel';
import { ObsidianKimiSettings, DEFAULT_SETTINGS } from './settings';
import { getLocalizedStrings } from './i18n';
import {
  type ChatMessage,
  type ConversationsByVault,
  type StoredConversation,
  cloneConversation,
  normalizeConversationStore,
  sanitizeMessagesForStorage,
} from './chat-history';

// 自定义图标
const HAKIMI_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 6v6l4 2"/>
  <path d="M8 14c1.5 2 4.5 2 6 0"/>
</svg>
`;

export const VIEW_TYPE_KIMI_CHAT = 'kimi-chat-view';

interface ObsidianKimiPluginData {
  settings?: Partial<ObsidianKimiSettings>;
  conversationsByVault?: ConversationsByVault;
  [key: string]: unknown;
}

// React 根组件挂载器
export class ChatView extends ItemView {
  private root: Root | null = null;
  plugin: ObsidianKimiPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianKimiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_KIMI_CHAT;
  }

  getDisplayText(): string {
    return getLocalizedStrings().plugin.viewTitle;
  }

  getIcon(): string {
    return 'kimi-icon';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('kimi-chat-view');
    
    this.root = createRoot(container);
    this.root.render(
      React.createElement(ChatPanel, {
        plugin: this.plugin,
        app: this.app
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

export default class ObsidianKimiPlugin extends Plugin {
  settings: ObsidianKimiSettings;
  acpClient: ACPClient;
  vaultServer: VaultMCPServer;
  private chatView: ChatView | null = null;
  private conversationsByVault: ConversationsByVault = {};

  async onload() {
    const strings = getLocalizedStrings();
    await this.loadSettings();

    // 注册自定义图标
    addIcon('kimi-icon', HAKIMI_ICON);

    // 初始化核心组件
    this.vaultServer = new VaultMCPServer(this.app, () => this.settings);
    this.acpClient = new ACPClient(this);

    // 注册侧边栏视图
    this.registerView(
      VIEW_TYPE_KIMI_CHAT,
      (leaf) => {
        this.chatView = new ChatView(leaf, this);
        return this.chatView;
      }
    );

    // Ribbon 图标
    this.addRibbonIcon('kimi-icon', strings.plugin.ribbonTitle, (evt: MouseEvent) => {
      if (evt.button === 2) {
        // 右键菜单
        this.showContextMenu(evt);
      } else {
        this.activateView();
      }
    });

    // 命令面板
    this.addCommand({
      id: 'open-hakimi-chat',
      name: strings.commands.openChat,
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'ask-hakimi-selection',
      name: strings.commands.askSelection,
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();
        if (selection) {
          this.activateView();
          setTimeout(() => {
            this.acpClient.sendMessage(strings.prompts.selectionAnalysis(selection));
          }, 500);
        } else {
          new Notice(strings.notices.selectTextFirst);
        }
      }
    });

    this.addCommand({
      id: 'summarize-current-note',
      name: strings.commands.summarizeNote,
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice(strings.notices.openNoteFirst);
          return;
        }
        
        // 检查文件扩展名
        const ext = '.' + activeFile.extension.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          new Notice(strings.notices.fileTypeNotAllowedSummarize(ext, ALLOWED_EXTENSIONS));
          return;
        }
        
        const content = await this.app.vault.read(activeFile);
        this.activateView();
        setTimeout(() => {
          this.acpClient.sendMessage(strings.prompts.summarizeNote(activeFile.path, content.substring(0, this.settings.maxSummarizeLength)));
        }, 500);
      }
    });

    this.addCommand({
      id: 'ask-hakimi-about-note',
      name: strings.commands.askAboutNote,
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice(strings.notices.openNoteFirst);
          return;
        }
        
        // 检查文件扩展名
        const ext = '.' + activeFile.extension.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          new Notice(strings.notices.fileTypeNotAllowedAnalyze(ext, ALLOWED_EXTENSIONS));
          return;
        }
        
        const content = await this.app.vault.read(activeFile);
        this.activateView();
        setTimeout(() => {
          this.acpClient.sendMessage(strings.prompts.analyzeCurrentNote(activeFile.path, content.substring(0, this.settings.maxSummarizeLength)));
        }, 500);
      }
    });

    this.addCommand({
      id: 'new-hakimi-chat',
      name: strings.commands.newChat,
      callback: () => {
        this.activateView();
        // 通知 ChatPanel 清空会话
        this.app.workspace.trigger('hakimi:new-chat');
      }
    });

    // 编辑器右键菜单
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        menu.addItem((item) => {
          item
            .setTitle(strings.commands.askKimi)
            .setIcon('kimi-icon')
            .onClick(async () => {
              const selection = editor.getSelection();
              if (selection) {
                this.activateView();
                setTimeout(() => {
                  this.acpClient.sendMessage(strings.prompts.quickAskSelection(selection));
                }, 500);
              }
            });
        });
      })
    );

    // 文件浏览器右键菜单
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle(strings.commands.askKimiAboutThisNote)
              .setIcon('kimi-icon')
              .onClick(async () => {
                const content = await this.app.vault.read(file);
                this.activateView();
                setTimeout(() => {
                  this.acpClient.sendMessage(strings.prompts.analyzeNoteFromMenu(file.path, content.substring(0, this.settings.maxSummarizeLength)));
                }, 500);
              });
          });
        }
      })
    );

    // 设置面板
    this.addSettingTab(new HakimiSettingTab(this.app, this));

    // 布局就绪后自动打开（如果之前是打开的）
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoOpenOnStartup) {
        this.activateView();
      }
    });

    console.log(strings.plugin.loaded);
  }

  onunload() {
    this.acpClient?.disconnect();
    void this.vaultServer?.stop();
    console.log(getLocalizedStrings().plugin.unloaded);
  }

  async loadSettings() {
    const rawData = ((await this.loadData()) || {}) as ObsidianKimiPluginData & Partial<ObsidianKimiSettings>;
    const { conversationsByVault, settings, ...legacySettings } = rawData;
    const settingsSource = settings && typeof settings === 'object'
      ? rawData.settings
      : legacySettings;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsSource);
    this.conversationsByVault = normalizeConversationStore(conversationsByVault);
    
    // 自动检测 Kimi CLI 路径（如果当前设置不可用）
    await this.autoDetectKimiPath();
  }

  /**
   * 自动检测 Kimi CLI 路径
   * 在常见安装位置搜索 kimi 可执行文件
   */
  private async autoDetectKimiPath(): Promise<void> {
    const currentPath = this.settings.kimiPath || 'kimi';
    
    // 如果已经设置了完整路径，跳过检测
    if (currentPath.includes('/') || currentPath.includes('\\')) {
      return;
    }

    const { access, constants } = require('fs/promises');
    const { join } = require('path');
    const { homedir } = require('os');
    const { spawn } = require('child_process');
    
    const home = homedir();
    const searchPaths = [
      // uv 工具安装路径
      join(home, '.local/bin/kimi'),
      join(home, '.local/share/uv/tools/kimi-cli/bin/kimi'),
      // Homebrew
      '/opt/homebrew/bin/kimi',
      '/usr/local/bin/kimi',
      // Linux 标准路径
      '/usr/bin/kimi',
      '/bin/kimi',
      // pipx
      join(home, '.local/pipx/venvs/kimi-cli/bin/kimi'),
    ];

    for (const testPath of searchPaths) {
      try {
        await access(testPath, constants.X_OK);
        // 验证是否可以执行（获取版本）
        const version = await new Promise<string | null>((resolve) => {
          const proc = spawn(testPath, ['--version'], { shell: false });
          let stdout = '';
          proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
          proc.on('close', (code: number) => { resolve(code === 0 ? stdout.trim() : null); });
          proc.on('error', () => resolve(null));
        });
        
        if (version) {
          console.log(`[Hakimi] Auto-detected Kimi CLI at: ${testPath}`);
          this.settings.kimiPath = testPath;
          return;
        }
      } catch {
        // 路径不存在或不可执行，继续下一个
      }
    }
  }

  async saveSettings() {
    await this.persistData();
  }

  private async persistData() {
    await this.saveData({
      settings: this.settings,
      conversationsByVault: this.conversationsByVault,
    });
  }

  getVaultConversationKey(): string {
    const basePath = (this.app.vault.adapter as any).basePath;
    return basePath || this.app.vault.getName();
  }

  getCurrentVaultConversations(): StoredConversation[] {
    return (this.conversationsByVault[this.getVaultConversationKey()] || []).map(cloneConversation);
  }

  getConversationForCurrentVault(id: string): StoredConversation | null {
    const conversation = this.getCurrentVaultConversations().find((item) => item.id === id);
    return conversation || null;
  }

  async upsertConversationForCurrentVault(
    conversation: Pick<StoredConversation, 'title' | 'preview' | 'messages'> &
      Partial<Pick<StoredConversation, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>>
  ): Promise<StoredConversation> {
    const vaultKey = this.getVaultConversationKey();
    const existingConversations = this.conversationsByVault[vaultKey] || [];
    const existingConversation = conversation.id
      ? existingConversations.find((item) => item.id === conversation.id)
      : undefined;
    const now = Date.now();
    const nextConversation: StoredConversation = {
      id: conversation.id || `conv-${now}`,
      sessionId: conversation.sessionId || existingConversation?.sessionId,
      title: conversation.title,
      preview: conversation.preview,
      createdAt: existingConversation?.createdAt || conversation.createdAt || now,
      updatedAt: conversation.updatedAt || now,
      messages: sanitizeMessagesForStorage(conversation.messages as ChatMessage[]),
    };

    const nextConversations = existingConversations
      .filter((item) => item.id !== nextConversation.id)
      .concat(nextConversation)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, this.settings.maxConversationsPerVault);

    this.conversationsByVault = {
      ...this.conversationsByVault,
      [vaultKey]: nextConversations,
    };

    await this.persistData();
    this.app.workspace.trigger('hakimi:history-updated');
    return cloneConversation(nextConversation);
  }

  async deleteConversationForCurrentVault(id: string): Promise<void> {
    const vaultKey = this.getVaultConversationKey();
    const nextConversations = (this.conversationsByVault[vaultKey] || []).filter(
      (conversation) => conversation.id !== id
    );

    this.conversationsByVault = {
      ...this.conversationsByVault,
      [vaultKey]: nextConversations,
    };

    await this.persistData();
    this.app.workspace.trigger('hakimi:history-updated');
  }

  async clearCurrentVaultConversations(): Promise<void> {
    const vaultKey = this.getVaultConversationKey();
    this.conversationsByVault = {
      ...this.conversationsByVault,
      [vaultKey]: [],
    };
    await this.persistData();
    this.app.workspace.trigger('hakimi:history-updated');
  }

  async clearAllConversations(): Promise<void> {
    this.conversationsByVault = {};
    await this.persistData();
    this.app.workspace.trigger('hakimi:history-updated');
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_KIMI_CHAT)[0];
    if (!leaf) {
      // 在右侧创建
      const newLeaf = workspace.getRightLeaf(false);
      if (!newLeaf) {
        new Notice(getLocalizedStrings().plugin.activateViewFailed);
        return;
      }
      leaf = newLeaf;
      await leaf.setViewState({ type: VIEW_TYPE_KIMI_CHAT, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  private showContextMenu(evt: MouseEvent) {
    const strings = getLocalizedStrings();
    const menu = new Menu();
    
    menu.addItem((item) => {
      item
        .setTitle(strings.commands.contextMenuNewChat)
        .setIcon('plus')
        .onClick(() => {
          this.app.workspace.trigger('hakimi:new-chat');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(strings.commands.contextMenuSettings)
        .setIcon('gear')
        .onClick(() => {
          // @ts-ignore
          this.app.setting.open();
          // @ts-ignore
          this.app.setting.openTabById(this.manifest.id);
        });
    });

    menu.showAtMouseEvent(evt);
  }
}

class HakimiSettingTab extends PluginSettingTab {
  plugin: ObsidianKimiPlugin;

  constructor(app: App, plugin: ObsidianKimiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const strings = getLocalizedStrings();
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('kimi-settings-page');

    containerEl.createEl('h2', { text: strings.plugin.appName });
    containerEl.createEl('p', { text: strings.settings.pageIntro, cls: 'kimi-settings-lead' });

    this.renderAuthenticationSection(containerEl);
    this.renderChatDefaultsSection(containerEl);
    this.renderVaultAccessSection(containerEl);
    this.renderHistorySection(containerEl);
    this.renderContextLimitsSection(containerEl);
    this.renderSearchLimitsSection(containerEl);
    this.renderThinkingSection(containerEl);
    this.renderMaintenanceSection(containerEl);
    this.renderAdvancedSection(containerEl);
  }

  private createSection(container: HTMLElement, title: string, description?: string): HTMLElement {
    const section = container.createDiv('kimi-settings-section');
    const header = section.createDiv('kimi-settings-section-header');
    header.createEl('h3', { text: title, cls: 'kimi-settings-section-title' });
    if (description) {
      header.createEl('p', { text: description, cls: 'kimi-settings-section-desc' });
    }

    return section.createDiv('kimi-settings-section-body');
  }

  private renderAuthenticationSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.authentication);

    new Setting(body)
      .setName(strings.settings.apiProvider)
      .setDesc(strings.settings.apiProviderDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('hakimi-code', strings.settings.providerKimiCode)
          .addOption('moonshot-cn', strings.settings.providerMoonshotCn)
          .addOption('moonshot-ai', strings.settings.providerMoonshotAi)
          .setValue(this.plugin.settings.apiProvider)
          .onChange(async (value) => {
            this.plugin.settings.apiProvider = value as typeof this.plugin.settings.apiProvider;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(body)
      .setName(strings.settings.apiKeyOptional)
      .setDesc(strings.settings.apiKeyDesc)
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.addEventListener('blur', () => this.display());
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  private renderVaultAccessSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.mcpTools);

    new Setting(body)
      .setName(strings.settings.enableVaultMcp)
      .setDesc(strings.settings.enableVaultMcpDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableVaultMCP).onChange(async (value) => {
          this.plugin.settings.enableVaultMCP = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(body)
      .setName(strings.settings.allowDestructive)
      .setDesc(strings.settings.allowDestructiveDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowDestructiveOperations).onChange(async (value) => {
          this.plugin.settings.allowDestructiveOperations = value;
          await this.plugin.saveSettings();
          new Notice(value ? strings.notices.destructiveEnabled : strings.notices.destructiveDisabled);
          this.display();
        })
      );
  }

  private renderChatDefaultsSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.uiSettings);

    let includeActiveNoteSetting: Setting | null = null;
    let includeRecentFilesSetting: Setting | null = null;

    const syncContextDependents = () => {
      const disabled = !this.plugin.settings.autoContext;
      includeActiveNoteSetting?.settingEl.toggleClass('is-disabled', disabled);
      includeRecentFilesSetting?.settingEl.toggleClass('is-disabled', disabled);

      const activeToggle = includeActiveNoteSetting?.controlEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const recentToggle = includeRecentFilesSetting?.controlEl.querySelector<HTMLInputElement>('input[type="checkbox"]');

      if (activeToggle) activeToggle.disabled = disabled;
      if (recentToggle) recentToggle.disabled = disabled;
    };

    new Setting(body)
      .setName(strings.settings.autoContext)
      .setDesc(strings.settings.autoContextDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoContext).onChange(async (value) => {
          this.plugin.settings.autoContext = value;
          await this.plugin.saveSettings();
          syncContextDependents();
        })
      );

    includeActiveNoteSetting = new Setting(body)
      .setName(strings.settings.includeActiveNote)
      .setDesc(strings.settings.includeActiveNoteDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeActiveNote).onChange(async (value) => {
          this.plugin.settings.includeActiveNote = value;
          await this.plugin.saveSettings();
        })
      );

    includeRecentFilesSetting = new Setting(body)
      .setName(strings.settings.includeRecentFiles)
      .setDesc(strings.settings.includeRecentFilesDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeRecentFiles).onChange(async (value) => {
          this.plugin.settings.includeRecentFiles = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(body)
      .setName(strings.settings.autoOpenOnStartup)
      .setDesc(strings.settings.autoOpenOnStartupDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoOpenOnStartup).onChange(async (value) => {
          this.plugin.settings.autoOpenOnStartup = value;
          await this.plugin.saveSettings();
        })
      );

    // 最近文件数量设置
    new Setting(body)
      .setName(strings.settings.recentFilesCount)
      .setDesc(strings.settings.recentFilesCountDesc)
      .addSlider((slider) =>
        slider
          .setLimits(0, 20, 1)
          .setValue(this.plugin.settings.recentFilesCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.recentFilesCount = value;
            await this.plugin.saveSettings();
          })
      );

    syncContextDependents();
  }

  private renderHistorySection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.historySettings, strings.settings.historySettingsDesc);

    new Setting(body)
      .setName(strings.settings.maxConversationsPerVault)
      .setDesc(strings.settings.maxConversationsPerVaultDesc)
      .addSlider((slider) =>
        slider
          .setLimits(10, 200, 10)
          .setValue(this.plugin.settings.maxConversationsPerVault)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxConversationsPerVault = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderContextLimitsSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.contextLimits, strings.settings.contextLimitsDesc);

    new Setting(body)
      .setName(strings.settings.maxActiveNoteLength)
      .setDesc(strings.settings.maxActiveNoteLengthDesc)
      .addSlider((slider) =>
        slider
          .setLimits(1000, 20000, 1000)
          .setValue(this.plugin.settings.maxActiveNoteLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxActiveNoteLength = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(body)
      .setName(strings.settings.maxAttachmentLength)
      .setDesc(strings.settings.maxAttachmentLengthDesc)
      .addSlider((slider) =>
        slider
          .setLimits(1000, 50000, 1000)
          .setValue(this.plugin.settings.maxAttachmentLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxAttachmentLength = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(body)
      .setName(strings.settings.maxSummarizeLength)
      .setDesc(strings.settings.maxSummarizeLengthDesc)
      .addSlider((slider) =>
        slider
          .setLimits(10000, 100000, 5000)
          .setValue(this.plugin.settings.maxSummarizeLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxSummarizeLength = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderSearchLimitsSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.searchLimits, strings.settings.searchLimitsDesc);

    new Setting(body)
      .setName(strings.settings.maxSearchFiles)
      .setDesc(strings.settings.maxSearchFilesDesc)
      .addSlider((slider) =>
        slider
          .setLimits(100, 5000, 100)
          .setValue(this.plugin.settings.maxSearchFiles)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxSearchFiles = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(body)
      .setName(strings.settings.maxMentionResults)
      .setDesc(strings.settings.maxMentionResultsDesc)
      .addSlider((slider) =>
        slider
          .setLimits(5, 20, 1)
          .setValue(this.plugin.settings.maxMentionResults)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxMentionResults = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderThinkingSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.thinkingSettings, strings.settings.thinkingSettingsDesc);

    new Setting(body)
      .setName(strings.settings.showThinking)
      .setDesc(strings.settings.showThinkingDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showThinking).onChange(async (value) => {
          this.plugin.settings.showThinking = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(body)
      .setName(strings.settings.maxThinkingExportLength)
      .setDesc(strings.settings.maxThinkingExportLengthDesc)
      .addSlider((slider) =>
        slider
          .setLimits(50, 500, 50)
          .setValue(this.plugin.settings.maxThinkingExportLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxThinkingExportLength = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderMaintenanceSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const body = this.createSection(container, strings.settings.maintenance, strings.settings.maintenanceDesc);
    const currentVaultName = this.app.vault.getName();

    // 当前仓库信息
    new Setting(body)
      .setName(strings.settings.currentVaultHistory(currentVaultName))
      .setDesc('')
      .setDisabled(true);

    new Setting(body)
      .setName(strings.settings.connection)
      .setDesc(strings.settings.connectionDesc)
      .addButton((button) =>
        button.setButtonText(strings.settings.reconnect).setCta().onClick(async () => {
          new Notice(strings.notices.reconnecting);
          const ok = await this.plugin.acpClient.reconnect();
          new Notice(ok ? strings.notices.reconnected : strings.notices.reconnectionFailedCheck);
        })
      );

    new Setting(body)
      .setName(strings.settings.clearCurrentHistory)
      .setDesc(strings.settings.clearCurrentHistoryDesc(currentVaultName))
      .addButton((button) => {
        button.setButtonText(strings.settings.clearAction);
        button.buttonEl.addClass('mod-warning');
        button.onClick(async () => {
          if (!window.confirm(strings.settings.clearCurrentHistoryConfirm(currentVaultName))) {
            return;
          }
          await this.plugin.clearCurrentVaultConversations();
          new Notice(strings.settings.clearCurrentHistoryDone(currentVaultName));
        });
      });

    new Setting(body)
      .setName(strings.settings.clearAllHistory)
      .setDesc(strings.settings.clearAllHistoryDesc)
      .addButton((button) => {
        button.setButtonText(strings.settings.clearAction);
        button.buttonEl.addClass('mod-warning');
        button.onClick(async () => {
          if (!window.confirm(strings.settings.clearAllHistoryConfirm)) {
            return;
          }
          await this.plugin.clearAllConversations();
          new Notice(strings.settings.clearAllHistoryDone);
        });
      });
  }

  private renderAdvancedSection(container: HTMLElement): void {
    const strings = getLocalizedStrings();
    const details = container.createEl('details', { cls: 'kimi-settings-collapsible kimi-settings-section' });
    details.createEl('summary', { text: strings.settings.advanced, cls: 'kimi-settings-collapsible-summary' });
    const body = details.createDiv('kimi-settings-section-body');
    body.createEl('p', { text: strings.settings.advancedDesc, cls: 'kimi-settings-inline-note' });

    // CLI 版本信息（只读）
    const cliVersionSetting = new Setting(body)
      .setName(strings.settings.statusCliLabel)
      .setDesc('...')
      .setDisabled(true);
    void this.populateCliVersionSetting(cliVersionSetting);

    new Setting(body)
      .setName(strings.settings.kimiCliPath)
      .setDesc(strings.settings.kimiCliPathDesc)
      .addText((text) => {
        text.inputEl.addEventListener('blur', () => this.display());
        text.setPlaceholder('kimi').setValue(this.plugin.settings.kimiPath).onChange(async (value) => {
          this.plugin.settings.kimiPath = value.trim() || 'kimi';
          await this.plugin.saveSettings();
        });
      });

    new Setting(body)
      .setName(strings.settings.workingDirectory)
      .setDesc(strings.settings.workingDirectoryDesc)
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getRoot().path)
          .setValue(this.plugin.settings.workingDirectory)
          .onChange(async (value) => {
            this.plugin.settings.workingDirectory = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(body)
      .setName(strings.settings.mcpConfigPath)
      .setDesc(strings.settings.mcpConfigPathDesc)
      .addText((text) =>
        text.setPlaceholder('~/.kimi/mcp.json').setValue(this.plugin.settings.mcpConfigPath).onChange(async (value) => {
          this.plugin.settings.mcpConfigPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(body)
      .setName(strings.settings.debugMode)
      .setDesc(strings.settings.debugModeDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private async populateCliVersionSetting(setting: Setting): Promise<void> {
    const strings = getLocalizedStrings();
    const kimiPath = this.plugin.settings.kimiPath || 'kimi';
    const version = await this.getCliVersion(kimiPath);

    if (!version) {
      setting.setDesc(strings.settings.cliNotFound(kimiPath) + ' · ' + strings.settings.installHint);
      setting.descEl?.addClass('is-error');
      return;
    }

    const compactVersion = version.replace(/^kimi,\s*version\s*/i, 'v');
    setting.setDesc(compactVersion);
    setting.descEl?.addClass('is-ok');
  }

  private async getCliVersion(kimiPath: string): Promise<string | null> {
    try {
      const { spawn } = require('child_process');

      return await new Promise((resolve) => {
        const proc = spawn(kimiPath, ['--version'], { shell: false });
        let stdout = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.on('close', (code: number) => {
          resolve(code === 0 ? stdout.trim() : null);
        });

        proc.on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }

  private getProviderLabel(): string {
    const strings = getLocalizedStrings();
    switch (this.plugin.settings.apiProvider) {
      case 'hakimi-code':
        return strings.settings.providerKimiCode;
      case 'moonshot-ai':
        return strings.settings.providerMoonshotAi;
      case 'moonshot-cn':
      default:
        return strings.settings.providerMoonshotCn;
    }
  }

  private stateLabel(enabled: boolean): string {
    const strings = getLocalizedStrings();
    return enabled ? strings.settings.stateOn : strings.settings.stateOff;
  }

  private getContextSummary(): string {
    const strings = getLocalizedStrings();

    if (!this.plugin.settings.autoContext) {
      return strings.settings.stateOff;
    }

    const enabledParts = [
      this.plugin.settings.includeActiveNote ? strings.settings.includeActiveNote : null,
      this.plugin.settings.includeRecentFiles ? strings.settings.includeRecentFiles : null,
      this.plugin.settings.autoOpenOnStartup ? strings.settings.autoOpenOnStartup : null,
    ].filter(Boolean);

    return enabledParts.length > 0 ? enabledParts.join(' · ') : strings.settings.stateOn;
  }
}
