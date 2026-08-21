import { api } from "./client";

// GET /api/notifications
// Server-computed from follow-ups + escalations for the current session
// (API_SPEC.md §9) — replaces buildNotifications() in hooks/useNotifications.js
export function listNotifications() {
  return api.get("/notifications");
}