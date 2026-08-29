import { api } from "./client";

export function listEscalations() {
  return api.get("/escalations");
}

export function createEscalation(data) {
  return api.post("/escalations", data);
}

export function resolveEscalation(id, resolutionNote) {
  return api.patch(`/escalations/${id}/resolve`, { resolutionNote });
}