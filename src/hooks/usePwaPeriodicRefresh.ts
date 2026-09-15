"use client";

import { useEffect, useRef } from "react";

/** Re-sincroniza datos sin recargar la página. */
const SOFT_SYNC_MS = 3 * 60 * 1000;

/**
 * Mantiene datos frescos con soft-sync periódico y al volver a la pestaña.
 * No hace hard reload: un `location.reload()` reseteaba el estado en memoria
 * (p. ej. activeView → chats) y expulsaba al usuario de Tickets/Residentes.
 */
export function usePwaPeriodicRefresh(
  enabled: boolean,
  onSoftSync: () => void
): void {
  const onSoftSyncRef = useRef(onSoftSync);
  onSoftSyncRef.current = onSoftSync;

  useEffect(() => {
    if (!enabled) return;

    const runSoftSync = () => onSoftSyncRef.current();

    runSoftSync();
    const softTimer = window.setInterval(runSoftSync, SOFT_SYNC_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runSoftSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(softTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
