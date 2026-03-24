export interface PluginConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  figmaClientId: string;
  callbackUrl: string;
  pollUrl: string;
  apiBaseUrl: string;
}

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  keySlug?: string | null;
}

export interface Project {
  _id: string;
  name: string;
  slug: string;
  defaultLanguage: string;
  otherLanguages: string[];
}

export interface LocalizationKey {
  _id: string;
  key: string;
  values?: Record<string, string>;
}

export type SelectionType = "none" | "text" | "frame" | "multi" | "instance";

export interface Language {
  key: string;
  name: string;
}
