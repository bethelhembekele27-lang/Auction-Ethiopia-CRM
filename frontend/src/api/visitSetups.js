import { api } from "./client";

// GET /api/visit-setups?q=
export function listVisitSetups(q) {
  return api.get("/visit-setups", { q });
}

// POST /api/visit-setups
export function createVisitSetup(data) {
  return api.post("/visit-setups", data);
}

// PATCH /api/visit-setups/:id
export function updateVisitSetup(id, data) {
  return api.patch(/visit-setups/${id}, data);
}