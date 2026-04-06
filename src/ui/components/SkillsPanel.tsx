import * as React from 'react';
import ObsidianKimiPlugin from '../../main';
import { getLocalizedStrings } from '../../i18n';

interface SkillsPanelProps {
  plugin: ObsidianKimiPlugin;
  onInsertPrompt: (content: string) => void;
  onClose: () => void;
}

export const SkillsPanel: React.FC<SkillsPanelProps> = ({ plugin, onInsertPrompt, onClose }) => {
  const strings = React.useMemo(() => getLocalizedStrings(), []);
  const vaultBasePath = (plugin.app.vault.adapter as any).basePath || plugin.app.vault.getRoot().path;
  const examplePrompts = [
    {
      label: 'Obsidian Markdown',
      prompt: strings.skillsPanel.markdownPrompt,
    },
    {
      label: 'Obsidian Bases',
      prompt: strings.skillsPanel.basesPrompt,
    },
    {
      label: 'Obsidian CLI',
      prompt: strings.skillsPanel.cliPrompt,
    },
  ];

  return (
    <div className="kimi-skills-panel">
      <div className="kimi-skills-header">
        <h4>{strings.skillsPanel.title}</h4>
        <button type="button" onClick={onClose} className="kimi-close-btn">×</button>
      </div>

      <div className="kimi-skills-list">
        <div className="kimi-skills-empty">
          <p>{strings.skillsPanel.intro}</p>
          <p><code>{strings.skillsPanel.projectSkills(vaultBasePath)}</code></p>
          <p><code>{strings.skillsPanel.userSkills}</code></p>
          <p>{strings.skillsPanel.directoryFormat}</p>
        </div>

        <div className="kimi-skills-empty">
          <p>{strings.skillsPanel.referenceHint}</p>
          {examplePrompts.map((item) => (
            <div key={item.label} className="kimi-skill-item" onClick={() => onInsertPrompt(item.prompt)}>
              <div className="kimi-skill-header">
                <span className="kimi-skill-name">{item.label}</span>
              </div>
              <div className="kimi-skill-desc">{item.prompt}</div>
            </div>
          ))}
        </div>

        <div className="kimi-skills-empty">
          <p>{strings.skillsPanel.recommendedPack}</p>
          <p><code>kepano/obsidian-skills</code></p>
        </div>
      </div>
    </div>
  );
};
