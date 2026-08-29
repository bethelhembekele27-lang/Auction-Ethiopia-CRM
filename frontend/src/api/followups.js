import { api } from "./client";

export function listFollowups(filters = {}) {
  const { operator, status, reminder } = filters;
  return api.get("/followups", { operator, status, reminder });
}

export function createFollowup(data) {
  return api.post("/followups", data);
}

export function updateFollowup(id, data) {
  return api.patch(`/followups/${id}`, data);
}