import * as React from 'react';
import { getLocalizedStrings } from '../../i18n';

interface MentionableNote {
  path: string;
  name: string;
  basename: string;
  mtime: number;
}

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  isStopping?: boolean;
  attachedNotes: string[];
  availableNotes: MentionableNote[];
  onAttachByPath: (path: string) => void;
  onRemoveAttachment: (path: string) => void;
  disabled?: boolean;
  maxMentionResults?: number;
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}



function isMentionBoundary(char?: string): boolean {
  return !char || /[\s.,;:!?()[\]{}"'`<>/-]/.test(char);
}

function findMentionMatch(value: string, caret: number): MentionMatch | null {
  if (caret < 0 || caret > value.length) {
    return null;
  }

  const beforeCaret = value.slice(0, caret);
  const mentionStart = beforeCaret.lastIndexOf('@');

  if (mentionStart === -1) {
    return null;
  }

  const previousChar = value[mentionStart - 1];
  if (!isMentionBoundary(previousChar)) {
    return null;
  }

  const query = beforeCaret.slice(mentionStart + 1);
  if (/[\n\r\t ]/.test(query)) {
    return null;
  }

  return {
    start: mentionStart,
    end: caret,
    query
  };
}

function scoreMentionableNote(note: MentionableNote, query: string): number | null {
  if (!query) {
    return 0;
  }

  const needle = query.toLowerCase();
  const basename = note.basename.toLowerCase();
  const fileName = note.name.toLowerCase();
  const filePath = note.path.toLowerCase();

  if (basename === needle || fileName === needle || filePath === needle) {
    return 1;
  }

  if (basename.startsWith(needle)) {
    return 2;
  }

  if (fileName.startsWith(needle)) {
    return 3;
  }

  if (basename.includes(needle)) {
    return 4;
  }

  if (fileName.includes(needle)) {
    return 5;
  }

  if (filePath.includes(needle)) {
    return 6;
  }

  return null;
}

function buildMentionSuggestions(
  availableNotes: MentionableNote[],
  attachedNotes: string[],
  query: string,
  maxResults: number
): MentionableNote[] {
  const attachedSet = new Set(attachedNotes);
  const normalizedQuery = query.trim().toLowerCase();

  return availableNotes
    .filter((note) => !attachedSet.has(note.path))
    .map((note) => ({
      note,
      score: scoreMentionableNote(note, normalizedQuery)
    }))
    .filter((entry): entry is { note: MentionableNote; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      if (b.note.mtime !== a.note.mtime) {
        return b.note.mtime - a.note.mtime;
      }

      return a.note.path.localeCompare(b.note.path);
    })
    .slice(0, maxResults)
    .map((entry) => entry.note);
}

function extractDropPayload(dataTransfer: DataTransfer): string {
  const chunks: string[] = [];

  for (const type of Array.from(dataTransfer.types)) {
    const value = dataTransfer.getData(type);
    if (value) {
      chunks.push(value);
    }
  }

  for (const file of Array.from(dataTransfer.files)) {
    if (file.name) {
      chunks.push(file.name);
    }
  }

  return chunks.join('\n');
}

function normalizeDropCandidates(rawPayload: string): string[] {
  const candidates = new Set<string>();

  const pushCandidate = (value: string) => {
    const normalized = value.trim().replace(/^!/, '');
    if (!normalized) {
      return;
    }

    candidates.add(normalized);

    const wikiMatch = normalized.match(/^\[\[([^[\]]+)\]\]$/);
    if (wikiMatch) {
      candidates.add(wikiMatch[1].split('|')[0].trim());
    }

    try {
      const url = new URL(normalized);
      if (url.protocol === 'obsidian:') {
        const file = url.searchParams.get('file');
        if (file) {
          candidates.add(decodeURIComponent(file));
        }
      }
    } catch {
      // Ignore non-URL values.
    }
  };

  for (const chunk of rawPayload.split(/\r?\n/)) {
    pushCandidate(chunk);
  }

  return Array.from(candidates);
}

function resolveDroppedNotes(rawPayload: string, availableNotes: MentionableNote[]): MentionableNote[] {
  const normalizedPathMap = new Map<string, MentionableNote>();
  const normalizedNameMap = new Map<string, MentionableNote>();
  const normalizedBasenameMap = new Map<string, MentionableNote>();

  for (const note of availableNotes) {
    normalizedPathMap.set(note.path.toLowerCase(), note);
    normalizedNameMap.set(note.name.toLowerCase(), note);
    normalizedBasenameMap.set(note.basename.toLowerCase(), note);
  }

  const resolved = new Map<string, MentionableNote>();

  for (const candidate of normalizeDropCandidates(rawPayload)) {
    const normalized = candidate.toLowerCase();
    const withoutExtension = normalized.replace(/\.md$/i, '');
    const note =
      normalizedPathMap.get(normalized) ??
      normalizedPathMap.get(`${withoutExtension}.md`) ??
      normalizedNameMap.get(normalized) ??
      normalizedNameMap.get(`${withoutExtension}.md`) ??
      normalizedBasenameMap.get(normalized) ??
      normalizedBasenameMap.get(withoutExtension);

    if (note) {
      resolved.set(note.path, note);
    }
  }

  return Array.from(resolved.values());
}

export const InputBox: React.FC<InputBoxProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  isStopping = false,
  attachedNotes,
  availableNotes,
  onAttachByPath,
  onRemoveAttachment,
  disabled = false,
  maxMentionResults = 8
}) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const activeOptionRef = React.useRef<HTMLButtonElement>(null);
  const isComposingRef = React.useRef(false);
  const [mentionMatch, setMentionMatch] = React.useState<MentionMatch | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(0);
  const [isDropActive, setIsDropActive] = React.useState(false);

  const mentionSuggestions = React.useMemo(
    () => buildMentionSuggestions(availableNotes, attachedNotes, mentionMatch?.query ?? '', maxMentionResults),
    [availableNotes, attachedNotes, mentionMatch?.query, maxMentionResults]
  );

  const syncMentionState = React.useCallback(
    (nextValue: string, nextCaret?: number) => {
      if (disabled || isLoading) {
        setMentionMatch(null);
        return;
      }

      const caret = nextCaret ?? textareaRef.current?.selectionStart ?? nextValue.length;
      setMentionMatch(findMentionMatch(nextValue, caret));
    },
    [disabled, isLoading]
  );

  React.useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [mentionMatch?.query]);

  React.useEffect(() => {
    setActiveSuggestionIndex((index) => {
      if (mentionSuggestions.length === 0) {
        return 0;
      }

      return Math.min(index, mentionSuggestions.length - 1);
    });
  }, [mentionSuggestions.length]);

  React.useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeSuggestionIndex, mentionSuggestions]);

  const handleMentionSelect = React.useCallback(
    (note: MentionableNote) => {
      if (!mentionMatch) {
        return;
      }

      const before = value.slice(0, mentionMatch.start);
      const after = value.slice(mentionMatch.end);
      const needsSpacer = before.length > 0 && after.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
      const nextValue = `${before}${needsSpacer ? ' ' : ''}${after}`;
      const nextCaret = before.length + (needsSpacer ? 1 : 0);

      onChange(nextValue);
      onAttachByPath(note.path);
      setMentionMatch(null);

      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }

        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [mentionMatch, onAttachByPath, onChange, value]
  );

  const insertMentionTrigger = React.useCallback(() => {
    if (disabled || isLoading) {
      return;
    }

    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? value.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const previousChar = selectionStart > 0 ? value[selectionStart - 1] : '';
    const prefix = previousChar && !/\s/.test(previousChar) ? ' @' : '@';
    const nextValue = `${value.slice(0, selectionStart)}${prefix}${value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + prefix.length;

    onChange(nextValue);

    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCaret, nextCaret);
      syncMentionState(nextValue, nextCaret);
    });
  }, [disabled, isLoading, onChange, syncMentionState, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) {
      return;
    }

    if (mentionMatch && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex((index) => (index + 1) % mentionSuggestions.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex((index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }

      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(mentionSuggestions[activeSuggestionIndex]);
        return;
      }
    }

    if (e.key === 'Escape' && mentionMatch) {
      setMentionMatch(null);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && !disabled) {
        onSend();
      }
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    onChange(e.currentTarget.value);
    syncMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    onChange(nextValue);
    syncMentionState(nextValue, e.target.selectionStart ?? nextValue.length);
  };

  const handleSelectionSync = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    syncMentionState(textarea.value, textarea.selectionStart ?? textarea.value.length);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled || isLoading) {
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDropActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
      return;
    }

    setIsDropActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDropActive(false);

    if (disabled || isLoading) {
      return;
    }

    const droppedNotes = resolveDroppedNotes(extractDropPayload(e.dataTransfer), availableNotes);
    if (droppedNotes.length === 0) {
      return;
    }

    droppedNotes.forEach((note) => onAttachByPath(note.path));
    textareaRef.current?.focus();
  };

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  return (
    <div className="kimi-input-box">
      <div
        className={`kimi-composer${isDropActive ? ' kimi-drop-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="kimi-input-surface" onClick={() => textareaRef.current?.focus()}>
          {attachedNotes.length > 0 && (
            <div className="kimi-input-token-row">
              {attachedNotes.map((path) => {
                const fileName = path.split('/').pop() || path;

                return (
                  <span key={path} className="kimi-attachment-chip kimi-attachment-chip-inline" title={path}>
                    <span className="kimi-attachment-chip-name">{fileName}</span>
                    <button
                      type="button"
                      className="kimi-remove-attachment"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAttachment(path);
                      }}
                      disabled={isLoading}
                      aria-label={strings.input.removeAttachment(fileName)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelectionSync}
            onClick={handleSelectionSync}
            onSelect={handleSelectionSync}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={disabled ? strings.input.placeholderDisconnected : strings.input.placeholderConnected}
            disabled={isLoading || disabled}
            rows={1}
          />
        </div>

        {mentionMatch && (
          <div className="kimi-mention-menu" role="listbox" aria-label={strings.input.mentionMenuLabel}>
            {!mentionMatch.query && (
              <div className="kimi-mention-caption">{strings.input.recentNotes}</div>
            )}

            {mentionSuggestions.length > 0 ? (
              mentionSuggestions.map((note, index) => (
                <button
                  key={note.path}
                  ref={index === activeSuggestionIndex ? activeOptionRef : null}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  className={`kimi-mention-option${index === activeSuggestionIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleMentionSelect(note);
                  }}
                >
                  <span className="kimi-mention-name">{note.name}</span>
                  {note.path !== note.name && (
                    <span className="kimi-mention-path">{note.path}</span>
                  )}
                </button>
              ))
            ) : (
              <div className="kimi-mention-empty">{strings.input.mentionEmpty}</div>
            )}
          </div>
        )}

        <div className="kimi-input-row">
          <div className="kimi-input-tools">
            <button
              type="button"
              onClick={insertMentionTrigger}
              disabled={isLoading || disabled}
              className="kimi-secondary-action kimi-mention-trigger"
              title={strings.input.attachCurrentNoteTitle}
              aria-label={strings.input.attachCurrentNoteTitle}
            >
              {strings.input.attachNote}
            </button>
            <span className="kimi-composer-hint">
              {isDropActive ? strings.input.dropActive : strings.input.attachHint}
            </span>
          </div>

          <div className="kimi-input-actions">
            <span className="kimi-input-hint">{strings.input.enterToSend}</span>
            <button
              type="button"
              onClick={isLoading ? onStop : onSend}
              disabled={isLoading ? isStopping || disabled : ((!value.trim() && attachedNotes.length === 0) || disabled)}
              className={`kimi-send-btn${isLoading ? ' kimi-stop-btn' : ''}`}
              title={isLoading ? strings.input.stopMessageTitle : strings.input.sendMessageTitle}
            >
              {isLoading ? (isStopping ? strings.input.stopping : strings.input.stop) : strings.input.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
