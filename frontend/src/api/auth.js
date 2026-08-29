import { api } from "./client";

// POST /api/auth/login -> { token, user }
export function login(username, password) {
  return api.post("/auth/login", { username, password });
}

// POST /api/auth/google -> { token, user }
// id_token comes from Google Identity Services' callback (response.credential).
// Same response shape as regular login — the backend only accepts Google
// accounts whose email matches an existing Employee record; it never
// auto-creates an account. A rejected sign-in comes back as a normal
// ApiError with status 401 and a message, same as bad username/password.
export function loginWithGoogle(idToken) {
  return api.post("/auth/google", { id_token: idToken });
}

// POST /api/auth/logout -> 204
export function logout() {
  return api.post("/auth/logout");
}

// PATCH /api/auth/me — Account Settings modal (username and/or password)
export function updateMe({ username, password }) {
  return api.patch("/auth/me", { username, password });
}