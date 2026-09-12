import { api } from "./client";

// GET /api/pass/<token>/ — public, no auth token attached/needed.
export function getPass(token) {
  return api.get(`/pass/${token}/`);
}

// POST /api/pass/verify/ — public. { scannedToken, ownToken, ownRole }
export function verifyPass({ scannedToken, ownToken, ownRole }) {
  return api.post("/pass/verify/", { scannedToken, ownToken, ownRole });
}
