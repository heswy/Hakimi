import { TFile } from 'obsidian';

// ACP Protocol Types
export interface ACPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// Skill Types
export interface Skill {
  name: string;
  description: string;
  content: string;
  source: 'system' | 'user' | 'vault';
  path?: string;
}

// Message Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  attachments?: string[];
}

// Vault Tool Result Types
export interface VaultReadResult {
  success: boolean;
  content: string;
  path: string;
  size: number;
}

export interface VaultWriteResult {
  success: boolean;
  path: string;
  action: 'created' | 'modified';
}

export interface VaultListResult {
  success: boolean;
  path: string;
  items: Array<{
    name: string;
    path: string;
    type: 'file' | 'folder';
  }>;
  count: number;
}

export interface VaultSearchResult {
  success: boolean;
  query: string;
  results: Array<{
    path: string;
    name: string;
    snippet: string;
  }>;
  count: number;
}

// Plugin Event Types
export interface HakimiPluginEvents {
  'hakimi:new-chat': void;
  'hakimi:connected': void;
  'hakimi:disconnected': number | null;
  'hakimi:error': Error;
}

// Context Types
export interface VaultContext {
  vaultName: string;
  totalNotes: number;
  activeNote?: string;
  activeNoteContent?: string;
  activeNoteSize?: number;
  recentFiles: Array<{ path: string; name: string }>;
}

// API Response Types
export interface HakimiInfoResponse {
  authenticated: boolean;
  user?: {
    name: string;
    email?: string;
  };
  model?: string;
  version?: string;
}
