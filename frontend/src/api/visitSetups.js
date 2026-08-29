import { api } from "./client";

export function listVisitSetups(q) {
  return api.get("/visit-setups", { q });
}

export function createVisitSetup(data) {
  return api.post("/visit-setups", data);
}

export function updateVisitSetup(id, data) {
  return api.patch(`/visit-setups/${id}`, data);
}