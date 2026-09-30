import { api } from "./client";

// Preview/import deliberately send only invoice NUMBERS, never row data —
// the backend re-fetches from PFM to resolve them, so a tampered browser
// can't invent a winner.
export const preview = (since) => api.post("/pfm/preview/", { since });
export const importWinners = (invoiceNumbers, since) => api.post("/pfm/import/", { invoiceNumbers, since });
export const listWinners = () => api.get("/pfm/winners/");
export const toggleSkip = (id) => api.post(`/pfm/winners/${id}/skip/`);
export const schedulePickup = (id, data) => api.post(`/pfm/winners/${id}/schedule-pickup/`, data);
