import type { Entry } from "./types";

// A child's name extends its parent's full name at a word boundary:
// "Kokushibo+" and "Kokushibo in Fuyuki" are children of "Kokushibo",
// but "Lilyanna" is not a child of "Lily".
function isNamePrefix(parent: string, child: string): boolean {
  return child.length > parent.length
    && child.startsWith(parent)
    && !/[\p{L}\p{N}]/u.test(child[parent.length]);
}

/**
 * Maps each child entry id to its parent entry id, within the same category.
 * Groups are one level deep: "Kokushibo++" belongs to "Kokushibo", not "Kokushibo+".
 */
export function buildParentMap(entries: Entry[]): Map<string, string> {
  const byCategory = new Map<string, { id: string; name: string }[]>();
  for (const e of entries) {
    const name = e.name.trim();
    if (!name) continue;
    const list = byCategory.get(e.category) ?? [];
    list.push({ id: e.id, name });
    byCategory.set(e.category, list);
  }

  const parentOf = new Map<string, string>();
  for (const list of byCategory.values()) {
    const roots = list.filter((e) => !list.some((o) => isNamePrefix(o.name, e.name)));
    for (const e of list) {
      // At most one root can prefix a name, since roots never prefix each other
      const root = roots.find((r) => isNamePrefix(r.name, e.name));
      if (root) parentOf.set(e.id, root.id);
    }
  }
  return parentOf;
}

export interface EntryGroup {
  parent: Entry;
  children: Entry[];
}

/** Nests visible children under their visible parent; children whose parent is filtered out stand alone. */
export function groupEntries(entries: Entry[], parentOf: Map<string, string>): EntryGroup[] {
  const visible = new Set(entries.map((e) => e.id));
  const visibleParent = (e: Entry) => {
    const pid = parentOf.get(e.id);
    return pid && visible.has(pid) ? pid : undefined;
  };

  const groups: EntryGroup[] = [];
  const byParent = new Map<string, EntryGroup>();
  for (const e of entries) {
    if (visibleParent(e)) continue;
    const group = { parent: e, children: [] };
    groups.push(group);
    byParent.set(e.id, group);
  }
  for (const e of entries) {
    const pid = visibleParent(e);
    if (pid) byParent.get(pid)!.children.push(e);
  }
  return groups;
}
