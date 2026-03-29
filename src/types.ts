export interface Entry {
  id: string;
  name: string;
  keys: string[];
  content: string;
  category: string;
  extra?: Record<string, unknown>;
}

export interface Category {
  id: string;
  name: string;
}
