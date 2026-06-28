export const DEFAULT_TEMPLATE = "{{content}}";

export function formatClipboard(template: string, content: string): string {
  if (template.includes("{{content}}")) {
    return template.replaceAll("{{content}}", content);
  }
  return template;
}
