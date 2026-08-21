// Central place that knows the base URL, attaches the auth token, and
// turns non-2xx responses into thrown errors. Every other file in api/
// goes through this instead of calling fetch() directly.

const BASE_URL = process.env.REACT_APP_API_BASE_URL || "/api";

function getToken() {
  return localStorage.getItem("auth_token");
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || Request failed with status ${status});
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  let url = ${BASE_URL}${path};
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (qs) url += ?${qs};
  }

  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = Bearer ${token};

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

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
};