import { api } from "./client";

export function listAppointments(filters = {}) {
  const { status, auction } = filters;
  return api.get("/appointments", { status, auction });
}

export function createAppointment(data) {
  return api.post("/appointments", data);
}

export function updateAppointment(id, data) {
  return api.patch(`/appointments/${id}`, data);
}