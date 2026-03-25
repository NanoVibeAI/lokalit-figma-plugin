import { config } from "./config";

const STORAGE_KEY_ACCESS_TOKEN = "lokalit_access_token";
const STORAGE_KEY_REFRESH_TOKEN = "lokalit_refresh_token";
const STORAGE_KEY_LANGUAGE = "lokalit_language";
const STORAGE_KEY_LINK_CACHE_PREFIX = "lokalit_link_cache";
const PLUGIN_DATA_FILE_ID_KEY = "lokalit_file_id";
type PluginCommand = "open-main-ui" | "set-language" | "sign-out";

type LinkedProjectCache = {
  linked: boolean;
  fileId: string | null;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  defaultLanguage: string | null;
  otherLanguages: string[];
};

// ─── Token storage helpers ────────────────────────────────────────────────────

async function getStoredTokens(): Promise<{
  accessToken: string | undefined;
  refreshToken: string | undefined;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEY_ACCESS_TOKEN),
    figma.clientStorage.getAsync(STORAGE_KEY_REFRESH_TOKEN),
  ]);
  return { accessToken, refreshToken };
}

async function storeTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    figma.clientStorage.setAsync(STORAGE_KEY_ACCESS_TOKEN, accessToken),
    figma.clientStorage.setAsync(STORAGE_KEY_REFRESH_TOKEN, refreshToken),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    figma.clientStorage.deleteAsync(STORAGE_KEY_ACCESS_TOKEN),
    figma.clientStorage.deleteAsync(STORAGE_KEY_REFRESH_TOKEN),
  ]);
}

function getScopedLinkCacheKey(): string {
  // Scope cache by the persistent file_id UUID used for backend file mapping.
  return `${STORAGE_KEY_LINK_CACHE_PREFIX}:${getOrCreateFileId()}`;
}

async function getStoredLinkCache(): Promise<LinkedProjectCache | null> {
  const cache = await figma.clientStorage.getAsync(getScopedLinkCacheKey());
  if (!cache || typeof cache !== "object") return null;

  const value = cache as Partial<LinkedProjectCache>;
  return {
    linked: !!value.linked,
    fileId: value.fileId ?? null,
    projectId: value.projectId ?? null,
    projectSlug: value.projectSlug ?? null,
    projectName: value.projectName ?? null,
    defaultLanguage: value.defaultLanguage ?? null,
    otherLanguages: Array.isArray(value.otherLanguages) ? value.otherLanguages : [],
  };
}

async function storeLinkCache(cache: LinkedProjectCache): Promise<void> {
  await figma.clientStorage.setAsync(getScopedLinkCacheKey(), cache);
}

async function clearLinkCache(): Promise<void> {
  await figma.clientStorage.deleteAsync(getScopedLinkCacheKey());
}

function generateUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // RFC 4122 version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateFileId(): string {
  const existing = figma.root.getPluginData(PLUGIN_DATA_FILE_ID_KEY).trim();
  if (existing) return existing;

  const generated = generateUuidV4();
  figma.root.setPluginData(PLUGIN_DATA_FILE_ID_KEY, generated);
  return generated;
}

// ─── Selection helpers ────────────────────────────────────────────────────────

type SerializedNode = {
  id: string;
  name: string;
  type: string;
  characters?: string;
  keySlug?: string | null;
};

function serializeNode(node: SceneNode): SerializedNode {
  const base: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  if (node.type === "TEXT") {
    base.characters = node.characters;
    base.keySlug = node.getPluginData("lokalit_key_slug") || null;
  }
  return base;
}

function collectTextNodes(node: SceneNode): SerializedNode[] {
  if (node.type === "TEXT") return [serializeNode(node)];
  if ("children" in node) {
    return (node as ChildrenMixin).children.flatMap(collectTextNodes);
  }
  return [];
}

function buildSelectionPayload(): object {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return { selectionType: "none" };

  if (selection.some((node) => node.type === "COMPONENT")) {
    return { selectionType: "component" };
  }

  if (selection.length === 1) {
    const node = selection[0];
    if (node.type === "TEXT") {
      return { selectionType: "text", node: serializeNode(node) };
    }
    return {
      selectionType: "frame",
      frameId: node.id,
      frameName: node.name,
      textNodes: collectTextNodes(node),
    };
  }
  return {
    selectionType: "multi",
    textNodes: selection.flatMap(collectTextNodes),
  };
}

