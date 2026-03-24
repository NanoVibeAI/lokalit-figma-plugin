import { config } from "./config";

const STORAGE_KEY_ACCESS_TOKEN = "lokalit_access_token";
const STORAGE_KEY_REFRESH_TOKEN = "lokalit_refresh_token";
const STORAGE_KEY_LANGUAGE = "lokalit_language";

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

  if (selection.some((node) => node.type === "INSTANCE")) {
    return { selectionType: "instance" };
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

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  figma.showUI(__html__, { width: 600, height: 400, themeColors: true });

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
    updates?: { id: string; characters: string }[];
  }) => {
    switch (msg.type) {
      case "apply-translations":
      case "revert-translations":
        if (msg.updates) {
          for (const update of msg.updates) {
            try {
              const node = await figma.getNodeByIdAsync(update.id);
              if (node && node.type === "TEXT") {
                // Load font before changing characters
                let fontToUse: FontName;
                if (node.fontName === figma.mixed) {
                  fontToUse = node.getRangeFontName(0, 1) as FontName;
                } else {
                  fontToUse = node.fontName as FontName;
                }
                await figma.loadFontAsync(fontToUse);
                node.characters = update.characters;
              }
            } catch (err) {
              console.error(
                `[Lokalit] Failed to update node ${update.id}:`,
                err,
              );
            }
          }
          figma.notify(`Updated ${msg.updates.length} nodes`);
        }
        break;

      case "ui-ready": {
        // UI has mounted and registered its message listener — safe to send init now
        const [{ accessToken, refreshToken }, language] = await Promise.all([
          getStoredTokens(),
          figma.clientStorage.getAsync(STORAGE_KEY_LANGUAGE),
        ]);
        figma.ui.postMessage({
          type: "init",
          authenticated: !!accessToken,
          accessToken,
          refreshToken,
          fileId: figma.root.getPluginData("lokalit_file_id") || null,
          language: language != null ? language : null,
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
        if (msg.fileId) figma.root.setPluginData("lokalit_file_id", msg.fileId);
        break;

      case "clear-file-id":
        figma.root.setPluginData("lokalit_file_id", "");
        break;

      case "set-node-key": {
        // figma.notify(`set-node-key received! node: ${msg.nodeId}, slug: ${msg.keySlug}`);
        if (!msg.nodeId) break;
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        // figma.notify(`Node found? ${!!node}`);
        if (!node || !("setPluginData" in node)) break;

        // Skipping setPluginData for now per user request.

        // We also skip re-emitting selection-change so the UI can optimistically hold state.
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

      case "cancel":
        figma.closePlugin();
        break;
    }
  };
}

init();
