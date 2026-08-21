import { api } from "./client";

// POST /api/auth/login -> { token, user }
export function login(username, password) {
  return api.post("/auth/login", { username, password });
}

// POST /api/auth/logout -> 204
export function logout() {
  return api.post("/auth/logout");
}

// PATCH /api/auth/me — Account Settings modal (username and/or password)
export function updateMe({ username, password }) {
  return api.patch("/auth/me", { username, password });
}