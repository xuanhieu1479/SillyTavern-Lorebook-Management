export interface Entry {
  id: string;
  name: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  category: string;
  extra?: Record<string, unknown>;
}

export interface Category {
  id: string;
  name: string;
  extras?: Record<string, unknown>;
}
