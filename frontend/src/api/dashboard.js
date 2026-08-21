import { api } from "./client";

// GET /api/dashboard/summary
export function getDashboardSummary() {
  return api.get("/dashboard/summary");
}

// GET /api/reports?entity=inquiries|appointments|complaints&filters...&format=json|csv|pdf
// Administrator-only.
export function getReport(entity, filters = {}) {
  return api.get("/reports", { entity, ...filters });
}