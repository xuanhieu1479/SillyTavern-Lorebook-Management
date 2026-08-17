export const DEFAULT_TEMPLATE = "{{content}}";

const ENTRY_SEPARATOR = "\n---\n";

export function formatClipboard(template: string, content: string, ids?: string[]): string {
  let result = template;

  if (result.includes("{{content}}")) {
    result = result.replaceAll("{{content}}", content);
  }

  if (result.includes("{{id}}") && ids && ids.length > 0) {
    const combinedIds = ids.join(ENTRY_SEPARATOR);
    result = result.replaceAll("{{id}}", combinedIds);
  } else if (result.includes("{{id}}")) {
    result = result.replaceAll("{{id}}", "");
  }

  return result;
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
