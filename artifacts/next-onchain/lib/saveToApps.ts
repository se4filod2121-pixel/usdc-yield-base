const SEEN_KEY = "onbase_save_cta_seen";

export function hasSeenSaveCta(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markSaveCtaSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "true");
  } catch {
    // localStorage unavailable (private mode, etc.) — nothing to persist
  }
}

// `sdk.actions.addFrame()` talks to the mini-app host over postMessage and
// never resolves when there's no host listening — which is the case for a
// plain browser tab, since window.parent === window there. Only Base App /
// Farcaster clients actually embed this page (iframe on web, a WebView on
// native), so that's the only context where calling into the SDK is safe.
export function isEmbeddedMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.parent !== window || Boolean((window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView);
  } catch {
    // Cross-origin parent access can throw in some embeddings — that access
    // itself only happens inside an iframe, so treat it as embedded.
    return true;
  }
}

// Resolves true once the host confirms the frame was added. Rejects (caught
// below) if the user declines, or if this domain has no registered frame
// manifest (`/.well-known/farcaster.json`) yet — both are normal, expected
// outcomes here, not bugs.
export async function addFrameToBaseApp(): Promise<boolean> {
  try {
    const { default: sdk } = await import("@farcaster/frame-sdk");
    await sdk.actions.addFrame();
    return true;
  } catch (err) {
    console.error("[saveToApps] addFrame failed:", err);
    return false;
  }
}
