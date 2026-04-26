import type { Entry } from "./types";

export type SearchMode = "name" | "content";

interface ParsedTerm {
  type: "phrase" | "token";
  value: string;
  tokens: string[];
  isOr: boolean;
}

interface ParsedQuery {
  terms: ParsedTerm[];
  orGroups: ParsedTerm[][];
}

const FIELD_WEIGHTS = {
  name: 100,
  content: 10,
};

const PROXIMITY_BONUS = 20;
const EXACT_PHRASE_BONUS = 30;
const EXACT_TOKEN_BONUS = 40;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9À-ɏ]+/i).filter(Boolean);
}

function parseQuery(query: string): ParsedQuery {
  const terms: ParsedTerm[] = [];
  const raw = query.trim();
  if (!raw) return { terms: [], orGroups: [] };

  const re = /"([^"]*)"|'([^']*)'|([^|\s]+)|\|/g;
  let m: RegExpExecArray | null;
  let pendingOr = false;

  while ((m = re.exec(raw)) !== null) {
    if (m[0] === "|") {
      pendingOr = true;
      continue;
    }
    const value = (m[1] ?? m[2] ?? m[3]).trim().toLowerCase();
    if (!value) continue;

    const isPhrase = m[1] !== undefined || m[2] !== undefined;
    const tokens = tokenize(value);
    if (tokens.length === 0) continue;

    terms.push({
      type: isPhrase ? "phrase" : "token",
      value,
      tokens,
      isOr: pendingOr,
    });
    pendingOr = false;
  }

  const orGroups: ParsedTerm[][] = [];
  let currentGroup: ParsedTerm[] = [];

  for (const term of terms) {
    if (term.isOr && currentGroup.length > 0) {
      currentGroup.push(term);
    } else if (term.isOr) {
      currentGroup = [term];
    } else {
      if (currentGroup.length > 0) {
        orGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup = [term];
    }
  }
  if (currentGroup.length > 0) {
    orGroups.push(currentGroup);
  }

  return { terms, orGroups };
}

function tokenMatchesAny(queryToken: string, targetTokens: string[]): boolean {
  return targetTokens.some((t) => t.startsWith(queryToken));
}

function allTokensMatch(queryTokens: string[], targetTokens: string[]): boolean {
  return queryTokens.every((qt) => tokenMatchesAny(qt, targetTokens));
}

function exactMatchBonus(queryTokens: string[], targetTokens: string[]): number {
  let bonus = 0;
  for (const qt of queryTokens) {
    if (targetTokens.some((t) => t === qt)) {
      bonus += EXACT_TOKEN_BONUS;
    }
  }
  return bonus;
}

function phraseMatches(queryTokens: string[], targetTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  if (queryTokens.length > targetTokens.length) return false;

  for (let i = 0; i <= targetTokens.length - queryTokens.length; i++) {
    let match = true;
    for (let j = 0; j < queryTokens.length; j++) {
      if (targetTokens[i + j] !== queryTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function proximityScore(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length < 2) return 0;

  const positions: number[][] = queryTokens.map((qt) => {
    const pos: number[] = [];
    targetTokens.forEach((tt, idx) => {
      if (tt.startsWith(qt)) pos.push(idx);
    });
    return pos;
  });

  if (positions.some((p) => p.length === 0)) return 0;

  let minSpan = Infinity;
  function findMinSpan(idx: number, currentPositions: number[]): void {
    if (idx === positions.length) {
      const span = Math.max(...currentPositions) - Math.min(...currentPositions);
      minSpan = Math.min(minSpan, span);
      return;
    }
    for (const pos of positions[idx]) {
      findMinSpan(idx + 1, [...currentPositions, pos]);
    }
  }
  findMinSpan(0, []);

  if (minSpan === Infinity) return 0;

  const idealSpan = queryTokens.length - 1;
  if (minSpan === idealSpan) return PROXIMITY_BONUS;
  if (minSpan <= idealSpan + 2) return PROXIMITY_BONUS * 0.5;
  if (minSpan <= idealSpan + 5) return PROXIMITY_BONUS * 0.25;
  return 0;
}

interface FieldMatch {
  matched: boolean;
  isPhrase: boolean;
  score: number;
}

function scoreTermInField(term: ParsedTerm, fieldTokens: string[], fieldWeight: number): FieldMatch {
  if (term.type === "phrase") {
    if (phraseMatches(term.tokens, fieldTokens)) {
      return { matched: true, isPhrase: true, score: fieldWeight + EXACT_PHRASE_BONUS };
    }
    return { matched: false, isPhrase: true, score: 0 };
  }

  if (allTokensMatch(term.tokens, fieldTokens)) {
    let score = fieldWeight;
    score += exactMatchBonus(term.tokens, fieldTokens);
    if (term.tokens.length > 1) {
      score += proximityScore(term.tokens, fieldTokens);
    }
    return { matched: true, isPhrase: false, score };
  }

  return { matched: false, isPhrase: false, score: 0 };
}

function scoreTermInEntry(term: ParsedTerm, nameTokens: string[], contentTokens: string[], mode: SearchMode): number {
  if (mode === "name") {
    const nameMatch = scoreTermInField(term, nameTokens, FIELD_WEIGHTS.name);
    if (nameMatch.matched) return nameMatch.score;
  } else {
    const contentMatch = scoreTermInField(term, contentTokens, FIELD_WEIGHTS.content);
    if (contentMatch.matched) return contentMatch.score;
  }

  return 0;
}

function scoreEntry(entry: Entry, query: ParsedQuery, mode: SearchMode): number {
  if (query.orGroups.length === 0) return 0;

  const nameTokens = tokenize(entry.name);
  const contentTokens = tokenize(entry.content);

  let totalScore = 0;

  for (const group of query.orGroups) {
    let groupMatched = false;
    let bestGroupScore = 0;

    for (const term of group) {
      const termScore = scoreTermInEntry(term, nameTokens, contentTokens, mode);
      if (termScore > 0) {
        groupMatched = true;
        bestGroupScore = Math.max(bestGroupScore, termScore);
      }
    }

    if (!groupMatched) {
      return 0;
    }

    totalScore += bestGroupScore;
  }

  return totalScore;
}

export interface SearchResult {
  entry: Entry;
  score: number;
}

export function searchEntries(entries: Entry[], query: string, mode: SearchMode = "name"): SearchResult[] {
  const parsed = parseQuery(query);

  if (parsed.orGroups.length === 0) {
    return entries
      .map((entry) => ({ entry, score: 0 }))
      .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  }

  const results: SearchResult[] = [];

  for (const entry of entries) {
    const score = scoreEntry(entry, parsed, mode);
    if (score > 0) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.name.localeCompare(b.entry.name);
  });

  return results;
}

export function filterByCategory(entries: Entry[], categoryId: string): Entry[] {
  if (!categoryId) return entries;
  return entries.filter((e) => e.category === categoryId);
}
