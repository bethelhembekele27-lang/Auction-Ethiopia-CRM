import { api } from "./client";

// POST /api/auth/login -> { token, user }
export function login(username, password) {
  return api.post("/auth/login/", { username, password });
}

// POST /api/auth/google -> { token, user }
// id_token comes from Google Identity Services' callback (response.credential).
// Same response shape as regular login — the backend only accepts Google
// accounts whose email matches an existing Employee record; it never
// auto-creates an account. A rejected sign-in comes back as a normal
// ApiError with status 401 and a message, same as bad username/password.
export function loginWithGoogle(idToken) {
  return api.post("/auth/google/", { id_token: idToken });
}

// POST /api/auth/logout -> 204
export function logout() {
  return api.post("/auth/logout/");
}

// PATCH /api/account/username/ — Account Settings modal, display name only.
export function updateUsername(username) {
  return api.patch("/account/username/", { username });
}

// PATCH /api/account/change-password/ — Account Settings modal, requires
// the current password so a left-open session can't lock the real owner
// out just by holding a valid token.
export function changePassword(oldPassword, newPassword) {
  return api.patch("/account/change-password/", { oldPassword, newPassword });
}