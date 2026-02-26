"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useEventSource(
  onEvent: (event: string, data: unknown) => void,
) {
  const { apiKey, impersonating } = useAuth();
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!apiKey) return;

    let url = `${API_BASE}/api/events?token=${encodeURIComponent(apiKey)}`;
    if (impersonating?.tenantId) {
      url += `&impersonateTenant=${encodeURIComponent(impersonating.tenantId)}`;
    }
    const es = new EventSource(url);

    es.addEventListener("job_update", (e) => {
      try {
        callbackRef.current("job_update", JSON.parse(e.data));
      } catch {
        // ignore malformed data
      }
    });

    // Reconnect on error (EventSource auto-reconnects, but we log it)
    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => es.close();
  }, [apiKey, impersonating?.tenantId]);
}
