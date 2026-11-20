"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Session-token persistence: the SPA keeps the signed session token in localStorage and
 * echoes it as `Authorization: Bearer` on every API call. This keeps the user signed in even
 * when the HttpOnly cookie is unavailable — e.g. the app running inside a cross-site preview
 * iframe or a browser that blocks third-party cookies. The server validates both channels.
 */
const TOKEN_KEY = "ridge_session_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — cookie path still works first-party */
  }
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    // A 401 means the stored token (if any) is no longer valid — drop it so the next
    // request starts clean instead of retrying with dead credentials.
    if (res.status === 401) setStoredToken(null);
    const msg = (body as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiClientError(res.status, msg, body);
  }
  // Sign-in / location-switch responses carry a fresh token — persist it immediately.
  const maybeToken = (body as { token?: unknown } | null)?.token;
  if (typeof maybeToken === "string" && maybeToken) setStoredToken(maybeToken);
  return body as T;
}

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path),
  post: <T,>(path: string, data?: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  patch: <T,>(path: string, data?: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
  del: <T,>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

/** Data hook with loading / error / refresh. Pass `null` to skip. */
export function useApi<T>(path: string | null): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}
