export const DEFAULT_TEMPLATE = "{{content}}";

const ENTRY_SEPARATOR = "\n---\n";

interface ClipboardEntry {
  id: string;
  content: string;
}

export function formatClipboard(template: string, entries: ClipboardEntry[]): string {
  if (entries.length === 0) {
    return template.replaceAll("{{content}}", "").replaceAll("{{id}}", "");
  }

  const hasId = template.includes("{{id}}");
  const hasContent = template.includes("{{content}}");

  if (!hasId && !hasContent) {
    return template;
  }

  // Find the per-entry portion of the template (from first placeholder to last)
  const idIndex = hasId ? template.indexOf("{{id}}") : Infinity;
  const contentIndex = hasContent ? template.indexOf("{{content}}") : Infinity;
  const idEndIndex = hasId ? idIndex + "{{id}}".length : 0;
  const contentEndIndex = hasContent ? contentIndex + "{{content}}".length : 0;

  const startIdx = Math.min(idIndex, contentIndex);
  const endIdx = Math.max(idEndIndex, contentEndIndex);

  const prefix = template.slice(0, startIdx);
  const perEntryTemplate = template.slice(startIdx, endIdx);
  const suffix = template.slice(endIdx);

  // Format each entry using the per-entry template
  const formattedEntries = entries.map(e => {
    let formatted = perEntryTemplate;
    if (hasId) formatted = formatted.replaceAll("{{id}}", e.id);
    if (hasContent) formatted = formatted.replaceAll("{{content}}", e.content);
    return formatted;
  });

  // Join entries with separator
  const joined = formattedEntries.join(ENTRY_SEPARATOR);

  return prefix + joined + suffix;
}

// Extract entry IDs from text. IDs have format "CategoryName:uid"
// They appear separated by \n---\n in the pasted content
export function extractEntryIds(text: string): string[] {
  // Match pattern: word characters, spaces, hyphens, apostrophes followed by colon and digits
  // This matches IDs like "Local Support Cast:39" or "Eternal Servitude Main Cast:63"
  const idPattern = /[\w\s\-']+:\d+/g;
  const matches = text.match(idPattern) || [];
  return [...new Set(matches.map(id => id.trim()))];
}
