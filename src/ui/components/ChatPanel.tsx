import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { App, EventRef, Notice, TFile } from 'obsidian';
import ObsidianKimiPlugin from '../../main';
import {
  type ChatMessage as Message,
  type StoredConversation,
  type ToolRun,
  buildConversationPreview,
  buildConversationTitle,
  hasMeaningfulConversation,
  sanitizeMessagesForStorage,
} from '../../chat-history';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { HistoryPanel } from './HistoryPanel';
import { getLocalizedStrings } from '../../i18n';

interface ChatPanelProps {
  plugin: ObsidianKimiPlugin;
  app: App;
}

/**
 * 流式分割思考内容和正文
 * 在流式输出时实时分割，思考内容会即时显示
 * 返回: { thinking, content, splitDetected }
 */
function splitThinkingAndContentStreaming(text: string): { 
  thinking: string; 
  content: string; 
  splitDetected: boolean;
} {
  // 只有当文本包含思考特征时才考虑分割
  const thinkingMarkers = ['用户', '这是一个', '我应该', 'The user', 'This is', 'I should'];
  const hasThinkingMarker = thinkingMarkers.some(m => text.includes(m));
  
  if (!hasThinkingMarker || text.length < 10) {
    // 还没有足够的思考特征，所有内容都作为思考内容（实时显示）
    return { thinking: text, content: '', splitDetected: false };
  }
  
  // 正文起始标记（更全面的列表）
  const contentStartPatterns = [
    // 带引号的问候语
    { pattern: /^(.*?)("(?:你好|您好)[！!]?".*)$/is, name: 'quoted-greeting' },
    // 不带引号的问候语
    { pattern: /^(.*?[。\.\n]\s*)(你好[！!]+|您好|Hello[！!]+|Hi[！!]+|Hey[！!]+)\s*(.*)$/is, name: 'greeting' },
    // 肯定答复
    { pattern: /^(.*?[。\.\n]\s*)(当然可以[！!]?|好的[！!]?|没问题[！!]?|可以[！!]?|OK[！!]?)\s*(.*)$/is, name: 'affirmative' },
    // "让我"开头的行动
    { pattern: /^(.*?[。\.\n]\s*)(让我[^。]+[。:：])\s*(.*)$/is, name: 'let-me' },
    // 直接回答（没有明显思考特征开头）
    { pattern: /^(.*?[。\.\n]\s*)([^用这我].+[。！?？])\s*(.*)$/is, name: 'direct-answer' },
  ];
  
  for (const { pattern } of contentStartPatterns) {
    const match = text.match(pattern);
    if (match && match[1].includes('用户') && match[1].length > 5) {
      // 确保思考部分包含思考标记
      const thinkingPart = match[1].trim();
      const contentPart = match[2] + (match[3] || '');
      
      return {
        thinking: thinkingPart,
        content: contentPart.trim(),
        splitDetected: true
      };
    }
  }
  
  // 还没有检测到分割点，所有内容先作为思考内容（实时流式显示）
  return { thinking: text, content: '', splitDetected: false };
}

/**
 * 最终分割思考内容和正文（在消息完成时使用）
 */
function splitThinkingAndContent(text: string): { thinking: string; content: string } {
  const result = splitThinkingAndContentStreaming(text);
  
  // 如果已经检测到分割，直接返回
  if (result.splitDetected) {
    return {
      thinking: result.thinking,
      content: result.content
    };
  }
  
  // 如果最终都没有检测到分割，但内容很长，尝试强制分割
  if (text.length > 20) {
    // 尝试找一个自然的分割点（更多模式）
    const patterns = [
      /^(.*?)(你好[！!].*)$/s,
      /^(.*?)(Hello[！!].*)$/is,
      /^(.*?)(当然可以[！!].*)$/s,
      /^(.*?)(好的[！!].*)$/s,
      /^(.*?)(让我[^。]+[。:：].*)$/s,
      /^(.*?)(没问题[！!].*)$/s,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1].length > 10 && match[1].includes('用户')) {
        return {
          thinking: match[1].trim(),
          content: match[2].trim()
        };
      }
    }
  }
  
  // 默认：全部作为正文
  return {
    thinking: '',
    content: text
  };
}

