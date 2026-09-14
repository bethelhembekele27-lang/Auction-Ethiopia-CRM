import { api } from "./client";

export function listPickups(filters = {}) {
  const { status } = filters;
  return api.get("/pickups", { status });
}
export function createPickup(data) {
  return api.post("/pickups", data);
}
export function updatePickup(id, data) {
  return api.patch(`/pickups/${id}`, data);
}
export function deletePickup(id) {
  return api.del(`/pickups/${id}`);
}
export function sendConfirmation(id) {
  return api.post(`/pickups/${id}/send-confirmation/`);
}