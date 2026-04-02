import * as React from "react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { PluginConfig, SerializedNode, Project, LocalizationKey, Language, SelectionType, LinkedProjectCache } from "./types";
import { isTokenExpired, refreshAccessToken, exchangeCodeForTokens, api } from "./api";
import { generateCodeVerifier, generateCodeChallenge, generateRequestId } from "./crypto";
import { LoginScreen } from "./LoginScreen";
import { PollingScreen } from "./PollingScreen";
import { MainScreen } from "./MainScreen";
import { SetLanguageScreen } from "./SetLanguageScreen";
import { NoProjectsDialog } from "./NoProjectsDialog";

type Screen = "loading" | "login" | "polling" | "main";
type PluginCommand = "open-main-ui" | "set-language";

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
  const [pluginCommand, setPluginCommand] = useState<PluginCommand>("open-main-ui");
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
  const [originalKeys, setOriginalKeys] = useState<LocalizationKey[]>([]);
  const [language, setLanguageState] = useState<string | null>(null);
  const [allLanguages, setAllLanguages] = useState<Language[]>([]);
  const [applyingLanguage, setApplyingLanguage] = useState(false);
  const [mainDataLoaded, setMainDataLoaded] = useState(false);

  // Selection state
  const [selectionType, setSelectionType] = useState<SelectionType>("none");
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

  const updateLinkedProjectCache = useCallback((cache: LinkedProjectCache) => {
    postMsg({
      type: "store-linked-project-cache",
      linked: cache.linked,
      fileId: cache.fileId,
      projectId: cache.projectId,
      projectSlug: cache.projectSlug,
      projectName: cache.projectName,
      defaultLanguage: cache.defaultLanguage,
      otherLanguages: cache.otherLanguages,
    });
  }, []);

  const clearLinkedProjectCache = useCallback(() => {
    postMsg({ type: "clear-linked-project-cache" });
  }, []);

  // ── Load main data (file mapping + projects + keys) ──────────────────────
  const loadMainData = useCallback(async (fid: string | null) => {
    setMainDataLoaded(false);
    try {
      const [mappingRes, projectsRes, languagesRes] = await Promise.all([
        fid ? callApi("GET", `/api/figma/file-mapping?fileId=${encodeURIComponent(fid)}`) : Promise.resolve({ linked: false }),
        callApi("GET", "/api/figma/projects"),
        callApi("GET", "/api/global/languages"),
      ]) as [
        { linked: boolean; projectSlug?: string; fileId?: string },
        { projects?: Project[] },
        Language[],
      ];

      const loadedProjects = projectsRes.projects || [];
      setProjects(loadedProjects);
      setAllLanguages(languagesRes || []);

      if (mappingRes.linked && mappingRes.projectSlug) {
        const matchedProject = loadedProjects.find((project) => project.slug === mappingRes.projectSlug) || null;
        setLinked(true);
        setProjectSlug(mappingRes.projectSlug);
        updateLinkedProjectCache({
          linked: true,
          fileId: mappingRes.fileId || fid,
          projectId: matchedProject?.id || null,
          projectSlug: mappingRes.projectSlug,
          projectName: matchedProject?.name || null,
          defaultLanguage: matchedProject?.default_language || null,
          otherLanguages: matchedProject?.other_languages || [],
        });
        try {
          const keysRes = (await callApi("GET", `/api/projects/${encodeURIComponent(mappingRes.projectSlug)}/keys`)) as { keys?: LocalizationKey[] };
          const loadedKeys = keysRes.keys || [];
          setKeys(loadedKeys);
          setOriginalKeys(loadedKeys);
        } catch {
          setKeys([]);
          setOriginalKeys([]);
        }
      } else {
        setLinked(false);
        setProjectSlug(null);
        setKeys([]);
        setOriginalKeys([]);
        clearLinkedProjectCache();
      }
    } catch (err) {
      console.error("[Lokalit] loadMainData failed:", err);
    } finally {
      setMainDataLoaded(true);
    }
  }, [callApi, clearLinkedProjectCache, updateLinkedProjectCache]);

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
    setSelectionTextNodes(prev => prev.map(n => n.id === nodeId ? { ...n, keySlug: keySlug } : n));
    setSelectionNode(prev => prev && prev.id === nodeId ? { ...prev, keySlug: keySlug } : prev);
  }, []);

  // ── Link/unlink/save settings ────────────────────────────────────────────
  const saveFileLink = useCallback(async (slug: string) => {
    const res = await callApi("POST", "/api/figma/file-mapping", { fileId, projectSlug: slug }) as { fileId?: string };
    if (res.fileId) {
      setFileId(res.fileId);
      postMsg({ type: "store-file-id", fileId: res.fileId });
    }

    const selectedProject = projects.find((project) => project.slug === slug) || null;
    setLinked(true);
    setProjectSlug(slug);
    updateLinkedProjectCache({
      linked: true,
      fileId: res.fileId || fileId,
      projectId: selectedProject?.id || null,
      projectSlug: slug,
      projectName: selectedProject?.name || null,
      defaultLanguage: selectedProject?.default_language || null,
      otherLanguages: selectedProject?.other_languages || [],
    });
    try {
      const keysRes = (await callApi("GET", `/api/projects/${encodeURIComponent(slug)}/keys`)) as { keys?: LocalizationKey[] };
      const loadedKeys = keysRes.keys || [];
      setKeys(loadedKeys);
      setOriginalKeys(loadedKeys);
    } catch {
      setKeys([]);
      setOriginalKeys([]);
    }
  }, [fileId, callApi, projects, updateLinkedProjectCache]);

  const checkSlugAvailable = useCallback(async (slug: string) => {
    const res = await callApi("GET", `/api/projects?slug=${encodeURIComponent(slug)}`) as { available?: boolean };
    return !!res.available;
  }, [callApi]);

  const createProject = useCallback(async (input: {
    name: string;
    slug: string;
    defaultLanguage: string;
    otherLanguages: string[];
  }) => {
    const res = await callApi("POST", "/api/projects", {
      name: input.name,
      slug: input.slug,
      defaultLanguage: input.defaultLanguage,
      otherLanguages: input.otherLanguages,
    }) as { project?: Project };

    if (!res.project) {
      throw new Error("Project creation failed.");
    }

    setProjects((prev) => {
      const withoutDup = prev.filter((p) => p.slug !== res.project!.slug);
      return [...withoutDup, res.project!].sort((a, b) => a.name.localeCompare(b.name));
    });

    return res.project;
  }, [callApi]);

  const handleFirstProjectCreated = useCallback(async (project: Project) => {
    try {
      await saveFileLink(project.slug);
      setLanguage(project.default_language);
    } catch (err) {
      console.error("[Lokalit] Failed to auto-link first project:", err);
      notify("Project created, but auto-link failed. Please link manually.", { error: true });
    }
  }, [saveFileLink, setLanguage]);

  const updateKeyValue = useCallback((keyId: string, lang: string, value: string) => {
    setKeys((prev) => prev.map((k) =>
      k.id === keyId ? { ...k, values: { ...k.values, [lang]: value } } : k
    ));
  }, []);

  const createKey = useCallback(async (keyName: string) => {
    // Local-only creation until Sync is clicked
    const newKey: LocalizationKey = {
      id: `temp_${Date.now()}`,
      key: keyName.trim(),
      values: {},
    };
    setKeys((prev) => [...prev, newKey].sort((a, b) => a.key.localeCompare(b.key)));
    return newKey;
  }, []);

  const applySelectedLanguage = useCallback(async () => {
    if (!projectSlug || !language) return;

    const nodes = selectionType === "text" && selectionNode ? [selectionNode] : selectionTextNodes;
    const nodesWithKeys = nodes.filter((node) => !!node.keySlug);
    if (nodesWithKeys.length === 0) return;

    setApplyingLanguage(true);
    try {
      const keysRes = (await callApi(
        "GET",
        `/api/projects/${encodeURIComponent(projectSlug)}/keys`,
      )) as { keys?: LocalizationKey[] };
      const latestKeys = keysRes.keys || [];

      setKeys(latestKeys);
      setOriginalKeys(latestKeys);

      const updates = nodesWithKeys
        .map((node) => {
          const keyObj = latestKeys.find((key) => key.key === node.keySlug);
          const value = keyObj?.values?.[language];
          if (!value) return null;
          return { id: node.id, characters: value };
        })
        .filter((update): update is { id: string; characters: string } => update !== null);

      postMsg({
        type: "apply-language-to-selection",
        language,
        updates,
      });
    } catch (err) {
      console.error("[Lokalit] Failed to apply selected language:", err);
      notify("Failed to apply selected language.", { error: true });
      setApplyingLanguage(false);
    }
  }, [callApi, language, projectSlug, selectionNode, selectionTextNodes, selectionType]);

  // ── Auto-sync node plugin data ───────────────────────────────────────────
  useEffect(() => {
    if (!linked) return;
    const nodes = selectionType === "text" && selectionNode ? [selectionNode] : selectionTextNodes;
    if (nodes.length === 0) return;

    const dataToSave = nodes.map(n => ({ 
      id: n.id, 
      keySlug: n.keySlug || null 
    }));
    
    postMsg({ type: "save-nodes-data", nodes: dataToSave });
  }, [selectionTextNodes, linked, selectionType, selectionNode]);

  const syncKeys = useCallback(async (allKeys: LocalizationKey[]) => {
    if (!projectSlug) return;
    try {
      const payload = allKeys
        .filter((key) => {
          const original = originalKeys.find((candidate) => candidate.id === key.id);
          if (!original) return true;
          return JSON.stringify(key.values || {}) !== JSON.stringify(original.values || {});
        })
        .map((key) => ({
          key: key.key,
          values: key.values || {},
        }));

      if (payload.length === 0) {
        return;
      }

      const res = await callApi("POST", `/api/projects/${encodeURIComponent(projectSlug)}/keys/bulk`, {
        keys: payload
      }) as { keys: LocalizationKey[] };

      if (res.keys) {
        const sorted = res.keys.sort((a, b) => a.key.localeCompare(b.key));
        setKeys(sorted);
        setOriginalKeys(sorted);
      }
    } catch (err) {
      console.error("[Lokalit] Sync failed:", err);
      throw err;
    }
  }, [projectSlug, callApi, originalKeys]);

  const undoLocalKeyChanges = useCallback(() => {
    const restored = originalKeys
      .map((key) => ({
        ...key,
        values: { ...(key.values || {}) },
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    setKeys(restored);
  }, [originalKeys]);

  const applyTranslations = useCallback((nodes: SerializedNode[], lang: string | null) => {
    if (!lang) return;
    const updates = nodes.map(n => {
      const keyObj = keys.find(k => k.key === n.keySlug);
      if (!keyObj || !keyObj.values) return null;
      let val = keyObj.values[lang];
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
    setLinked(false);
    setProjectSlug(null);
    setKeys([]);
    setOriginalKeys([]);
    clearLinkedProjectCache();
  }, [fileId, callApi, clearLinkedProjectCache]);

  const notify = (message: string, options?: { error?: boolean; timeout?: number }) => {
    postMsg({ type: "notify", message, options });
  };

  const isDirty = useMemo(() => {
    if (keys.length !== originalKeys.length) return true;
    for (const k of keys) {
      if (k.id.startsWith("temp_")) return true;
      const origK = originalKeys.find((o) => o.id === k.id);
      if (!origK) return true;
      if (JSON.stringify(k.values) !== JSON.stringify(origK.values)) return true;
    }
    return false;
  }, [keys, originalKeys]);

  // ── Messages from code.ts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "init") {
        const config: PluginConfig = msg.config;
        setCfg(config);
        cfgRef.current = config;
        setPluginCommand(msg.command === "set-language" ? "set-language" : "open-main-ui");
        setFileId(msg.fileId || null);
        setLanguageState(msg.language || null);

        const cachedLink = (msg.linkedProjectCache || null) as LinkedProjectCache | null;
        if (cachedLink?.linked && cachedLink.projectSlug) {
          setLinked(true);
          setProjectSlug(cachedLink.projectSlug);
          setProjects((prev) => {
            const cachedProject: Project = {
              id: cachedLink.projectId || `cached:${cachedLink.projectSlug}`,
              name: cachedLink.projectName || cachedLink.projectSlug,
              slug: cachedLink.projectSlug,
              default_language: cachedLink.defaultLanguage || msg.language || "en",
              other_languages: cachedLink.otherLanguages || [],
            };
            const withoutDup = prev.filter((project) => project.slug !== cachedProject.slug);
            return [cachedProject, ...withoutDup];
          });
        }

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

        setScreen("main");

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

        void loadMainData(msg.fileId || null);
        return;
      }

      if (msg.type === "auth-state") {
        stopPolling();
        if (msg.authenticated) {
          const at = msg.accessToken || null;
          const rt = msg.refreshToken || null;
          if (at) { setAccessToken(at); accessTokenRef.current = at; }
          if (rt) { setRefreshTokenState(rt); refreshTokenRef.current = rt; }
          setScreen("main");
          void loadMainData(fileId);
        } else {
          setAccessToken(null);
          setRefreshTokenState(null);
          setLinked(false);
          setProjectSlug(null);
          setProjects([]);
          setKeys([]);
          setOriginalKeys([]);
          setScreen("login");
          clearLinkedProjectCache();
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
  }, [clearLinkedProjectCache, fileId, loadMainData, stopPolling]);

  // Signal to the plugin that the UI is mounted and the message listener is registered.
  // Must run exactly once — after the listener effect above has run on the first render.
  useEffect(() => {
    postMsg({ type: "ui-ready" });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const shouldShowNoProjectsDialog = screen === "main" && mainDataLoaded && projects.length === 0;

  useEffect(() => {
    if (shouldShowNoProjectsDialog) {
      postMsg({ type: "resize-ui", width: 520, height: 640 });
      return;
    }

    postMsg({
      type: "resize-ui",
      width: pluginCommand === "set-language" ? 360 : 600,
      height: pluginCommand === "set-language" ? 360 : 400,
    });
  }, [pluginCommand, shouldShowNoProjectsDialog]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (screen === "loading" || (screen === "main" && !mainDataLoaded)) {
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

  if (shouldShowNoProjectsDialog) {
    return (
      <NoProjectsDialog
        allLanguages={allLanguages}
        onCheckSlugAvailable={checkSlugAvailable}
        onCreateProject={createProject}
        onProjectCreated={handleFirstProjectCreated}
      />
    );
  }

  if (pluginCommand === "set-language") {
    const currentProject = projects.find((project) => project.slug === projectSlug) || null;
    return (
      <SetLanguageScreen
        linked={linked}
        project={currentProject}
        allLanguages={allLanguages}
        currentLanguage={language || currentProject?.default_language || null}
        selectionType={selectionType}
        selectionNode={selectionNode}
        selectionTextNodes={selectionTextNodes}
        applying={applyingLanguage}
        onSelectLanguage={setLanguage}
        onConfirm={applySelectedLanguage}
        onCancel={() => postMsg({ type: "cancel" })}
      />
    );
  }

  return (
    <MainScreen
      linked={linked}
      isDirty={isDirty}
      projectSlug={projectSlug}
      projects={projects}
      allLanguages={allLanguages}
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
      onCreateProject={createProject}
      onCheckSlugAvailable={checkSlugAvailable}
      onUnlinkFile={unlinkFile}
      onLogout={forceLogout}
      onCreateKey={createKey}
      onSync={syncKeys}
      onUndoChanges={undoLocalKeyChanges}
      onNotify={notify}
    />
  );
}
