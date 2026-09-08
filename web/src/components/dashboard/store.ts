import { useCallback, useEffect, useReducer, useState } from "react";
import type { SessionCall } from "./types.js";

const RESOURCES = {
  health: { url: "/api/health", ttl: 15000 },
  manifest: { url: "/api/manifest", ttl: 60000 },
  audit: { url: "/api/audit", ttl: 20000 },
} as const;

export type ResourceKey = keyof typeof RESOURCES;

interface CacheEntry<T> {
  data: T;
  at: number;
}

const cacheKey = (key: string) => `ag:res:${key}`;
const CALLS_KEY = "ag:calls";

function hasStorage() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

function readCache<T>(key: ResourceKey): CacheEntry<T> | null {
  if (!hasStorage()) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(key));
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: ResourceKey, data: T) {
  if (!hasStorage()) return;
  try {
    sessionStorage.setItem(cacheKey(key), JSON.stringify({ data, at: Date.now() }));
  } catch {
    return;
  }
}

const listeners: Record<string, Set<() => void>> = {};
const inflight: Partial<Record<ResourceKey, Promise<void>>> = {};

function emit(key: ResourceKey) {
  listeners[key]?.forEach((l) => l());
}

export function refresh(key: ResourceKey): Promise<void> {
  const existing = inflight[key];
  if (existing) return existing;
  const p = fetch(RESOURCES[key].url)
    .then((r) => r.json())
    .then((d) => writeCache(key, d))
    .catch(() => undefined)
    .finally(() => {
      inflight[key] = undefined;
      emit(key);
    });
  inflight[key] = p;
  return p;
}

export interface Resource<T> {
  data: T | null;
  updatedAt: number | null;
  loading: boolean;
  reload: () => void;
}

export function useResource<T>(key: ResourceKey): Resource<T> {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    (listeners[key] ??= new Set()).add(bump);
    const entry = readCache<T>(key);
    if (!entry || Date.now() - entry.at > RESOURCES[key].ttl) refresh(key);
    const timer = window.setInterval(() => refresh(key), RESOURCES[key].ttl);
    const onStorage = (e: StorageEvent) => {
      if (e.key === cacheKey(key)) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners[key].delete(bump);
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const entry = readCache<T>(key);
  return {
    data: entry ? entry.data : null,
    updatedAt: entry ? entry.at : null,
    loading: !entry,
    reload: () => refresh(key),
  };
}

export function refreshAll() {
  (Object.keys(RESOURCES) as ResourceKey[]).forEach((k) => refresh(k));
}

function readCalls(): SessionCall[] {
  if (!hasStorage()) return [];
  try {
    const raw = sessionStorage.getItem(CALLS_KEY);
    return raw ? (JSON.parse(raw) as SessionCall[]) : [];
  } catch {
    return [];
  }
}

function writeCalls(calls: SessionCall[]) {
  if (!hasStorage()) return;
  try {
    sessionStorage.setItem(CALLS_KEY, JSON.stringify(calls));
  } catch {
    return;
  }
}

export function useSessionCalls() {
  const [calls, setCalls] = useState<SessionCall[]>(readCalls);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CALLS_KEY) setCalls(readCalls());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (prev: SessionCall[]) => SessionCall[]) => {
    setCalls((prev) => {
      const next = fn(prev);
      writeCalls(next);
      return next;
    });
  }, []);

  return [calls, update] as const;
}
