import { api } from "./client";

// GET /api/complaints?status=
export function listComplaints(status) {
  return api.get("/complaints", { status });
}

// POST /api/complaints — callerName and description required
export function createComplaint(data) {
  return api.post("/complaints", data);
}

// PATCH /api/complaints/:id
export function updateComplaint(id, data) {
  return api.patch(/complaints/${id}, data);
}