import { api } from "./client";

// GET /api/followups?operator=&status=&reminder=
export function listFollowups(filters = {}) {
  const { operator, status, reminder } = filters;
  return api.get("/followups", { operator, status, reminder });
}

// POST /api/followups
export function createFollowup(data) {
  return api.post("/followups", data);
}

// PATCH /api/followups/:id
export function updateFollowup(id, data) {
  return api.patch(/followups/${id}, data);
}