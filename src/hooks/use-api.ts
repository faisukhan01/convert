"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiClientError(res.status, msg, body);
  }
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
