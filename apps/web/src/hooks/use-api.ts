"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUpload, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

export function useApi<T>(path: string | null) {
  const { apiKey, impersonating } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  const fetchData = useCallback(async (isInitial: boolean) => {
    if (!path || !apiKey) return;
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const res = await api<T>(path, {
        apiKey,
        impersonateTenant: impersonating?.tenantId,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [path, apiKey, impersonating?.tenantId]);

  const refetch = useCallback(() => fetchData(false), [fetchData]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  return { data, error, loading, refetch };
}

/** Returns api() and apiUpload() pre-bound with the current apiKey + impersonation context. */
export function useApiCall() {
  const { apiKey, impersonating } = useAuth();
  const tenantId = impersonating?.tenantId;

  return useMemo(() => ({
    call: <T>(path: string, opts: { method?: string; body?: unknown } = {}) =>
      api<T>(path, { ...opts, apiKey: apiKey!, impersonateTenant: tenantId }),
    upload: <T>(path: string, file: File) =>
      apiUpload<T>(path, file, { apiKey: apiKey!, impersonateTenant: tenantId }),
  }), [apiKey, tenantId]);
}
