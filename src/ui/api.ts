import type { PluginConfig } from "./types";

// JWT helpers
function decodeJwtPayload(token: string): { exp?: number } {
  let b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return JSON.parse(atob(b64));
}

export function isTokenExpired(token: string): boolean {
  try {
    const p = decodeJwtPayload(token);
    if (!p.exp) return false;
    return Date.now() >= p.exp * 1000 - 60_000;
  } catch {
    return false;
  }
}

// Supabase token helpers
export async function refreshAccessToken(
  cfg: PluginConfig,
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.figmaClientId,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function exchangeCodeForTokens(
  cfg: PluginConfig,
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.callbackUrl,
      code_verifier: codeVerifier,
      client_id: cfg.figmaClientId,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// API wrapper with 401 auto-refresh
export type TokenState = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type ApiOptions = {
  cfg: PluginConfig;
  tokens: TokenState;
  onTokensRefreshed: (access: string, refresh: string) => void;
  onForceLogout: () => void;
};

async function doRequest(cfg: PluginConfig, method: string, path: string, body: unknown, token: string) {
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(`${cfg.apiBaseUrl}${path}`, opts);
}

export async function api(
  method: string,
  path: string,
  body: unknown,
  options: ApiOptions
): Promise<unknown> {
  const { cfg, tokens, onTokensRefreshed, onForceLogout } = options;

  if (!tokens.accessToken) {
    onForceLogout();
    throw new Error("No access token.");
  }

  let res = await doRequest(cfg, method, path, body, tokens.accessToken);

  if (res.status === 401) {
    if (!tokens.refreshToken) {
      onForceLogout();
      throw new Error("Session expired. Please sign in again.");
    }
    try {
      const newTokens = await refreshAccessToken(cfg, tokens.refreshToken);
      onTokensRefreshed(newTokens.access_token, newTokens.refresh_token);
      res = await doRequest(cfg, method, path, body, newTokens.access_token);
    } catch {
      onForceLogout();
      throw new Error("Session expired. Please sign in again.");
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}