function finalizeStreamingMessageInList(messages: Message[]): Message[] {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.id !== 'streaming' || lastMsg.role !== 'assistant') {
    return messages;
  }

  if (lastMsg._hasExplicitThinking) {
    const { _rawContent, _splitDetected, _hasExplicitThinking, ...cleanMsg } = lastMsg;
    const updated = [...messages];
    updated[updated.length - 1] = {
      ...cleanMsg,
      id: `msg-${Date.now()}`,
      thinking: cleanMsg.thinking || '',
      content: cleanMsg.content || ''
    };
    return updated;
  }

  const rawContent = lastMsg._rawContent || lastMsg.content || '';
  const { thinking, content } = splitThinkingAndContent(rawContent);
  const { _rawContent, _splitDetected, _hasExplicitThinking, ...cleanMsg } = lastMsg;
  const updated = [...messages];

  updated[updated.length - 1] = {
    ...cleanMsg,
    id: `msg-${Date.now()}`,
    thinking: thinking || cleanMsg.thinking,
    content: content || cleanMsg.content
  };

  return updated;
}

function updateToolMessages(
  messages: Message[],
  updater: (toolRun: ToolRun) => ToolRun
): Message[] {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.role !== 'tool' || !message.toolRun) {
      return message;
    }

    const nextToolRun = updater(message.toolRun);
    if (nextToolRun === message.toolRun) {
      return message;
    }

    changed = true;
    return {
      ...message,
      toolRun: nextToolRun,
      timestamp: nextToolRun.finishedAt || message.timestamp
    };
  });

  return changed ? nextMessages : messages;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ plugin, app }) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>(() =>
    plugin.getCurrentVaultConversations()
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [attachedNotes, setAttachedNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noteCatalogVersion, setNoteCatalogVersion] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [isSwitchingConversation, setIsSwitchingConversation] = useState(false);
  
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const isInterruptingRef = useRef(false);
  const isHydratingConversationRef = useRef(false);
  const lastPersistedSignatureRef = useRef('');
  const toolTimeoutsRef = useRef<Map<string, number>>(new Map());
  const acpClient = plugin.acpClient;

  // 工具执行超时时间（毫秒）
  const TOOL_TIMEOUT = 60000; // 60秒

  const refreshConversationList = useCallback(() => {
    setConversations(plugin.getCurrentVaultConversations());
  }, [plugin]);

  useEffect(() => {
    const refreshNotes = () => setNoteCatalogVersion((version) => version + 1);
    const refs: EventRef[] = [
      app.vault.on('create', refreshNotes),
      app.vault.on('delete', refreshNotes),
      app.vault.on('rename', refreshNotes)
    ];

    return () => {
      refs.forEach((ref) => app.vault.offref(ref));
    };
  }, [app.vault]);

  const availableNotes = useMemo(
    () =>
      app.vault
        .getMarkdownFiles()
        .map((file) => ({
          path: file.path,
          name: file.name,
          basename: file.basename,
          mtime: file.stat.mtime
        }))
        .sort((a, b) => b.mtime - a.mtime),
    [app.vault, noteCatalogVersion]
  );

  const finalizeStreamingMessage = useCallback(() => {
    setMessages((prev) => finalizeStreamingMessageInList(prev));
  }, []);

  const handleNewChatInternal = useCallback(async () => {
    isInterruptingRef.current = true;
    setMessages([]);
    setCurrentConversationId(null);
    lastPersistedSignatureRef.current = '';
    setInput('');
    setAttachedNotes([]);
    setShowHistory(false);
    setError(null);
    setIsLoading(false);
    setIsStopping(false);
    shouldAutoScrollRef.current = true;

    try {
      const connected = await acpClient.startNewSession();
      setIsConnected(connected);
      if (!connected) {
        setError(strings.chat.failedConnect);
      }
    } catch (error) {
      console.error('Failed to start a new session:', error);
      setIsConnected(false);
      setError(strings.chat.failedConnect);
    } finally {
      isInterruptingRef.current = false;
    }
  }, [acpClient, strings]);

  // 连接到 ACP
  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      try {
        const connected = await acpClient.connect();
        if (!mounted) return;
        
        setIsConnected(connected);
        if (connected) {
          setError(null);
        } else {
          setError(strings.chat.failedConnect);
        }
      } catch (e) {
        if (!mounted) return;
        setError(strings.chat.connectionError(e instanceof Error ? e.message : strings.notices.unknownError));
      }
    };

    connect();

      // 监听 ACP 事件
    const handleStream = (data: any) => {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        const isStreaming = lastMsg && lastMsg.role === 'assistant' && lastMsg.id === 'streaming';
        
        // 处理思考内容 (ACP protocol thinking type - 如果服务器支持)
        if (data.thinking) {
          if (isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...lastMsg,
              thinking: (lastMsg.thinking || '') + data.thinking,
              _hasExplicitThinking: true,
            };
            return updated;
          } else {
            const displayId = `assistant-${Date.now()}`;
            return [...prev, {
              id: 'streaming',
              displayId,
              role: 'assistant',
              content: '',
              thinking: data.thinking,
              timestamp: Date.now(),
              _hasExplicitThinking: true,
            }];
          }
        }
        
        // 处理正文内容（实时分割思考和正文）
        if (data.delta) {
          if (isStreaming) {
            const updated = [...prev];
            const currentMsg = lastMsg as Message & {
              _rawContent?: string;
              _splitDetected?: boolean;
              _hasExplicitThinking?: boolean;
            };
            
            // 累积原始内容
            const rawContent = currentMsg._rawContent || '';
            const newRawContent = rawContent + data.delta;

            if (currentMsg._hasExplicitThinking) {
              updated[updated.length - 1] = {
                ...currentMsg,
                _rawContent: newRawContent,
                content: (currentMsg.content || '') + data.delta,
              };
              return updated;
            }
            
            // 如果已经检测到分割点，后续内容直接追加到正文
            if (currentMsg._splitDetected) {
              updated[updated.length - 1] = {
                ...currentMsg,
                _rawContent: newRawContent,
                content: (currentMsg.content || '') + data.delta
              };
            } else {
              // 尝试分割思考内容和正文
              const { thinking, content, splitDetected } = splitThinkingAndContentStreaming(newRawContent);
              
              updated[updated.length - 1] = {
                ...currentMsg,
                _rawContent: newRawContent,
                _splitDetected: splitDetected,
                thinking: thinking || currentMsg.thinking,
                content: content || ''
              };
            }
            return updated;
          } else {
            const { thinking, content, splitDetected } = splitThinkingAndContentStreaming(data.delta);
            const displayId = `assistant-${Date.now()}`;
            return [...prev, {
              id: 'streaming',
              displayId,
              role: 'assistant',
              _rawContent: data.delta,
              _splitDetected: splitDetected,
              content,
              thinking,
              timestamp: Date.now(),
              _hasExplicitThinking: false,
            }];
          }
        }
        
        return prev;
      });
      
      // 处理完成信号
      if (data.finish_reason || data.stop_reason) {
        finalizeStreamingMessage();
        setIsLoading(false);
        setIsStopping(false);
        setMessages((prev) =>
          updateToolMessages(finalizeStreamingMessageInList(prev), (toolRun) =>
            toolRun.status === 'running'
              ? { ...toolRun, status: 'completed', finishedAt: toolRun.finishedAt || Date.now() }
              : toolRun
          )
        );
      }
    };

    const handleToolCall = (toolCall: any) => {
      const toolId = toolCall.id;
      
      // 清除已存在的超时
      const existingTimeout = toolTimeoutsRef.current.get(toolId);
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }
      
      // 设置新的超时
      const timeoutId = window.setTimeout(() => {
        console.warn(`[ChatPanel] Tool ${toolId} timed out after ${TOOL_TIMEOUT}ms`);
        setMessages((prev) => {
          const toolMessageId = `tool-${toolId}`;
          const existingIndex = prev.findIndex((message) => message.id === toolMessageId);
          const finishedAt = Date.now();
          
          if (existingIndex === -1) {
            return prev;
          }
          
          const updated = [...prev];
          const existingMessage = updated[existingIndex];
          if (existingMessage.toolRun?.status === 'running') {
            updated[existingIndex] = {
              ...existingMessage,
              timestamp: finishedAt,
              toolRun: {
                ...existingMessage.toolRun,
                result: { error: 'Tool execution timed out' },
                status: 'interrupted',
                finishedAt
              }
            };
          }
          return updated;
        });
        toolTimeoutsRef.current.delete(toolId);
      }, TOOL_TIMEOUT);
      
      toolTimeoutsRef.current.set(toolId, timeoutId);
      
      setMessages((prev) => {
        const nextMessages = finalizeStreamingMessageInList(prev);
        const toolMessageId = `tool-${toolCall.id}`;
        const existingIndex = nextMessages.findIndex((message) => message.id === toolMessageId);
        const nextToolRun: ToolRun = {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments || {},
          status: 'running',
          startedAt: Date.now()
        };

        if (existingIndex === -1) {
          return [
            ...nextMessages,
            {
              id: toolMessageId,
              role: 'tool',
              content: '',
              timestamp: nextToolRun.startedAt,
              toolRun: nextToolRun
            }
          ];
        }

        const updated = [...nextMessages];
        const existingMessage = updated[existingIndex];
        updated[existingIndex] = {
          ...existingMessage,
          timestamp: existingMessage.toolRun?.startedAt || nextToolRun.startedAt,
          toolRun: {
            ...(existingMessage.toolRun || nextToolRun),
            ...nextToolRun,
            startedAt: existingMessage.toolRun?.startedAt || nextToolRun.startedAt
          }
        };
        return updated;
      });
    };

    const handleToolResult = (toolResult: any) => {
      const toolId = toolResult.id;
      
      // 清除超时计时器
      const timeoutId = toolTimeoutsRef.current.get(toolId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        toolTimeoutsRef.current.delete(toolId);
      }
      
      setMessages((prev) => {
        const nextMessages = finalizeStreamingMessageInList(prev);
        const toolMessageId = `tool-${toolId}`;
        const existingIndex = nextMessages.findIndex((message) => message.id === toolMessageId);
        const finishedAt = Date.now();
        // 如果工具返回错误，标记为 interrupted，否则 completed
        const finalStatus = toolResult.error ? 'interrupted' : 'completed';

        if (existingIndex === -1) {
          return [
            ...nextMessages,
            {
              id: toolMessageId,
              role: 'tool',
              content: '',
              timestamp: finishedAt,
              toolRun: {
                id: toolId || `tool-result-${finishedAt}`,
                name: 'unknown',
                arguments: {},
                result: toolResult.result,
                status: finalStatus,
                startedAt: finishedAt,
                finishedAt
              }
            }
          ];
        }

        const updated = [...nextMessages];
        const existingMessage = updated[existingIndex];
        updated[existingIndex] = {
          ...existingMessage,
          timestamp: finishedAt,
          toolRun: existingMessage.toolRun
            ? {
                ...existingMessage.toolRun,
                result: toolResult.result,
                status: finalStatus,
                finishedAt
              }
            : {
                id: toolId || `tool-result-${finishedAt}`,
                name: 'unknown',
                arguments: {},
                result: toolResult.result,
                status: finalStatus,
                startedAt: finishedAt,
                finishedAt
              }
        };
        return updated;
      });
    };

    const handleError = (err: any) => {
      console.error('ACP Error:', err);
      const errorMsg = err.message || err.error?.message || strings.notices.unknownError;
      setError(strings.chat.error(errorMsg));
      setIsLoading(false);
      setIsStopping(false);
      setMessages((prev) =>
        updateToolMessages(finalizeStreamingMessageInList(prev), (toolRun) =>
          toolRun.status === 'running'
            ? { ...toolRun, status: 'interrupted', finishedAt: toolRun.finishedAt || Date.now() }
            : toolRun
        )
      );
    };

    const handleDisconnected = () => {
      if (isInterruptingRef.current) {
        return;
      }

      setIsConnected(false);
      setError(strings.chat.disconnected);
    };

    const handleConnected = () => {
      setIsConnected(true);
      setError(null);

      if (isInterruptingRef.current) {
        return;
      }

      setMessages(prev => {
        if (prev.length === 0) {
          return prev;
        }

        // 检查最后一条是否已经是重连消息
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.id?.startsWith('system-reconnected-')) {
          return prev;
        }
        return [...prev, {
          id: `system-reconnected-${Date.now()}`,
          role: 'system',
          content: strings.chat.reconnectedMessage,
          timestamp: Date.now()
        }];
      });
    };

    const handleMessageComplete = () => {
      console.log('[ChatPanel] Message complete received');
      setIsLoading(false);
      setIsStopping(false);
      finalizeStreamingMessage();
      setMessages((prev) =>
        updateToolMessages(finalizeStreamingMessageInList(prev), (toolRun) =>
          toolRun.status === 'running'
            ? { ...toolRun, status: 'completed', finishedAt: toolRun.finishedAt || Date.now() }
            : toolRun
        )
      );
    };

    const handleNewChat = () => {
      void handleNewChatInternal();
    };

    const handleHistoryUpdated = () => {
      refreshConversationList();
      setCurrentConversationId((prev) => {
        if (!prev) {
          return prev;
        }
        return plugin.getConversationForCurrentVault(prev) ? prev : null;
      });
    };

    acpClient.on('stream', handleStream);
    acpClient.on('tool_call', handleToolCall);
    acpClient.on('tool_result', handleToolResult);
    acpClient.on('error', handleError);
    acpClient.on('disconnected', handleDisconnected);
    acpClient.on('connected', handleConnected);
    acpClient.on('message_complete', handleMessageComplete);
    
    // 监听全局事件
    // @ts-ignore
    app.workspace.on('kimi:new-chat', handleNewChat);
    // @ts-ignore
    app.workspace.on('kimi:history-updated', handleHistoryUpdated);

    return () => {
      mounted = false;
      acpClient.off('stream', handleStream);
      acpClient.off('tool_call', handleToolCall);
      acpClient.off('tool_result', handleToolResult);
      acpClient.off('error', handleError);
      acpClient.off('disconnected', handleDisconnected);
      acpClient.off('connected', handleConnected);
      acpClient.off('message_complete', handleMessageComplete);
      // @ts-ignore
      app.workspace.off('kimi:new-chat', handleNewChat);
      // @ts-ignore
      app.workspace.off('kimi:history-updated', handleHistoryUpdated);
      
      // 清理所有工具超时计时器
      toolTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toolTimeoutsRef.current.clear();
    };
  }, [acpClient, app.workspace, finalizeStreamingMessage, handleNewChatInternal, plugin, refreshConversationList, strings]);

  // 滚动到底部
  useEffect(() => {
    const container = messageListRef.current;
    if (!container || !shouldAutoScrollRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleMessageListScroll = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }, []);

  const persistedMessageSignature = useMemo(
    () => JSON.stringify(sanitizeMessagesForStorage(messages)),
    [messages]
  );

  useEffect(() => {
    if (isHydratingConversationRef.current || !hasMeaningfulConversation(messages)) {
      if (!hasMeaningfulConversation(messages)) {
        lastPersistedSignatureRef.current = '';
      }
      return;
    }

    if (persistedMessageSignature === lastPersistedSignatureRef.current) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const sanitizedMessages = sanitizeMessagesForStorage(messages);
        const savedConversation = await plugin.upsertConversationForCurrentVault({
          id: currentConversationId || undefined,
          sessionId: acpClient.getSessionId() || undefined,
          title: buildConversationTitle(
            sanitizedMessages,
            strings.historyPanel.untitledConversation
          ),
          preview: buildConversationPreview(
            sanitizedMessages,
            strings.historyPanel.emptyPreview
          ),
          messages: sanitizedMessages,
        });

        if (cancelled) {
          return;
        }

        lastPersistedSignatureRef.current = persistedMessageSignature;
        if (!currentConversationId) {
          setCurrentConversationId(savedConversation.id);
        }
        refreshConversationList();
      })().catch((error) => {
        console.error('Failed to persist conversation:', error);
      });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    acpClient,
    currentConversationId,
    messages,
    persistedMessageSignature,
    plugin,
    refreshConversationList,
    strings,
  ]);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachedNotes.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
      attachments: attachedNotes.length > 0 ? [...attachedNotes] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    shouldAutoScrollRef.current = true;
    setInput('');
    setIsLoading(true);
    setIsStopping(false);
    setError(null);

    // 构建消息内容
    let fullContent = input;
    
    // 添加附件内容
    for (const notePath of attachedNotes) {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        try {
          const content = await app.vault.read(file);
          fullContent += strings.prompts.attachmentContent(notePath, content.substring(0, plugin.settings.maxAttachmentLength));
        } catch (e) {
          console.error('Failed to read attachment:', e);
        }
      }
    }

    setAttachedNotes([]);

    try {
      await acpClient.sendMessage(fullContent);
    } catch (error) {
      console.error('Send error:', error);
      setIsLoading(false);
      setError(strings.chat.sendFailed(error instanceof Error ? error.message : strings.notices.unknownError));
    }
  }, [input, isLoading, attachedNotes, acpClient, app.vault, strings]);

  const handleStop = useCallback(async () => {
    if (!isLoading || isStopping) {
      return;
    }

    isInterruptingRef.current = true;
    setIsStopping(true);
    setError(null);

    try {
      const reconnected = await acpClient.interruptCurrentTurn();
      finalizeStreamingMessage();
      setIsLoading(false);
      setIsStopping(false);
      setIsConnected(reconnected);
      setMessages((prev) =>
        updateToolMessages(finalizeStreamingMessageInList(prev), (toolRun) =>
          toolRun.status === 'running'
            ? { ...toolRun, status: 'interrupted', finishedAt: toolRun.finishedAt || Date.now() }
            : toolRun
        )
      );

      if (reconnected) {
        new Notice(strings.notices.generationPaused);
      } else {
        setError(strings.notices.pauseFailed);
      }
    } catch (error) {
      console.error('Stop error:', error);
      setIsLoading(false);
      setIsStopping(false);
      setError(strings.notices.pauseFailed);
    } finally {
      isInterruptingRef.current = false;
    }
  }, [acpClient, finalizeStreamingMessage, isLoading, isStopping, strings]);

  const handleAttachByPath = useCallback((notePath: string) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      return;
    }

    if (attachedNotes.includes(notePath)) {
      new Notice(strings.notices.alreadyAttached);
      return;
    }

    setAttachedNotes((prev) => [...prev, notePath]);
    new Notice(strings.notices.attached(file.name));
  }, [app.vault, attachedNotes, strings]);

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    if (isLoading || isStopping) {
      return;
    }

    if (conversationId === currentConversationId) {
      setShowHistory(false);
      return;
    }

    const conversation = plugin.getConversationForCurrentVault(conversationId);
    if (!conversation) {
      return;
    }

    const nextMessages = sanitizeMessagesForStorage(conversation.messages);
    isHydratingConversationRef.current = true;
    isInterruptingRef.current = true;
    setIsSwitchingConversation(true);
    setShowHistory(false);
    setCurrentConversationId(conversation.id);
    setMessages(nextMessages);
    setInput('');
    setAttachedNotes([]);
    setError(null);
    setIsLoading(false);
    setIsStopping(false);
    shouldAutoScrollRef.current = true;
    lastPersistedSignatureRef.current = JSON.stringify(nextMessages);

    try {
      let connected = false;
      let resumed = false;
      if (conversation.sessionId) {
        connected = await acpClient.resumeSession(conversation.sessionId);
        resumed = connected;
        if (!connected) {
          connected = await acpClient.startNewSession();
        }
      } else {
        connected = await acpClient.startNewSession();
      }

      setIsConnected(connected);
      if (!resumed) {
        setError(strings.notices.historyLocalOnly);
      }
    } catch (error) {
      console.error('Failed to switch conversation:', error);
      setIsConnected(false);
      setError(strings.notices.historyLocalOnly);
    } finally {
      isHydratingConversationRef.current = false;
      isInterruptingRef.current = false;
      setIsSwitchingConversation(false);
      refreshConversationList();
    }
  }, [
    acpClient,
    currentConversationId,
    isLoading,
    isStopping,
    plugin,
    refreshConversationList,
    strings,
  ]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    if (!window.confirm(strings.historyPanel.deleteConfirm(conversation.title))) {
      return;
    }

    await plugin.deleteConversationForCurrentVault(conversationId);
    refreshConversationList();

    if (conversationId === currentConversationId) {
      await handleNewChatInternal();
    }
  }, [
    conversations,
    currentConversationId,
    handleNewChatInternal,
    plugin,
    refreshConversationList,
    strings,
  ]);

  const handleExportChat = useCallback(async () => {
    if (messages.length <= 1) {
      new Notice(strings.notices.noMessagesToExport);
      return;
    }

    const content = messages
      .filter(m => m.role !== 'system' || m.id !== 'welcome')
      .map(m => {
        const role =
          m.role === 'user'
            ? `**${strings.chat.exportUser}**`
            : m.role === 'assistant'
              ? `**${strings.chat.exportAssistant}**`
              : m.role === 'tool'
                ? `**${strings.toolCall.title}**`
              : `**${strings.chat.exportSystem}**`;
        let text = `${role} (${new Date(m.timestamp).toLocaleString(strings.localeTag)}):\n${m.content}`;
        if (m.thinking) {
          const maxLen = plugin.settings.maxThinkingExportLength;
text += `\n\n*(${strings.chat.exportThinking}: ${m.thinking.substring(0, maxLen)}...)*`;
        }
        if (m.role === 'tool' && m.toolRun) {
          text += `\n\n${m.toolRun.name}\n${JSON.stringify(m.toolRun.arguments, null, 2)}`;
          if (typeof m.toolRun.result !== 'undefined') {
            text += `\n\n${JSON.stringify(m.toolRun.result, null, 2)}`;
          }
        }
        if (m.attachments?.length) {
          text += `\n\n*${strings.chat.exportAttachments}: ${m.attachments.map(a => `[[${a}]]`).join(', ')}*`;
        }
        return text;
      })
      .join('\n\n---\n\n');

    const frontmatter = `---\ndate: ${new Date().toISOString()}\nsource: kimii-chat\n---\n\n`;

    try {
      const fileName = `Kimi-Chat-${new Date().toISOString().slice(0, 10)}-${Date.now()}.md`;
      await app.vault.create(fileName, frontmatter + `# ${strings.chat.exportTitle}\n\n` + content);
      new Notice(strings.notices.exportedTo(fileName));
    } catch (e) {
      new Notice(strings.notices.failedToExport);
      console.error(e);
    }
  }, [messages, app.vault, strings]);

  const handleReconnect = useCallback(async () => {
    setError(strings.chat.reconnecting);
    try {
      const success = await acpClient.reconnect();
      if (success) {
        setIsConnected(true);
        setError(null);
        new Notice(strings.notices.reconnected);
      } else {
        setError(strings.notices.reconnectionFailedCheck);
        setIsConnected(false);
      }
    } catch (e) {
      setError(strings.chat.connectionError(e instanceof Error ? e.message : strings.notices.unknownError));
      setIsConnected(false);
    }
  }, [acpClient, strings]);

  return (
    <div className="kimi-chat-panel">
      {/* Header */}
      <div className="kimi-chat-header">
        <div className="kimi-chat-title">
          <span 
            className={`kimi-status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
            onClick={!isConnected ? handleReconnect : undefined}
            style={{ cursor: !isConnected ? 'pointer' : 'default' }}
            title={!isConnected ? strings.chat.statusReconnectTitle : strings.chat.statusConnectedTitle}
          />
          <span>Kimi</span>
        </div>
        <div className="kimi-chat-actions" role="toolbar" aria-label={strings.chat.toolbarLabel}>
          <button 
            type="button"
            className={`kimi-icon-btn${showHistory ? ' is-active' : ''}`}
            onClick={() => {
              setShowHistory((value) => !value);
            }}
            title={strings.chat.history}
            disabled={isLoading || isStopping || isSwitchingConversation}
          >
            {strings.chat.history}
          </button>
          <button 
            type="button"
            className="kimi-icon-btn"
            onClick={() => {
              void handleExportChat();
            }}
            title={strings.chat.export}
          >
            {strings.chat.export}
          </button>
          <button 
            type="button"
            className="kimi-icon-btn"
            onClick={() => {
              void handleNewChatInternal();
            }}
            title={strings.chat.newChat}
            disabled={isLoading || isStopping || isSwitchingConversation}
          >
            {strings.chat.newChat}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="kimi-error-banner">
          <div className="kimi-error-copy">
            <span className="kimi-error-title">{isConnected ? strings.chat.notice : strings.chat.connectionIssue}</span>
            <span>{error}</span>
          </div>
          {!isConnected && (
            <button type="button" className="kimi-error-action" onClick={handleReconnect}>
              {strings.chat.reconnect}
            </button>
          )}
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          conversations={conversations}
          activeConversationId={currentConversationId}
          onSelect={(conversationId) => void handleSelectConversation(conversationId)}
          onDelete={(conversationId) => void handleDeleteConversation(conversationId)}
          disabled={isLoading || isStopping || isSwitchingConversation}
        />
      )}
      {/* Messages */}
      <MessageList 
        app={app}
        plugin={plugin}
        messages={messages}
        listRef={messageListRef}
        onScroll={handleMessageListScroll}
        messagesEndRef={messagesEndRef}
      />

      {/* Input */}
      <InputBox
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        isLoading={isLoading}
        isStopping={isStopping}
        attachedNotes={attachedNotes}
        availableNotes={availableNotes}
        onAttachByPath={handleAttachByPath}
        onRemoveAttachment={(path) => 
          setAttachedNotes(prev => prev.filter(p => p !== path))
        }
        disabled={!isConnected}
        maxMentionResults={plugin.settings.maxMentionResults}
      />
    </div>
  );
};
