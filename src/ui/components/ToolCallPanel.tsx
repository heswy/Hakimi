import * as React from 'react';
import { getLocalizedStrings } from '../../i18n';

interface ToolRun {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'running' | 'completed' | 'interrupted';
  startedAt: number;
  finishedAt?: number;
}

interface ToolCallCardProps {
  toolCall: ToolRun;
}

function summarizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || typeof value === 'undefined') {
    return String(value);
  }

  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 220 ? `${json.slice(0, 220)}...` : json;
  } catch {
    return String(value);
  }
}

function formatArgs(args: Record<string, any>, emptyLabel: string): string {
  const pairs = Object.entries(args);
  if (pairs.length === 0) {
    return emptyLabel;
  }

  return pairs
    .map(([key, value]) => `${key}: ${summarizeValue(value)}`)
    .join('\n');
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Tool';
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0) {
    return trimmed.slice(0, colonIndex).trim();
  }

  return trimmed;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);
  const toolIdentifier = React.useMemo(() => normalizeToolName(toolCall.name), [toolCall.name]);
  const [isExpanded, setIsExpanded] = React.useState(toolCall.status === 'running');
  const autoCollapsedRef = React.useRef(false);

  const getToolDescription = (name: string): string => {
    return strings.toolCall.descriptions[name as keyof typeof strings.toolCall.descriptions] || strings.toolCall.fallback(name);
  };

  const getStatusLabel = (status: ToolRun['status']): string => {
    if (status === 'running') return strings.toolCall.running;
    if (status === 'completed') return strings.toolCall.finished;
    return strings.toolCall.interrupted;
  };

  React.useEffect(() => {
    if (toolCall.status === 'running') {
      setIsExpanded(true);
      autoCollapsedRef.current = false;
      return;
    }

    if (!autoCollapsedRef.current) {
      setIsExpanded(false);
      autoCollapsedRef.current = true;
    }
  }, [toolCall.status]);

  return (
    <div className={`kimi-tool-call-item is-${toolCall.status}`}>
      <button
        type="button"
        className="kimi-tool-call-toggle"
        onClick={() => setIsExpanded((value) => !value)}
      >
        <div className="kimi-tool-call-heading">
          <span className={`kimi-tool-call-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
          <span className={`kimi-tool-call-status kimi-tool-call-status-${toolCall.status}`}>
            {getStatusLabel(toolCall.status)}
          </span>
          <span className="kimi-tool-call-title">{getToolDescription(toolIdentifier)}</span>
        </div>
        <div className="kimi-tool-call-meta">
          <span className="kimi-tool-call-time">
            {new Date(toolCall.startedAt).toLocaleTimeString(strings.localeTag, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
          <span className="kimi-tool-call-toggle-hint">
            {isExpanded ? strings.toolCall.hide : strings.toolCall.show}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="kimi-tool-call-body">
          <code className="kimi-tool-call-name">{toolIdentifier}</code>

          <div className="kimi-tool-call-section">
            <span className="kimi-tool-call-section-label">{strings.toolCall.args}</span>
            <pre>{formatArgs(toolCall.arguments, strings.toolCall.noArguments)}</pre>
          </div>

          {typeof toolCall.result !== 'undefined' && (
            <div className="kimi-tool-call-section">
              <span className="kimi-tool-call-section-label">{strings.toolCall.result}</span>
              <pre>{summarizeValue(toolCall.result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
