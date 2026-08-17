# SillyTavern Lorebook Management

A standalone web app for managing SillyTavern lorebook (World Info) entries with live keyword matching.

## Features

### Entry Management

- **Browse & Edit**: View and edit all lorebook entries across multiple world files
- **Search**: Search entries by name, keywords, or content
- **Categories**: Organize entries by category (world file)
- **Favorites**: Pin frequently used categories for quick access
- **Quick Filter**: Mark entries for live matching panel

### Live Keyword Matching

Real-time matching of lorebook entries against your current ST input:

- **Live Panel**: Shows entries whose keywords match what you're typing in ST
- **Quick Copy**: Select and copy multiple entries at once
- **Live Tracking**: Entries already pasted in chat are automatically hidden from the panel
- **Clipboard Template**: Customize the format of copied entries with `{{content}}` and `{{id}}` placeholders

### Clipboard Template

Configure how entries are copied to clipboard in Settings:

```
[OOC: Background context:
{{content}}
{{id}}]
```

- `{{content}}` - Entry content (multiple entries joined with `---`)
- `{{id}}` - Entry IDs for live tracking (e.g., `Local Support Cast:39`)

### Integration with SillyTavern

Works with the [Analysis Sweep](./analysis-sweep) extension:

- **Textarea Sync**: ST sends your typing to this app for live keyword matching
- **Chat Sync**: ST sends chat messages so the app knows which entries are already pasted
- **World Info Reload**: ST auto-reloads world info when you save changes here

## Setup

1. Configure the worlds directory path in Settings (where ST stores `.json` world files)
2. Install the Analysis Sweep extension in SillyTavern
3. Start this app with `npm run dev`

## Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default.
