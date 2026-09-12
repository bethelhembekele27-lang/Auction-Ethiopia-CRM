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
export function deleteAppointment(id) {
  return api.del(`/appointments/${id}`);
}

// POST /api/appointments/<id>/send-confirmation/ — manual trigger only,
// never called automatically on create. Sends the visitor SMS (always)
// and the guide SMS (only if a guide phone is on file), and returns a
// small status summary for each: { message, visitor: {status, detail},
// guide: {status, detail} | null }.
export function sendConfirmation(id) {
  return api.post(`/appointments/${id}/send-confirmation/`);
}