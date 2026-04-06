export type KimiApiProvider = 'hakimi-code' | 'moonshot-cn' | 'moonshot-ai';

export interface ObsidianKimiSettings {
  // API
  apiKey: string;
  apiProvider: KimiApiProvider;
  
  // MCP
  enableVaultMCP: boolean;
  allowDestructiveOperations: boolean;
  mcpConfigPath: string;
  
  // CLI
  kimiPath: string;
  workingDirectory: string;
  
  // UI
  autoContext: boolean;
  includeActiveNote: boolean;
  includeRecentFiles: boolean;
  autoOpenOnStartup: boolean;
  
  // History
  maxConversationsPerVault: number;
  
  // Context Limits
  maxActiveNoteLength: number;
  maxAttachmentLength: number;
  maxSummarizeLength: number;
  
  // Search Limits
  maxSearchFiles: number;
  recentFilesCount: number;
  maxMentionResults: number;
  
  // Thinking
  showThinking: boolean;
  maxThinkingExportLength: number;
  
  // Advanced
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: ObsidianKimiSettings = {
  apiKey: '',
  apiProvider: 'moonshot-cn',
  enableVaultMCP: true,
  allowDestructiveOperations: false,
  mcpConfigPath: '',
  kimiPath: 'kimi',
  workingDirectory: '',
  autoContext: true,
  includeActiveNote: true,
  includeRecentFiles: true,
  autoOpenOnStartup: false,
  // History
  maxConversationsPerVault: 50,
  // Context Limits
  maxActiveNoteLength: 5000,
  maxAttachmentLength: 10000,
  maxSummarizeLength: 50000,
  // Search Limits
  maxSearchFiles: 1000,
  recentFilesCount: 5,
  maxMentionResults: 8,
  // Thinking
  showThinking: true,
  maxThinkingExportLength: 200,
  // Advanced
  debugMode: false,
};
