import * as React from 'react';
import type { StoredConversation } from '../../chat-history';
import { getLocalizedStrings } from '../../i18n';

interface HistoryPanelProps {
  conversations: StoredConversation[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  disabled?: boolean;
}

function formatTimestamp(timestamp: number, localeTag: string): string {
  return new Date(timestamp).toLocaleString(localeTag, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  disabled = false,
}) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);

  return (
    <div className="kimi-history-panel">
      <div className="kimi-skills-header">
        <div className="kimi-history-header-copy">
          <h4>{strings.historyPanel.title}</h4>
        </div>
      </div>

      <div className="kimi-history-list">
        {conversations.length === 0 ? (
          <div className="kimi-history-empty">
            <p>{strings.historyPanel.emptyTitle}</p>
            <p>{strings.historyPanel.emptyBody}</p>
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;

            return (
              <div
                key={conversation.id}
                className={`kimi-history-item${isActive ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="kimi-history-item-main"
                  onClick={() => onSelect(conversation.id)}
                  disabled={disabled}
                  title={conversation.title}
                >
                  <span className="kimi-history-item-title">{conversation.title}</span>
                </button>
                <span className="kimi-history-item-meta">
                  {formatTimestamp(conversation.updatedAt, strings.localeTag)}
                </span>
                <button
                  type="button"
                  className="kimi-history-delete"
                  onClick={() => onDelete(conversation.id)}
                  disabled={disabled}
                  aria-label={strings.historyPanel.deleteConversation(conversation.title)}
                  title={strings.historyPanel.delete}
                >
                  {strings.historyPanel.delete}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
