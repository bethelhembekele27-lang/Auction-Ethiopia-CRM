import { api } from "./client";

// GET /api/escalations — server scopes by role, no client filtering needed
export function listEscalations() {
  return api.get("/escalations");
}

// POST /api/escalations — only from an Urgent inquiry; prefer
// api/inquiries.js escalateInquiry() which hits the nested route instead.
export function createEscalation(data) {
  return api.post("/escalations", data);
}

// PATCH /api/escalations/:id/resolve — auction_manager / administrator only
export function resolveEscalation(id, resolutionNote) {
  return api.patch(/escalations/${id}/resolve, { resolutionNote });
}