import { api } from "./client";

// Preview/import deliberately send only invoice NUMBERS, never row data —
// the backend re-fetches from PFM to resolve them, so a tampered browser
// can't invent a winner. Import creates real Pickups; the operator then fills
// in the collection date on the Pickups page.
export const preview = () => api.post("/pfm/preview/", {});
export const importWinners = (invoiceNumbers) => api.post("/pfm/import/", { invoiceNumbers });