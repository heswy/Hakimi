export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type ToolRunStatus = 'running' | 'completed' | 'interrupted';

export interface ToolRun {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: ToolRunStatus;
  startedAt: number;
  finishedAt?: number;
}

export interface ChatMessage {
  id: string;
  displayId?: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  timestamp: number;
  toolCalls?: any[];
  attachments?: string[];
  toolRun?: ToolRun;
  _rawContent?: string;
  _splitDetected?: boolean;
  _hasExplicitThinking?: boolean;
}

export interface StoredConversation {
  id: string;
  sessionId?: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export type ConversationsByVault = Record<string, StoredConversation[]>;

const MAX_CONVERSATIONS_PER_VAULT = 50;
const MAX_TITLE_LENGTH = 72;
const MAX_PREVIEW_LENGTH = 140;

function cloneSerializable<T>(value: T): T {
  if (typeof value === 'undefined') {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function fileNameFromPath(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] || path;
}

export function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    attachments: message.attachments ? [...message.attachments] : undefined,
    toolCalls: message.toolCalls ? cloneSerializable(message.toolCalls) : undefined,
    toolRun: message.toolRun
      ? {
          ...message.toolRun,
          arguments: cloneSerializable(message.toolRun.arguments || {}),
          result: cloneSerializable(message.toolRun.result),
        }
      : undefined,
  };
}

export function cloneConversation(conversation: StoredConversation): StoredConversation {
  return {
    ...conversation,
    messages: conversation.messages.map(cloneMessage),
  };
}

export function sanitizeMessagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => {
      if (message.id === 'welcome') {
        return false;
      }

      return Boolean(
        message.content ||
          message.thinking ||
          message.toolRun ||
          (message.attachments && message.attachments.length > 0)
      );
    })
    .map((message) => {
      const { _rawContent, _splitDetected, _hasExplicitThinking, ...rest } = message;
      const nextToolRun = rest.toolRun
        ? {
            ...rest.toolRun,
            arguments: cloneSerializable(rest.toolRun.arguments || {}),
            result: cloneSerializable(rest.toolRun.result),
            status: rest.toolRun.status === 'running' ? 'interrupted' : rest.toolRun.status,
            finishedAt:
              rest.toolRun.status === 'running'
                ? rest.toolRun.finishedAt || Date.now()
                : rest.toolRun.finishedAt,
          }
        : undefined;

      return {
        ...rest,
        id: rest.id === 'streaming' ? `msg-${rest.timestamp}` : rest.id,
        toolRun: nextToolRun,
        attachments: rest.attachments ? [...rest.attachments] : undefined,
        toolCalls: rest.toolCalls ? cloneSerializable(rest.toolCalls) : undefined,
      };
    });
}

export function hasMeaningfulConversation(messages: ChatMessage[]): boolean {
  return sanitizeMessagesForStorage(messages).length > 0;
}

export function buildConversationTitle(messages: ChatMessage[], fallback: string): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  const firstAttachment = firstUserMessage?.attachments?.[0];
  const baseText =
    normalizeWhitespace(firstUserMessage?.content || '') ||
    (firstAttachment ? fileNameFromPath(firstAttachment) : '');

  if (!baseText) {
    return fallback;
  }

  return truncate(baseText, MAX_TITLE_LENGTH);
}

export function buildConversationPreview(messages: ChatMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'tool') {
      continue;
    }

    const text =
      normalizeWhitespace(message.content || '') ||
      normalizeWhitespace(message.thinking || '') ||
      (message.attachments?.length
        ? message.attachments.map(fileNameFromPath).join(', ')
        : '');

    if (text) {
      return truncate(text, MAX_PREVIEW_LENGTH);
    }
  }

  return fallback;
}

export function normalizeConversationStore(store?: ConversationsByVault): ConversationsByVault {
  const nextStore: ConversationsByVault = {};

  for (const [vaultKey, conversations] of Object.entries(store || {})) {
    nextStore[vaultKey] = (conversations || [])
      .map((conversation) => ({
        ...conversation,
        messages: sanitizeMessagesForStorage(conversation.messages || []),
      }))
      .filter((conversation) => conversation.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS_PER_VAULT)
      .map(cloneConversation);
  }

  return nextStore;
}
