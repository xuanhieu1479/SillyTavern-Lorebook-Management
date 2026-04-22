import type { Entry, Category } from "./types";

const ENTRIES_KEY = "lorebook-entries";
const CATEGORIES_KEY = "lorebook-categories";

export function saveEntries(entries: Entry[]): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

export function saveCategories(categories: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}
