"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${version}`).catch(() => {});
  }, []);

  return null;
}
