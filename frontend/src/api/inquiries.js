import { api } from "./client";

// GET /api/inquiries?category=&priority=&status=&operator=&q=
export function listInquiries(filters = {}) {
  const { category, priority, status, operator, q } = filters;
  return api.get("/inquiries", { category, priority, status, operator, q });
}

// GET /api/inquiries/:id
export function getInquiry(id) {
  return api.get(/inquiries/${id});
}

// POST /api/inquiries
export function createInquiry(data) {
  return api.post("/inquiries", data);
}

// PATCH /api/inquiries/:id
export function updateInquiry(id, data) {
  return api.patch(/inquiries/${id}, data);
}

// --- Actions raised FROM an inquiry (API_SPEC.md §3) ---

// POST /api/inquiries/:id/followups
export function createFollowupFromInquiry(inquiryId, data) {
  return api.post(/inquiries/${inquiryId}/followups, data);
}

// POST /api/inquiries/:id/escalate — only when the inquiry's priority is "Urgent"
export function escalateInquiry(inquiryId, note) {
  return api.post(/inquiries/${inquiryId}/escalate, { note });
}

// POST /api/inquiries/:id/visitations
export function createVisitationFromInquiry(inquiryId, data) {
  return api.post(/inquiries/${inquiryId}/visitations, data);
}

// POST /api/inquiries/:id/complaints
export function createComplaintFromInquiry(inquiryId, data) {
  return api.post(/inquiries/${inquiryId}/complaints, data);
}