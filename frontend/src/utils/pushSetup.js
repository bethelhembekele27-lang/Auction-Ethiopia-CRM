import * as pushApi from "../api/push";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Call this after Notification.requestPermission() resolves to "granted".
// Registers the service worker (idempotent — safe to call every login)
// and subscribes this browser to push, sending the subscription to the backend.
export async function enablePushForThisDevice() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await pushApi.subscribe(existing);
    return;
  }

  const { publicKey } = await pushApi.getVapidPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await pushApi.subscribe(sub);
}