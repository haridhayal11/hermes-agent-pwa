"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PUSH_KINDS, type PushKind } from "@/lib/notification-kinds";

/* Web Push from the browser's side.
 *
 * iOS is the constraining platform: Safari 16.4+ only exposes push to a PWA
 * that has been added to the home screen, and only over a secure context —
 * which is why `tailscale serve` is load-bearing rather than cosmetic. In a
 * normal iOS Safari tab `window.Notification` is simply undefined, so every
 * capability here is probed rather than assumed. */

export type PushState =
  | "unsupported"    // no service worker / no Push API in this browser
  | "needs-install"  // iOS Safari tab — has to be on the home screen first
  | "unconfigured"   // the server has no VAPID keys
  | "denied"
  | "off"
  | "on";

interface ServerKey {
  configured: boolean;
  publicKey: string | null;
  subscriptions: number;
}

/* Which kinds this device wants. Server-side by necessity — the Node process
 * decides what to send and cannot read a browser's localStorage — but still
 * per device, because it lives on the push subscription row rather than in a
 * settings table. A phone and a Mac keep their own answer, which is the same
 * bargain every other preference in this app makes. */
async function fetchKinds(endpoint: string): Promise<PushKind[]> {
  try {
    const res = await fetch(
      `/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`,
    );
    if (!res.ok) return [...PUSH_KINDS];
    const body = (await res.json()) as { kinds?: unknown };
    return Array.isArray(body.kinds)
      ? PUSH_KINDS.filter((k) => (body.kinds as unknown[]).includes(k))
      : [...PUSH_KINDS];
  } catch {
    return [...PUSH_KINDS];
  }
}

/** VAPID keys travel as base64url; pushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  // Explicitly over an ArrayBuffer, not the ArrayBufferLike the constructor
  // infers: BufferSource excludes SharedArrayBuffer-backed views.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // the iOS-only legacy flag, still the truthful one in an installed PWA
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function usePush() {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverKey, setServerKey] = useState<ServerKey | null>(null);
  const [kinds, setKindsState] = useState<PushKind[]>([...PUSH_KINDS]);
  const endpointRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    // The server probe runs first so this function never touches state
    // synchronously — the effect below would otherwise cascade a render.
    let key: ServerKey | null = null;
    try {
      const res = await fetch("/api/push/key");
      key = (await res.json()) as ServerKey;
    } catch {
      key = null;
    }
    setServerKey(key);

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof window.Notification !== "undefined";

    if (!supported) {
      setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (!key?.configured) {
      setState("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");
    const existing = await registration?.pushManager.getSubscription();
    endpointRef.current = existing?.endpoint ?? null;
    if (existing) setKindsState(await fetchKinds(existing.endpoint));
    setState(existing ? "on" : "off");
  }, []);

  // Through a ref, deliberately: the mount probe must run exactly once, and
  // going via the ref keeps `refresh` out of the dependency list. Same
  // indirection useRunStream uses for its event handler.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    void refreshRef.current();
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        // the worker is served no-store, but this stops the browser using a
        // cached copy of its imports too
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const res = await fetch("/api/push/key");
      const key = (await res.json()) as ServerKey;
      if (!key.configured || !key.publicKey) {
        setState("unconfigured");
        return;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // required by Chrome, and the only mode iOS supports at all
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key.publicKey),
        }));

      const saved = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saved.ok) {
        const body = (await saved.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${saved.status}`);
      }
      setState("on");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE" },
        );
        await subscription.unsubscribe();
      }
      setState("off");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn notifications off");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const test = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `Test failed (${res.status})`);
    }
  }, []);

  /**
   * Optimistic, then corrected: the switch has to move under the thumb, and a
   * failed PATCH is answered by putting it back rather than by leaving the UI
   * claiming something the server never agreed to.
   */
  const setKinds = useCallback(async (next: PushKind[]) => {
    const endpoint = endpointRef.current;
    if (!endpoint) return;
    const previous = kinds;
    setKindsState(next);
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, kinds: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setKindsState(previous);
      setError("Could not save that switch");
    }
  }, [kinds]);

  return {
    state,
    busy,
    error,
    subscriptions: serverKey?.subscriptions ?? 0,
    kinds,
    setKinds,
    enable,
    disable,
    test,
  };
}
