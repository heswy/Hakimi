import * as React from 'react';
import { useState } from 'react';
import { App, Component, MarkdownRenderer } from 'obsidian';
import type { ChatMessage as Message } from '../../chat-history';
import ObsidianKimiPlugin from '../../main';
import { ToolCallCard } from './ToolCallPanel';
import { getLocalizedStrings, type LocalizedStrings } from '../../i18n';

interface MessageListProps {
  app: App;
  plugin: ObsidianKimiPlugin;
  messages: Message[];
  listRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

const MarkdownBlock: React.FC<{
  app: App;
  plugin: ObsidianKimiPlugin;
  markdown: string;
  sourcePath: string;
  className: string;
}> = ({ app, plugin, markdown, sourcePath, className }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderRoot = document.createElement('div');
    renderRoot.className = 'kimi-markdown-render-root';
    container.innerHTML = '';
    container.appendChild(renderRoot);
    const child = plugin.addChild(new Component());
    let cancelled = false;

    void MarkdownRenderer.render(app, markdown, renderRoot, sourcePath, child).catch(() => {
      if (!cancelled) {
        renderRoot.textContent = markdown;
      }
    });

    return () => {
      cancelled = true;
      container.innerHTML = '';
      try {
        plugin.removeChild(child);
      } catch {
        child.unload();
      }
    };
  }, [app, markdown, plugin, sourcePath]);

  return <div ref={containerRef} className={className} />;
};

// 思考内容组件 - 可折叠
const ThinkingBlock: React.FC<{
  app: App;
  plugin: ObsidianKimiPlugin;
  sourcePath: string;
  thinking: string;
  strings: LocalizedStrings['messageList'];
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ app, plugin, sourcePath, thinking, strings, isExpanded, onToggle }) => {
  if (!thinking.trim()) return null;
  
  return (
    <div className="kimi-thinking-block">
      <button 
        type="button"
        className="kimi-thinking-header"
        onClick={onToggle}
      >
        <span className={`kimi-thinking-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
        <span className="kimi-thinking-label">{strings.reasoning}</span>
        <span className="kimi-thinking-hint">{isExpanded ? strings.hide : strings.show}</span>
      </button>
      {isExpanded && (
        <MarkdownBlock
          app={app}
          plugin={plugin}
          markdown={thinking}
          sourcePath={sourcePath}
          className="kimi-thinking-content markdown-rendered"
        />
      )}
    </div>
  );
};

const getRoleLabel = (message: Message, strings: LocalizedStrings['messageList']): string => {
  if (message.id === 'welcome') return strings.session;
  if (message.role === 'user') return strings.you;
  if (message.role === 'assistant') return strings.kimi;
  if (message.role === 'tool') return strings.action;
  return strings.system;
};

export const MessageList: React.FC<MessageListProps> = ({
  app,
  plugin,
  messages,
  listRef,
  onScroll,
  messagesEndRef,
}) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<Record<string, boolean>>({});
  const autoCollapsedThinkingRef = React.useRef<Record<string, boolean>>({});
  const sourcePath = app.workspace.getActiveFile()?.path ?? '';

  React.useEffect(() => {
    const streamingIdsToCollapse = messages
      .filter(
        (message) =>
          message.role === 'assistant' &&
          message.id === 'streaming' &&
          Boolean(message.thinking) &&
          Boolean(message.content)
      )
      .map((message) => message.displayId || message.id)
      .filter((id) => !autoCollapsedThinkingRef.current[id]);

    if (streamingIdsToCollapse.length === 0) {
      return;
    }

    setExpandedThinkingBlocks((prev) => {
      const next = { ...prev };
      for (const id of streamingIdsToCollapse) {
        next[id] = false;
        autoCollapsedThinkingRef.current[id] = true;
      }
      return next;
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="kimi-message-list kimi-empty">
        <div className="kimi-welcome">
          <div className="kimi-welcome-eyebrow">{strings.messageList.welcomeEyebrow}</div>
          <div className="kimi-welcome-text">{strings.messageList.welcomeText}</div>
          <div className="kimi-welcome-hint">{strings.messageList.welcomeHint}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="kimi-message-list" ref={listRef} onScroll={onScroll}>
      {messages.map((msg, index) => {
        const isWelcomeMessage = msg.id === 'welcome';
        const renderId = msg.displayId || msg.id;
        const isStreamingAssistant = msg.role === 'assistant' && msg.id === 'streaming';
        const isThinkingExpanded = expandedThinkingBlocks[renderId] ?? isStreamingAssistant;
        const shouldShowHeader = (() => {
          if (msg.role !== 'assistant') {
            return true;
          }

          for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const previous = messages[cursor];

            if (previous.role === 'assistant') {
              return false;
            }

            if (previous.role === 'user') {
              return true;
            }
          }

          return true;
        })();

        return (
          <div 
            key={renderId} 
            className={`kimi-message kimi-message-${msg.role}${isWelcomeMessage ? ' kimi-message-welcome' : ''}`}
          >
            {shouldShowHeader && (
              <div className="kimi-message-header">
                <span className="kimi-message-role">
                  {getRoleLabel(msg, strings.messageList)}
                </span>
                <span className="kimi-message-time">
                  {new Date(msg.timestamp).toLocaleTimeString(strings.localeTag, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="kimi-message-attachments">
                {msg.attachments.map((path) => {
                  const fileName = path.split('/').pop() || path;

                  return (
                  <span key={path} className="kimi-attachment-tag" title={path}>
                    <span className="kimi-attachment-label">{strings.messageList.note}</span>
                    <span className="kimi-attachment-file">{fileName}</span>
                  </span>
                )})}
              </div>
            )}
            
            {/* 工具步骤 */}
            {msg.role === 'tool' && msg.toolRun && (
              <ToolCallCard toolCall={msg.toolRun} />
            )}

            {/* 思考内容 - 仅助手消息显示 */}
            {msg.role === 'assistant' && msg.thinking && (
              <ThinkingBlock
                app={app}
                plugin={plugin}
                sourcePath={sourcePath}
                thinking={msg.thinking}
                strings={strings.messageList}
                isExpanded={isThinkingExpanded}
                onToggle={() =>
                  setExpandedThinkingBlocks((prev) => ({
                    ...prev,
                    [renderId]: !isThinkingExpanded,
                  }))
                }
              />
            )}
            
            {/* 正文内容 */}
            {msg.content && (
              <MarkdownBlock
                app={app}
                plugin={plugin}
                markdown={msg.content}
                sourcePath={sourcePath}
                className="kimi-message-content markdown-rendered"
              />
            )}
            
            {/* 空内容占位（纯思考状态） */}
            {msg.role === 'assistant' && msg.id === 'streaming' && !msg.content && !msg.thinking && (
              <div className="kimi-message-thinking-indicator" aria-live="polite">
                <span className="kimi-thinking-status">{strings.messageList.generating}</span>
                <span className="kimi-thinking-dot"></span>
                <span className="kimi-thinking-dot"></span>
                <span className="kimi-thinking-dot"></span>
              </div>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};
