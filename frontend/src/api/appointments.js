import { api } from "./client";

// GET /api/appointments?status=&auction=
export function listAppointments(filters = {}) {
  const { status, auction } = filters;
  return api.get("/appointments", { status, auction });
}

// POST /api/appointments
// Server auto-creates the linked day-after follow-up — don't also create
// one client-side once this is wired up.
export function createAppointment(data) {
  return api.post("/appointments", data);
}

// PATCH /api/appointments/:id
export function updateAppointment(id, data) {
  return api.patch(/appointments/${id}, data);
}