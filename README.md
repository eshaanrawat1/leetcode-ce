# Leetcode Obsidian Clipper

A chrome extension that scrapes problems from LeetCode and CSES and sends them to Obsidian via URI scheme. For leetcode, the scrape includes the code currently in the code editor. For CSES, there is currently no support for scraping code from submitted files - code must be added manually from your local IDE.

## Installation

**Requirements: Chrome 88+ (Manifest V3)**

1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked" and select this folder

**To reload after local development:**

1. Go to `chrome://extensions`
2. Click the refresh arrow on the Chrome Extension card
3. Hard-refresh Leetcode or CSES (`Cmd+Shift+R` / `Ctrl+Shift+R`)



## Features

- **Scrape problem data**: Title, difficulty, topics, description, and code
- **Multi-site support**: LeetCode and CSES
- **Code extraction**: Automatically extracts code from Monaco editor
- **Obsidian integration**: Creates notes with YAML frontmatter and formatted markdown
- **Per-source settings**: Separate vault/subfolder for each site



## Usage

1. Open a problem page on LeetCode or CSES
2. Click the extension icon in your browser toolbar
3. Configure your Obsidian vault and subfolder (optional)
4. Click "Send to Obsidian" to create the note

```yaml
---
date: YYYY-MM-DD
difficulty: Easy/Medium/Hard
num: 123
related_topics:
  - topic1
return:
---
# Problem: 123. Title
## Description
[converted markdown]
## Approach / Thoughts
## Solution
```python
[code]
```

## Architecture

alt text

## Adding New Sites

To add support for a new site, add an entry to the `EXTRACTORS` registry in `content/extract.js`:

```javascript
const EXTRACTORS = {
  leetcode: { /* ... */ },
  cses: { /* ... */ },
  newsite: {
    extractFromDom() {
      // Return { num, title, slug, difficulty, topics, descriptionHtml, solved, code, language, source }
    },
    isLikelyBadTitle(value) {
      // Return true if title looks invalid
    }
  }
};
```

Then update `shared/sources.js` with the site configuration.

## Permissions

- `storage`: Save vault/subfolder settings
- `activeTab`: Access current tab for scraping
- `scripting`: Inject scripts to extract code from Monaco editor
- Host permissions: `leetcode.com/problems/*`, `cses.fi/problemset/task/*`