async function applyTextUpdates(
  updates: { id: string; characters: string }[],
): Promise<number> {
  let appliedCount = 0;

  for (const update of updates) {
    try {
      const node = await figma.getNodeByIdAsync(update.id);
      if (node?.type === "TEXT") {
        let fontToUse: FontName;
        if (node.fontName === figma.mixed) {
          fontToUse = node.getRangeFontName(0, 1) as FontName;
        } else {
          fontToUse = node.fontName as FontName;
        }
        await figma.loadFontAsync(fontToUse);
        node.characters = update.characters;
        appliedCount += 1;
      }
    } catch (err) {
      console.error(`[Lokalit] Failed to update node ${update.id}:`, err);
    }
  }

  return appliedCount;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const command: PluginCommand = figma.command === "set-language"
    ? "set-language"
    : figma.command === "sign-out"
      ? "sign-out"
      : "open-main-ui";

  if (command === "sign-out") {
    await clearTokens();
    figma.closePlugin("Signed out.");
    return;
  }

  figma.showUI(__html__, {
    width: command === "set-language" ? 360 : 600,
    height: command === "set-language" ? 260 : 400,
    themeColors: true,
  });

  figma.on("selectionchange", () => {
    figma.ui.postMessage({
      type: "selection-change",
      ...buildSelectionPayload(),
    });
  });

  figma.ui.onmessage = async (msg: {
    type: string;
    url?: string;
    accessToken?: string;
    refreshToken?: string;
    language?: string;
    nodeId?: string;
    keySlug?: string | null;
    fileId?: string;
    width?: number;
    height?: number;
    updates?: { id: string; characters: string }[];
  }) => {
    switch (msg.type) {
      case "apply-translations":
      case "revert-translations":
        if (msg.updates) await applyTextUpdates(msg.updates);
        break;

      case "apply-language-to-selection": {
        if (msg.language) {
          await figma.clientStorage.setAsync(STORAGE_KEY_LANGUAGE, msg.language);
        }
        const appliedCount = msg.updates ? await applyTextUpdates(msg.updates) : 0;
        const translationSuffix = appliedCount === 1 ? "" : "s";
        const closeMessage = appliedCount > 0
          ? `Applied ${appliedCount} translation${translationSuffix}.`
          : "No localized text found for the selected language.";
        figma.closePlugin(closeMessage);
        break;
      }

      case "ui-ready": {
        // UI has mounted and registered its message listener — safe to send init now
        const fileId = getOrCreateFileId();
        const [{ accessToken, refreshToken }, language, linkedProjectCache] = await Promise.all([
          getStoredTokens(),
          figma.clientStorage.getAsync(STORAGE_KEY_LANGUAGE),
          getStoredLinkCache(),
        ]);
        figma.ui.postMessage({
          type: "init",
          command,
          authenticated: !!accessToken,
          accessToken,
          refreshToken,
          fileId,
          language: language ?? null,
          linkedProjectCache,
          selection: buildSelectionPayload(),
          config: {
            supabaseUrl: config.SUPABASE_URL,
            supabaseAnonKey: config.SUPABASE_ANON_KEY,
            figmaClientId: config.FIGMA_CLIENT_ID,
            callbackUrl: config.CALLBACK_URL,
            pollUrl: config.POLL_URL,
            apiBaseUrl: config.BASE_API_URL,
          },
        });
        break;
      }

      case "open-url":
        if (msg.url) figma.openExternal(msg.url);
        break;

      case "resize-ui": {
        if (typeof msg.width === "number" && typeof msg.height === "number") {
          figma.ui.resize(msg.width, msg.height);
        }
        break;
      }

      case "store-tokens":
        if (msg.accessToken && msg.refreshToken) {
          await storeTokens(msg.accessToken, msg.refreshToken);
          figma.ui.postMessage({
            type: "auth-state",
            authenticated: true,
            accessToken: msg.accessToken,
            refreshToken: msg.refreshToken,
          });
        }
        break;

      case "store-tokens-silent":
        if (msg.accessToken && msg.refreshToken) {
          await storeTokens(msg.accessToken, msg.refreshToken);
          // No auth-state echo — caller handles UI transition itself
        }
        break;

      case "logout":
        await clearTokens();
        figma.ui.postMessage({ type: "auth-state", authenticated: false });
        break;

      case "store-file-id":
        if (msg.fileId) figma.root.setPluginData(PLUGIN_DATA_FILE_ID_KEY, msg.fileId);
        break;

      case "clear-file-id":
        // Keep stable per-file UUID even when unlinking from a project.
        break;

      case "store-linked-project-cache": {
        const payload = msg as {
          linked?: boolean;
          fileId?: string | null;
          projectId?: string | null;
          projectSlug?: string | null;
          projectName?: string | null;
          defaultLanguage?: string | null;
          otherLanguages?: string[];
        };
        await storeLinkCache({
          linked: !!payload.linked,
          fileId: payload.fileId ?? null,
          projectId: payload.projectId ?? null,
          projectSlug: payload.projectSlug ?? null,
          projectName: payload.projectName ?? null,
          defaultLanguage: payload.defaultLanguage ?? null,
          otherLanguages: Array.isArray(payload.otherLanguages) ? payload.otherLanguages : [],
        });
        break;
      }

      case "clear-linked-project-cache":
        await clearLinkCache();
        break;

      case "set-node-key": {
        if (!msg.nodeId) break;
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (!node || !("setPluginData" in node)) break;

        // Skipping setPluginData for now per user request.

        // We also skip re-emitting selection-change so the UI can optimistically hold state.
        break;
      }

      case "save-nodes-data": {
        const payload = msg as any;
        if (!payload.nodes) break;
        let count = 0;
        for (const item of payload.nodes) {
          const node = await figma.getNodeByIdAsync(item.id);
          if (!node || !("setPluginData" in node)) continue;
          if (item.keySlug) {
            node.setPluginData("lokalit_key_slug", item.keySlug);
          } else {
            node.setPluginData("lokalit_key_slug", "");
          }
          count++;
        }
        break;
      }

      case "set-language":
        if (msg.language) {
          await figma.clientStorage.setAsync(
            STORAGE_KEY_LANGUAGE,
            msg.language,
          );
        }
        break;

      case "notify": {
        const notifyPayload = msg as any;
        if (notifyPayload.message) {
          figma.notify(notifyPayload.message, notifyPayload.options);
        }
        break;
      }

      case "cancel":
        figma.closePlugin();
        break;
    }
  };
}

init();
