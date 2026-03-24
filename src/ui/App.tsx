import { useState, useEffect, useCallback, useRef } from "react";
import type { PluginConfig, SerializedNode, Project, LocalizationKey } from "./types";
import { isTokenExpired, refreshAccessToken, exchangeCodeForTokens, api } from "./api";
import { generateCodeVerifier, generateCodeChallenge, generateRequestId } from "./crypto";
import { LoginScreen } from "./LoginScreen";
import { PollingScreen } from "./PollingScreen";
import { MainScreen } from "./MainScreen";

type Screen = "loading" | "login" | "polling" | "main";

function postMsg(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

function getEmailFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.email || null;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [cfg, setCfg] = useState<PluginConfig | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshTokenState, setRefreshTokenState] = useState<string | null>(null);

  const userEmail = getEmailFromToken(accessToken);

  // Main screen state
  const [linked, setLinked] = useState(false);
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [keys, setKeys] = useState<LocalizationKey[]>([]);
  const [language, setLanguageState] = useState<string | null>(null);

  // Selection state
  const [selectionType, setSelectionType] = useState<"none" | "text" | "frame" | "multi">("none");
  const [selectionNode, setSelectionNode] = useState<SerializedNode | null>(null);
  const [selectionTextNodes, setSelectionTextNodes] = useState<SerializedNode[]>([]);

  // OAuth polling
  const [loginError, setLoginError] = useState<string | null>(null);
  const [pollingMsg, setPollingMsg] = useState("Waiting for authentication in your browser…");
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs to keep latest token values in callbacks
  const accessTokenRef = useRef(accessToken);
  const refreshTokenRef = useRef(refreshTokenState);
  const cfgRef = useRef(cfg);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  useEffect(() => { refreshTokenRef.current = refreshTokenState; }, [refreshTokenState]);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // ── Token helpers ────────────────────────────────────────────────────────
  const forceLogout = useCallback(() => {
    setAccessToken(null);
    setRefreshTokenState(null);
    setScreen("login");
    postMsg({ type: "logout" });
  }, []);

  const storeTokensSilent = useCallback((access: string, refresh: string) => {
    setAccessToken(access);
    setRefreshTokenState(refresh);
    postMsg({ type: "store-tokens-silent", accessToken: access, refreshToken: refresh });
  }, []);

  // ── API wrapper using current token state ────────────────────────────────
  const callApi = useCallback(async (method: string, path: string, body?: unknown) => {
    if (!cfgRef.current) throw new Error("Config not loaded");
    return api(method, path, body, {
      cfg: cfgRef.current,
      tokens: { accessToken: accessTokenRef.current, refreshToken: refreshTokenRef.current },
      onTokensRefreshed: (access, refresh) => {
        storeTokensSilent(access, refresh);
        // Update refs immediately so subsequent calls in the same tick use new tokens
        accessTokenRef.current = access;
        refreshTokenRef.current = refresh;
      },
      onForceLogout: forceLogout,
    });
  }, [forceLogout, storeTokensSilent]);

  // ── Load main data (file mapping + projects + keys) ──────────────────────
  const loadMainData = useCallback(async (fid: string | null) => {
    setScreen("main");
    try {
      const [mappingRes, projectsRes] = await Promise.all([
        fid ? callApi("GET", `/api/figma/file-mapping?fileId=${encodeURIComponent(fid)}`) : Promise.resolve({ linked: false }),
        callApi("GET", "/api/figma/projects"),
      ]) as [
        { linked: boolean; projectSlug?: string; fileId?: string },
        { projects?: Project[] },
      ];

      const loadedProjects = projectsRes.projects || [];
      setProjects(loadedProjects);

      if (mappingRes.linked && mappingRes.projectSlug) {
        setLinked(true);
        setProjectSlug(mappingRes.projectSlug);
        try {
          const keysRes = (await callApi("GET", `/api/projects/${encodeURIComponent(mappingRes.projectSlug)}/keys`)) as { keys?: LocalizationKey[] };
          setKeys(keysRes.keys || []);
        } catch {
          setKeys([]);
        }
      } else {
        setLinked(false);
        setProjectSlug(null);
        setKeys([]);
      }
    } catch (err) {
      console.error("[Lokalit] loadMainData failed:", err);
    }
  }, [callApi]);

  // ── OAuth flow ───────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const startOAuthFlow = useCallback(() => {
    if (!cfgRef.current) return;
    const config = cfgRef.current;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const requestId = generateRequestId();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.figmaClientId,
      redirect_uri: config.callbackUrl,
      scope: "openid email",
      state: requestId,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    postMsg({ type: "open-url", url: `${config.supabaseUrl}/auth/v1/oauth/authorize?${params}` });

    setPollingMsg("Waiting for authentication in your browser…");
    setScreen("polling");
    setLoginError(null);

    stopPolling();
    let attempts = 0;
    pollingTimerRef.current = setInterval(async () => {
      if (++attempts > 60) {
        stopPolling();
        setScreen("login");
        setLoginError("Authentication timed out. Please try again.");
        return;
      }
      let data: { code?: string };
      try {
        const res = await fetch(`${config.pollUrl}?request_id=${encodeURIComponent(requestId)}`);
        if (!res.ok) return;
        data = await res.json();
      } catch {
        return;
      }
      if (!data.code) return;

      stopPolling();
      setPollingMsg("Completing sign-in…");
      try {
        const tokens = await exchangeCodeForTokens(config, data.code, codeVerifier);
        postMsg({ type: "store-tokens", accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      } catch (err) {
        console.error("[Lokalit] Token exchange failed:", err);
        setScreen("login");
        setLoginError("Sign-in failed. Please try again.");
      }
    }, 5000);
  }, [stopPolling]);

  // ── Set language ─────────────────────────────────────────────────────────
  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    postMsg({ type: "set-language", language: lang });
  }, []);

  // ── Assign key to node ───────────────────────────────────────────────────
  const assignNodeKey = useCallback((nodeId: string, keySlug: string | null) => {
    postMsg({ type: "set-node-key", nodeId, keySlug });
    
    // Optimistic UI Update: the user specifically requested skipping Figma writes for now
    // so we update the local React state directly to see UI changes.
    setSelectionTextNodes(prev => prev.map(n => n.id === nodeId ? { ...n, keySlug } : n));
    setSelectionNode(prev => prev && prev.id === nodeId ? { ...prev, keySlug } : prev);
  }, []);

  // ── Link/unlink/save settings ────────────────────────────────────────────
  const saveFileLink = useCallback(async (slug: string) => {
    const res = await callApi("POST", "/api/figma/file-mapping", { fileId, projectSlug: slug }) as { fileId?: string };
    if (res.fileId) {
      setFileId(res.fileId);
      postMsg({ type: "store-file-id", fileId: res.fileId });
    }
    
    setLinked(true);
    setProjectSlug(slug);
    try {
      const keysRes = (await callApi("GET", `/api/projects/${encodeURIComponent(slug)}/keys`)) as { keys?: LocalizationKey[] };
      setKeys(keysRes.keys || []);
    } catch {
      setKeys([]);
    }
  }, [fileId, callApi]);

  const updateKeyValue = useCallback(async (keyId: string, lang: string, value: string) => {
    if (!projectSlug) return;
    try {
      await callApi("PATCH", `/api/projects/${encodeURIComponent(projectSlug)}/keys/${encodeURIComponent(keyId)}`, {
        lang,
        value
      });
      setKeys((prev) => prev.map((k) => 
        k._id === keyId ? { ...k, values: { ...k.values, [lang]: value } } : k
      ));
    } catch (err) {
      console.error("[Lokalit] Failed to update key value:", err);
    }
  }, [projectSlug, callApi]);

  const applyTranslations = useCallback((nodes: SerializedNode[], lang: string | null) => {
    if (!lang) return;
    const updates = nodes.map(n => {
      const keyObj = keys.find(k => k.key === n.keySlug);
      if (!keyObj || !keyObj.values) return null;
      let val = keyObj.values[lang];
      if (!val) {
        const approx = Object.keys(keyObj.values).find(k => k.startsWith(lang + "-") || lang.startsWith(k + "-"));
        if (approx) val = keyObj.values[approx];
      }
      if (!val) return null;
      return { id: n.id, characters: val };
    }).filter((u): u is { id: string; characters: string } => u !== null);
    
    if (updates.length > 0) {
      postMsg({ type: "apply-translations", updates });
    }
  }, [keys]);

  const revertTranslations = useCallback((nodes: SerializedNode[]) => {
    const updates = nodes.map(n => ({ id: n.id, characters: n.characters || "" }));
    if (updates.length > 0) {
      postMsg({ type: "revert-translations", updates });
    }
  }, []);

  const unlinkFile = useCallback(async () => {
    if (!fileId) return;
    await callApi("DELETE", `/api/figma/file-mapping?fileId=${encodeURIComponent(fileId)}`);
    postMsg({ type: "clear-file-id" });
    setLinked(false);
    setProjectSlug(null);
    setKeys([]);
  }, [fileId, callApi]);

  // ── Messages from code.ts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "init") {
        const config: PluginConfig = msg.config;
        setCfg(config);
        cfgRef.current = config;
        setFileId(msg.fileId || null);
        setLanguageState(msg.language || null);

        const at = msg.accessToken || null;
        const rt = msg.refreshToken || null;
        setAccessToken(at);
        setRefreshTokenState(rt);
        accessTokenRef.current = at;
        refreshTokenRef.current = rt;

        if (msg.selection) {
          setSelectionType(msg.selection.selectionType || "none");
          setSelectionNode(msg.selection.node || null);
          setSelectionTextNodes(msg.selection.textNodes || []);
        }

        if (!msg.authenticated) {
          setScreen("login");
          return;
        }

        // Refresh token if expired
        if (at && isTokenExpired(at) && rt) {
          try {
            const tokens = await refreshAccessToken(config, rt);
            const newAt = tokens.access_token;
            const newRt = tokens.refresh_token;
            setAccessToken(newAt);
            setRefreshTokenState(newRt);
            accessTokenRef.current = newAt;
            refreshTokenRef.current = newRt;
            postMsg({ type: "store-tokens-silent", accessToken: newAt, refreshToken: newRt });
          } catch (err) {
            console.error("[Lokalit] Token refresh failed on init:", err);
            setAccessToken(null);
            setRefreshTokenState(null);
            setScreen("login");
            postMsg({ type: "logout" });
            return;
          }
        }

        await loadMainData(msg.fileId || null);
        return;
      }

      if (msg.type === "auth-state") {
        stopPolling();
        if (msg.authenticated) {
          const at = msg.accessToken || null;
          const rt = msg.refreshToken || null;
          if (at) { setAccessToken(at); accessTokenRef.current = at; }
          if (rt) { setRefreshTokenState(rt); refreshTokenRef.current = rt; }
          await loadMainData(fileId);
        } else {
          setAccessToken(null);
          setRefreshTokenState(null);
          setScreen("login");
        }
        return;
      }

      if (msg.type === "selection-change") {
        setSelectionType(msg.selectionType || "none");
        setSelectionNode(msg.node || null);
        setSelectionTextNodes(msg.textNodes || []);
        return;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fileId, loadMainData, stopPolling]);

  // Signal to the plugin that the UI is mounted and the message listener is registered.
  // Must run exactly once — after the listener effect above has run on the first render.
  useEffect(() => {
    postMsg({ type: "ui-ready" });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="center">
        <div className="spinner" />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (screen === "login") {
    return <LoginScreen error={loginError} onLogin={startOAuthFlow} />;
  }

  if (screen === "polling") {
    return <PollingScreen message={pollingMsg} />;
  }

  return (
    <MainScreen
      linked={linked}
      projectSlug={projectSlug}
      projects={projects}
      keys={keys}
      language={language}
      selectionType={selectionType}
      selectionNode={selectionNode}
      selectionTextNodes={selectionTextNodes}
      userEmail={userEmail}
      onSetLanguage={setLanguage}
      onAssignNodeKey={assignNodeKey}
      onUpdateKeyValue={updateKeyValue}
      onApplyTranslations={applyTranslations}
      onRevertTranslations={revertTranslations}
      onSaveFileLink={saveFileLink}
      onUnlinkFile={unlinkFile}
      onLogout={forceLogout}
    />
  );
}
