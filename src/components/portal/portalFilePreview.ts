export const PORTAL_FILE_PREVIEW_EVENT = "arc-portal-file-preview";
export const PORTAL_FILE_PREVIEW_CLOSE_EVENT = "arc-portal-file-preview-close";

export function publishPortalFilePreview(active: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(PORTAL_FILE_PREVIEW_EVENT, { detail: active }),
  );
}

export function requestClosePortalFilePreview(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PORTAL_FILE_PREVIEW_CLOSE_EVENT));
}
