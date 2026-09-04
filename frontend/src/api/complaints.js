import { api } from "./client";

export function listComplaints(status) {
  return api.get("/complaints", { status });
}

export function createComplaint(data) {
  return api.post("/complaints", data);
}

export function updateComplaint(id, data) {
  return api.patch(`/complaints/${id}`, data);
}

export function deleteComplaint(id) {
  return api.del(`/complaints/${id}`);
}