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
  id: string;
  name: string;
  slug: string;
  default_language: string;
  other_languages: string[];
}

export interface LocalizationKey {
  id: string;
  key: string;
  values?: Record<string, string>;
}

export type SelectionType = "none" | "text" | "frame" | "multi" | "instance";

export interface Language {
  key: string;
  name: string;
}

export interface LinkedProjectCache {
  linked: boolean;
  fileId: string | null;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
}
