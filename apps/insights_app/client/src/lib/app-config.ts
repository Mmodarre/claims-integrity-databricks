import { useEffect, useState } from 'react';

export interface AppConfig {
  genie: { configured: boolean; alias: string; executionIdentity: 'user' | 'service_principal' };
  scans: { imageProcessing: boolean };
  appName: string;
}

export interface WhoAmI {
  email: string | null;
  user: string | null;
  preferredUsername: string | null;
}

const cache = new Map<string, Promise<unknown>>();

function fetchJsonOnce<T>(url: string): Promise<T> {
  let pending = cache.get(url) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} returned ${r.status}`);
      return r.json() as Promise<T>;
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

function useJson<T>(url: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    fetchJsonOnce<T>(url)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

export const useAppConfig = () => useJson<AppConfig>('/api/app-config');
export const useWhoAmI = () => useJson<WhoAmI>('/api/whoami');
