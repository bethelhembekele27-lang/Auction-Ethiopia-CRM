import { api } from "./client";

export function listInquiries(filters = {}) {
  const { category, priority, status, operator, q } = filters;
  return api.get("/inquiries", { category, priority, status, operator, q });
}

export function getInquiry(id) {
  return api.get(`/inquiries/${id}`);
}

export function createInquiry(data) {
  return api.post("/inquiries", data);
}

export function updateInquiry(id, data) {
  return api.patch(`/inquiries/${id}`, data);
}

export function createFollowupFromInquiry(inquiryId, data) {
  return api.post(`/inquiries/${inquiryId}/followups`, data);
}

export function escalateInquiry(inquiryId, note) {
  return api.post(`/inquiries/${inquiryId}/escalate`, { note });
}

export function createVisitationFromInquiry(inquiryId, data) {
  return api.post(`/inquiries/${inquiryId}/visitations`, data);
}

export function createComplaintFromInquiry(inquiryId, data) {
  return api.post(`/inquiries/${inquiryId}/complaints`, data);
}
export function deleteInquiry(id) {
  return api.del(`/inquiries/${id}`);
}

export function uploadAttachment(inquiryId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return api.postForm(`/inquiries/${inquiryId}/attachments`, formData);
}

export function deleteAttachment(inquiryId, attachmentId) {
  return api.del(`/inquiries/${inquiryId}/attachments/${attachmentId}`);
} 