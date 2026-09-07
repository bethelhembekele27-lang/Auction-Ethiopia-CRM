// Central place that knows the base URL, attaches the auth token, and
// turns non-2xx responses into thrown errors. Every other file in api/
// goes through this instead of calling fetch() directly.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken() {
  return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    // A 401 means the token we sent (if any) is missing/invalid/expired —
    // clear it out and tell the app shell to drop back to the Login
    // screen, rather than leaving a dead token in storage that will just
    // 401 again on every subsequent call. This is also what lets restored
    // sessions (see App.jsx's session-restore-on-mount) self-heal if the
    // stored token turns out to be stale: the first real API call fails,
    // this fires, and the person is cleanly returned to Login instead of
    // sitting on a broken "logged in" screen with no data.
    if (res.status === 401) {
      localStorage.removeItem("auth_token");
      sessionStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      sessionStorage.removeItem("auth_user");
      window.dispatchEvent(new Event("auth:expired"));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}



async function requestForm(path, formData) {
  const url = `${BASE_URL}${path}`;
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: formData });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path, params) => request(path, { method: "GET", params }),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  del: (path) => request(path, { method: "DELETE" }),
  postForm: (path, formData) => requestForm(path, formData),
};