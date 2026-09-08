import { api } from "./client";

export function getVapidPublicKey() {
  return api.get("/push/vapid-public-key/");
}
export function subscribe(subscription) {
  return api.post("/push/subscribe/", subscription.toJSON());
}
export function unsubscribe(endpoint) {
  return api.post("/push/unsubscribe/", { endpoint });
}