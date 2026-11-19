// Client-side Spotify OAuth PKCE flow (RFC 7636). No client secret required.

export const SPOTIFY_CONNECTED_EVENT = "spotify:connected";

const KEY_CLIENT_ID = "again:spotify:client_id";
const KEY_ACCESS_TOKEN = "again:spotify:token";
const KEY_REFRESH_TOKEN = "again:spotify:refresh";
const KEY_EXPIRES_AT = "again:spotify:expires";
const KEY_VERIFIER = "again:spotify:verifier";
const KEY_STATE = "again:spotify:state";

const SCOPES = [
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private"
].join(" ");

// Default central client ID for Again Radio once registered in Spotify Dashboard.
export const DEFAULT_CLIENT_ID = "";

export const getClientId = (): string =>
  (typeof localStorage !== "undefined" ? localStorage.getItem(KEY_CLIENT_ID) || DEFAULT_CLIENT_ID : DEFAULT_CLIENT_ID);
export const setClientId = (id: string): void => { if (typeof localStorage !== "undefined") localStorage.setItem(KEY_CLIENT_ID, id.trim()); };
export const isConnected = (): boolean => (typeof localStorage !== "undefined" ? Boolean(localStorage.getItem(KEY_ACCESS_TOKEN)) : false);

export function disconnect(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY_ACCESS_TOKEN);
  localStorage.removeItem(KEY_REFRESH_TOKEN);
  localStorage.removeItem(KEY_EXPIRES_AT);
}

export function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(len = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let res = "";
  for (let i = 0; i < len; i++) res += chars[bytes[i] % chars.length];
  return res;
}

export async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

export async function initiateLogin(clientIdOverride?: string): Promise<void> {
  const clientId = clientIdOverride || getClientId();
  if (!clientId) throw new Error("No Spotify Client ID configured");
  setClientId(clientId);

  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);

  sessionStorage.setItem(KEY_VERIFIER, verifier);
  sessionStorage.setItem(KEY_STATE, state);

  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri,
    state
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleCallback(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return false;

  const savedState = sessionStorage.getItem(KEY_STATE);
  const verifier = sessionStorage.getItem(KEY_VERIFIER);
  if (state !== savedState || !verifier) return false;

  params.delete("code");
  params.delete("state");
  const q = params.toString() ? `?${params.toString()}` : "";
  window.history.replaceState({}, document.title, window.location.pathname + q);

  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: "authorization_code",
    code,
    redirect_uri: window.location.origin + window.location.pathname,
    code_verifier: verifier
  });

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    saveTokens(data);
    document.dispatchEvent(new CustomEvent(SPOTIFY_CONNECTED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function saveTokens(data: { access_token: string; expires_in: number; refresh_token?: string }): void {
  localStorage.setItem(KEY_ACCESS_TOKEN, data.access_token);
  localStorage.setItem(KEY_EXPIRES_AT, String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) localStorage.setItem(KEY_REFRESH_TOKEN, data.refresh_token);
}

export async function getValidToken(): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(KEY_ACCESS_TOKEN);
  const expires = Number(localStorage.getItem(KEY_EXPIRES_AT) || 0);
  const refresh = localStorage.getItem(KEY_REFRESH_TOKEN);
  if (!token) return null;
  if (Date.now() < expires - 60_000) return token;
  if (!refresh) return null;

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: getClientId(), grant_type: "refresh_token", refresh_token: refresh }).toString()
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    saveTokens(data);
    return data.access_token;
  } catch {
    return null;
  }
}
