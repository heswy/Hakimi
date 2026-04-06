# Kimi Skills for Obsidian

This folder contains example skills that you can use with Kimi in Obsidian.

## What are Skills?

Skills are reusable prompt templates that help you perform specific tasks with Kimi. They can be stored in:

1. `~/.kimi/skills/` - Global skills available across all projects
2. `.kimi/skills/` (in your vault) - Vault-specific skills

## How to Use

1. Copy any `.md` file from this folder to your skills directory
2. The skill will automatically appear in the Skills panel (🛠️ button)
3. Click on a skill to insert its content into the chat

## Available Skills

### note-organizer
Helps you organize and structure your notes with proper headings, tags, and links.

### daily-reflection
Guides you through a daily reflection journaling session.

### meeting-notes
Formats your meeting notes with action items and attendees.

### zettelkasten-writer
Helps you write atomic notes following the Zettelkasten method.

## Creating Your Own Skills

A skill is just a Markdown file with:

```markdown
---
description: Brief description of what this skill does
---

Your prompt template here...
```

The skill will be shown in the panel with its filename (without extension) as the name.
