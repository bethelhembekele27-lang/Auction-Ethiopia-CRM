import { api } from "./client";

// GET /api/audit?from=&to=&user=&action=
// administrator and auction_manager only
export function listAuditLog(filters = {}) {
  const { from, to, user, action } = filters;
  return api.get("/audit", { from, to, user, action });
}
export function clearAuditLog() {
  return api.del("/audit/clear/");
}